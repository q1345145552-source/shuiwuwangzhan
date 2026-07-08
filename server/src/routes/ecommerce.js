const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { checkPeriodLock } = require('../middleware/period-lock');
const { validate, ecommerceSaleSchema } = require('../middleware/validator');
const { logAudit } = require('../middleware/audit');
const { VAT_RATE } = require('../constants');

// All numeric fields (existing + new)
const NUM_FIELDS = [
  'platform_sales','platform_refunds','other_income',
  'platform_fees','advertising_fees','shipping_fees',
  'cost_of_goods','rental_fees','salary_fees','warehouse_fees','other_expenses',
  'import_vat_paid','import_duty_paid',
  'vat_sales_calculated','vat_purchases_calculated',
  'shipping_income','discounts','actual_received',
];

const TEXT_FIELDS = ['platform','store_name','notes'];
const BOOL_FIELDS = ['is_vat_inclusive','tax_invoice_issued'];
const STATUS_FIELDS = ['collection_status'];

// POST /api/ecommerce/sales - Save/update ecommerce sales data
router.post('/sales', checkPeriodLock, validate(ecommerceSaleSchema), async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    }

    // Numeric values
    const numValues = NUM_FIELDS.map(k => parseFloat(req.body[k]) || 0);
    // Text values
    const textValues = TEXT_FIELDS.map(k => req.body[k] || '');
    // Bool values
    const isVatInclusive = req.body.is_vat_inclusive !== false; // default true
    const taxInvoiceIssued = req.body.tax_invoice_issued === true;
    // Status
    const collectionStatus = req.body.collection_status || 'uncollected';
    // VAT rate
    const vatRate = parseFloat(req.body.vat_rate) || VAT_RATE;

    // Build params array
    const params = [
      ...numValues,
      ...textValues,
      isVatInclusive, collectionStatus, taxInvoiceIssued,
      vatRate,
      company_id, period_id,
    ];

    // Column list
    const allFields = [...NUM_FIELDS, ...TEXT_FIELDS, 'is_vat_inclusive','collection_status','tax_invoice_issued','vat_rate'];
    const placeholders = allFields.map((_, i) => `$${i + 1}`).join(',');
    const setClauses = allFields.map((k, i) => `${k} = EXCLUDED.${k}`).join(',');

    const sql = `INSERT INTO ecommerce_sales (${allFields.join(',')}, company_id, period_id)
       VALUES (${placeholders}, $${allFields.length + 1}, $${allFields.length + 2})
       ON CONFLICT (company_id, period_id)
       DO UPDATE SET ${setClauses}
       RETURNING *`;

    const result = await pool.query(sql, params);
    const s = result.rows[0];

    // Auto-calculate VAT based on is_vat_inclusive flag
    const grossSales = parseFloat(s.platform_sales) - parseFloat(s.platform_refunds);
    let vatSales = 0;
    if (isVatInclusive) {
      // 含税 → 倒挤 VAT
      vatSales = Math.round(grossSales - grossSales / (1 + vatRate));
    } else {
      // 未税 → 直接算 VAT
      vatSales = Math.round(grossSales * vatRate * 100) / 100;
    }

    // Input VAT from deductible expenses
    const deductibleExpenses =
      parseFloat(s.platform_fees) + parseFloat(s.advertising_fees) +
      parseFloat(s.shipping_fees) + parseFloat(s.cost_of_goods);
    const vatPurchases = Math.round(
      (deductibleExpenses / (1 + vatRate) * vatRate + parseFloat(s.import_vat_paid)) * 100
    ) / 100;

    const updated = await pool.query(
      `UPDATE ecommerce_sales SET vat_sales_calculated = $1, vat_purchases_calculated = $2 WHERE id = $3 RETURNING *`,
      [vatSales, vatPurchases, s.id]
    );

    logAudit({
      company_id, action: 'upsert', entity_type: 'ecommerce_sales',
      entity_id: s.id, description: `电商销售数据保存（${company_id}/${period_id}）`,
      new_value: { platform_sales: s.platform_sales, vat_sales_calculated: vatSales },
      req
    });

    res.status(201).json(updated.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/ecommerce/sales?company_id=xx&period_id=xx
router.get('/sales', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const result = await pool.query(
      'SELECT * FROM ecommerce_sales WHERE company_id = $1 AND period_id = $2',
      [company_id, period_id]
    );
    res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (err) { next(err); }
});

