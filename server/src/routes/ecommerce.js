const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { checkPeriodLock } = require('../middleware/period-lock');
const { validate, ecommerceSaleSchema } = require('../middleware/validator');
const { logAudit } = require('../middleware/audit');

// POST /api/ecommerce/sales - Save/update ecommerce sales data
router.post('/sales', checkPeriodLock, validate(ecommerceSaleSchema), async (req, res, next) => {
  try {
    const { company_id, period_id, ...fields } = req.body;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    }

    const numKeys = [
      'platform_sales','platform_refunds','other_income',
      'platform_fees','advertising_fees','shipping_fees',
      'cost_of_goods','rental_fees','salary_fees','warehouse_fees','other_expenses',
      'import_vat_paid','import_duty_paid',
      'vat_sales_calculated','vat_purchases_calculated'
    ];

    const noteVal = fields.notes || '';
    const numValues = numKeys.map(k => parseFloat(fields[k]) || 0);
    const params = [...numValues, company_id, period_id, noteVal];

    const placeholders = numKeys.map((_, i) => `$${i + 1}`).join(',');
    const setClauses = numKeys.map((k, i) => `${k} = EXCLUDED.${k}`).join(',');

    const sql = `INSERT INTO ecommerce_sales (${numKeys.join(',')}, company_id, period_id, notes)
       VALUES (${placeholders}, $${numKeys.length + 1}, $${numKeys.length + 2}, $${numKeys.length + 3})
       ON CONFLICT (company_id, period_id)
       DO UPDATE SET ${setClauses}, notes = $${numKeys.length + 3}
       RETURNING *`;

    const result = await pool.query(sql, params);

    // Auto-calculate VAT
    const s = result.rows[0];
    // Recalculate note
    const netSales = (parseFloat(s.platform_sales) - parseFloat(s.platform_refunds)) / 1.07;
    const vatSales = Math.round(netSales * 7) / 100;

    // Input VAT from deductible expenses: platform_fees + advertising + shipping + cogs (with VAT)
    const deductibleExpenses = parseFloat(s.platform_fees) + parseFloat(s.advertising_fees) + parseFloat(s.shipping_fees) + parseFloat(s.cost_of_goods);
    const vatPurchases = Math.round((deductibleExpenses / 1.07 * 0.07 + parseFloat(s.import_vat_paid)) * 100) / 100;

    const updated = await pool.query(
      `UPDATE ecommerce_sales SET vat_sales_calculated = $1, vat_purchases_calculated = $2 WHERE id = $3 RETURNING *`,
      [vatSales, vatPurchases, s.id]
    );

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
router.post('/calculate-vat', async (req, res, next) => {
  try {
    const { company_id, period_id, platform_sales, platform_refunds, platform_fees, advertising_fees, shipping_fees, cost_of_goods, import_vat_paid } = req.body;

    const netSales = (parseFloat(platform_sales || 0) - parseFloat(platform_refunds || 0)) / 1.07;
    const vatSales = Math.round(netSales * 7) / 100;

    const deductible = parseFloat(platform_fees || 0) + parseFloat(advertising_fees || 0) + parseFloat(shipping_fees || 0) + parseFloat(cost_of_goods || 0);
    const vatPurchases = Math.round((deductible / 1.07 * 0.07 + parseFloat(import_vat_paid || 0)) * 100) / 100;

    res.json({
      net_sales_ex_vat: Math.round(netSales * 100) / 100,
      vat_sales: vatSales,
      vat_purchases: vatPurchases,
      net_vat: Math.round((vatSales - vatPurchases) * 100) / 100,
    });
  } catch (err) { next(err); }
});

// POST /api/ecommerce/compliance - VAT compliance check
router.post('/compliance', async (req, res, next) => {
  try {
    const { company_id, vat_registered, monthly_sales } = req.body;
    if (!company_id || !Array.isArray(monthly_sales)) {
      return res.status(400).json({ error: '缺少参数' });
    }

    // Calculate annualized revenue
    const totalSales = monthly_sales.reduce((s, m) => s + (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)), 0);
    const monthsActive = monthly_sales.filter(m => (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)) > 0).length;
    const annualizedRevenue = monthsActive > 0 ? (totalSales / monthsActive) * 12 : 0;

    const THRESHOLD = 1800000; // 1.8M THB
    const exceeds = annualizedRevenue > THRESHOLD;

    // Calculate months overdue
    let monthsOverdue = 0;
    let cumulativeRevenue = 0;
    let overdueStarted = false;
    for (let i = 0; i < monthly_sales.length; i++) {
      const m = monthly_sales[i];
      cumulativeRevenue += (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)) / 1.07;
      if (cumulativeRevenue > THRESHOLD && !vat_registered && !overdueStarted) {
        overdueStarted = true;
      }
      if (overdueStarted) monthsOverdue++;
    }

    // Estimate VAT owed (7% on revenue since threshold exceeded)
    const excessRevenue = Math.max(0, cumulativeRevenue - THRESHOLD);
    const estimatedVatOwed = Math.round(excessRevenue * 7) / 100;

    // Surcharge: 0.05% per day ≈ 1.5% per month
    const estimatedSurcharge = Math.round(estimatedVatOwed * monthsOverdue * 1.5) / 100;

    // Fine: 0.5x to 2x, take 1x as estimate
    const estimatedFine = estimatedVatOwed;

    const totalLiability = estimatedVatOwed + estimatedSurcharge + estimatedFine;

    // Save to compliance table
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


// GET /api/ecommerce/template-output - 销项CSV模板
router.get('/template-output', (req, res) => {
  const csv = 'invoice_date,invoice_no,customer_name,customer_tax_id,description,amount_ex_vat\n2025-12-01,INV-001,蓝鲨,,出库服务,21000\n2025-12-03,INV-002,林江伟,,出库+贴标,32000\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=vat_output_template.csv');
  res.send(String.fromCharCode(0xFEFF) + csv);
});

// GET /api/ecommerce/template-input - 进项CSV模板
router.get('/template-input', (req, res) => {
  const csv = 'invoice_date,invoice_no,supplier_name,supplier_tax_id,category,description,amount_ex_vat,deductible\n2025-12-05,SUP-001,某物业公司,0123456789012,rental,12月仓库租金,50000,true\n2025-12-10,ADV-001,Facebook,,advertising,广告费,30000,true\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=vat_input_template.csv');
  res.send(String.fromCharCode(0xFEFF) + csv);
});

module.exports = router;