// POST /api/ecommerce/calculate-vat
router.post('/calculate-vat', checkPeriodLock, async (req, res, next) => {
  try {
    const {
      platform_sales, platform_refunds,
      platform_fees, advertising_fees, shipping_fees, cost_of_goods, import_vat_paid,
      is_vat_inclusive, vat_rate,
    } = req.body;

    const gross = parseFloat(platform_sales || 0) - parseFloat(platform_refunds || 0);
    const rate = parseFloat(vat_rate) || VAT_RATE;
    const inclusive = is_vat_inclusive !== false;

    let netSalesExVat, vatSales;
    if (inclusive) {
      netSalesExVat = Math.round(gross / (1 + rate) * 100) / 100;
      vatSales = Math.round((gross - netSalesExVat) * 100) / 100;
    } else {
      vatSales = Math.round(gross * rate * 100) / 100;
      netSalesExVat = gross;
    }

    const deductible = parseFloat(platform_fees || 0) + parseFloat(advertising_fees || 0) +
      parseFloat(shipping_fees || 0) + parseFloat(cost_of_goods || 0);
    const vatPurchases = Math.round(
      (deductible / (1 + rate) * rate + parseFloat(import_vat_paid || 0)) * 100
    ) / 100;

    res.json({
      gross_sales: gross,
      net_sales_ex_vat: netSalesExVat,
      vat_sales: vatSales,
      vat_purchases: vatPurchases,
      net_vat: Math.round((vatSales - vatPurchases) * 100) / 100,
      is_vat_inclusive: inclusive,
    });
  } catch (err) { next(err); }
});

// POST /api/ecommerce/compliance
router.post('/compliance', checkPeriodLock, async (req, res, next) => {
  try {
    const { company_id, vat_registered, monthly_sales } = req.body;
    if (!company_id || !Array.isArray(monthly_sales)) {
      return res.status(400).json({ error: '缺少参数' });
    }

    const totalSales = monthly_sales.reduce(
      (s, m) => s + (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)), 0
    );
    const monthsActive = monthly_sales.filter(
      m => (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)) > 0
    ).length;
    const annualizedRevenue = monthsActive > 0 ? (totalSales / monthsActive) * 12 : 0;

    const THRESHOLD = 1800000;
    const exceeds = annualizedRevenue > THRESHOLD;

    let monthsOverdue = 0;
    let cumulativeRevenue = 0;
    let overdueStarted = false;
    for (let i = 0; i < monthly_sales.length; i++) {
      const m = monthly_sales[i];
      cumulativeRevenue += (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)) / (1 + VAT_RATE);
      if (cumulativeRevenue > THRESHOLD && !vat_registered && !overdueStarted) {
        overdueStarted = true;
      }
      if (overdueStarted) monthsOverdue++;
    }

    const excessRevenue = Math.max(0, cumulativeRevenue - THRESHOLD);
    const estimatedVatOwed = Math.round(excessRevenue * VAT_RATE * 100) / 100;
    const estimatedSurcharge = Math.round(estimatedVatOwed * monthsOverdue * 1.5) / 100;
    const estimatedFine = estimatedVatOwed;
    const totalLiability = estimatedVatOwed + estimatedSurcharge + estimatedFine;

    const result = await pool.query(
      `INSERT INTO vat_compliance (company_id, check_date, vat_registered, annualized_revenue,
        exceeds_threshold, months_overdue, estimated_vat_owed, estimated_surcharge,
        estimated_fine, total_estimated_liability, status)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, 'completed')
       RETURNING *`,
      [company_id, vat_registered || false, Math.round(annualizedRevenue * 100) / 100,
       exceeds, monthsOverdue, estimatedVatOwed, estimatedSurcharge, estimatedFine, totalLiability]
    );

    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/ecommerce/compliance?company_id=xx
router.get('/compliance', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });
    const result = await pool.query(
      'SELECT * FROM vat_compliance WHERE company_id = $1 ORDER BY check_date DESC',
      [company_id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/ecommerce/template-output
router.get('/template-output', (req, res) => {
  const csv = 'invoice_date,invoice_no,customer_name,customer_tax_id,description,amount_ex_vat\n2025-12-01,INV-001,蓝鲨,,出库服务,21000\n2025-12-03,INV-002,林江伟,,出库+贴标,32000\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=vat_output_template.csv');
  res.send(String.fromCharCode(0xFEFF) + csv);
});

// GET /api/ecommerce/template-input
router.get('/template-input', (req, res) => {
  const csv = 'invoice_date,invoice_no,supplier_name,supplier_tax_id,category,description,amount_ex_vat,deductible\n2025-12-05,SUP-001,某物业公司,0123456789012,rental,12月仓库租金,50000,true\n2025-12-10,ADV-001,Facebook,,advertising,广告费,30000,true\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=vat_input_template.csv');
  res.send(String.fromCharCode(0xFEFF) + csv);
});

module.exports = router;
