const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { checkPeriodLock } = require('../middleware/period-lock');
const { validate, ecommerceSaleSchema } = require('../middleware/validator');
const { logAudit } = require('../middleware/audit');
const { VAT_RATE } = require('../constants');

const ALL_FIELDS = [
  'company_id','period_id','platform','store_name','order_date','order_no',
  'platform_sales','shipping_income','discounts','platform_refunds','other_income',
  'platform_fees','advertising_fees','shipping_fees','cost_of_goods',
  'rental_fees','salary_fees','warehouse_fees','other_expenses',
  'import_vat_paid','import_duty_paid','actual_received',
  'is_vat_inclusive','vat_rate','collection_status','tax_invoice_issued','notes',
];

// GET /api/ecommerce/sales?company_id=xx&period_id=xx  → 返回多条列表
router.get('/sales', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    }
    const result = await pool.query(
      'SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 ORDER BY order_date, id',
      [company_id, period_id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// POST /api/ecommerce/sales → 新增一条记录
router.post('/sales', checkPeriodLock, validate(ecommerceSaleSchema), async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    }

    const vals = {
      platform: req.body.platform || '',
      store_name: req.body.store_name || '',
      order_date: req.body.order_date || null,
      order_no: req.body.order_no || '',
      platform_sales: parseFloat(req.body.platform_sales) || 0,
      shipping_income: parseFloat(req.body.shipping_income) || 0,
      discounts: parseFloat(req.body.discounts) || 0,
      platform_refunds: parseFloat(req.body.platform_refunds) || 0,
      other_income: parseFloat(req.body.other_income) || 0,
      platform_fees: parseFloat(req.body.platform_fees) || 0,
      advertising_fees: parseFloat(req.body.advertising_fees) || 0,
      shipping_fees: parseFloat(req.body.shipping_fees) || 0,
      cost_of_goods: parseFloat(req.body.cost_of_goods) || 0,
      rental_fees: parseFloat(req.body.rental_fees) || 0,
      salary_fees: parseFloat(req.body.salary_fees) || 0,
      warehouse_fees: parseFloat(req.body.warehouse_fees) || 0,
      other_expenses: parseFloat(req.body.other_expenses) || 0,
      import_vat_paid: parseFloat(req.body.import_vat_paid) || 0,
      import_duty_paid: parseFloat(req.body.import_duty_paid) || 0,
      actual_received: parseFloat(req.body.actual_received) || 0,
      is_vat_inclusive: req.body.is_vat_inclusive !== false,
      vat_rate: parseFloat(req.body.vat_rate) || VAT_RATE,
      collection_status: req.body.collection_status || 'uncollected',
      tax_invoice_issued: req.body.tax_invoice_issued === true,
      notes: req.body.notes || '',
    };

    // Auto-calc VAT
    const gross = vals.platform_sales - vals.platform_refunds;
    if (vals.is_vat_inclusive) {
      vals.vat_sales_calculated = Math.round((gross - gross / (1 + vals.vat_rate)) * 100) / 100;
    } else {
      vals.vat_sales_calculated = Math.round(gross * vals.vat_rate * 100) / 100;
    }
    const deductible = vals.platform_fees + vals.advertising_fees + vals.shipping_fees + vals.cost_of_goods;
    vals.vat_purchases_calculated = Math.round((deductible / (1 + vals.vat_rate) * vals.vat_rate + vals.import_vat_paid) * 100) / 100;

    const fields = [...ALL_FIELDS, 'vat_sales_calculated', 'vat_purchases_calculated'];
    const placeholders = fields.map((_, i) => `$${i + 1}`).join(',');
    const sql = `INSERT INTO ecommerce_sales (${fields.join(',')}) VALUES (${placeholders}) RETURNING *`;

    const result = await pool.query(sql, [
      company_id, period_id,
      vals.platform, vals.store_name, vals.order_date, vals.order_no,
      vals.platform_sales, vals.shipping_income, vals.discounts, vals.platform_refunds, vals.other_income,
      vals.platform_fees, vals.advertising_fees, vals.shipping_fees, vals.cost_of_goods,
      vals.rental_fees, vals.salary_fees, vals.warehouse_fees, vals.other_expenses,
      vals.import_vat_paid, vals.import_duty_paid, vals.actual_received,
      vals.is_vat_inclusive, vals.vat_rate, vals.collection_status, vals.tax_invoice_issued, vals.notes,
      vals.vat_sales_calculated, vals.vat_purchases_calculated,
    ]);

    logAudit({ company_id, action: 'create', entity_type: 'ecommerce_sales', entity_id: result.rows[0].id, description: `新增电商销售记录 (订单号:${vals.order_no || '-'})`, new_value: vals, req });
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/ecommerce/sales/:id → 更新单条
router.put('/sales/:id', checkPeriodLock, validate(ecommerceSaleSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const existing = await pool.query('SELECT * FROM ecommerce_sales WHERE id=$1', [id]);
    if (!existing.rows.length) return res.status(404).json({ error: '记录不存在' });

    const vals = {
      platform: req.body.platform || '',
      store_name: req.body.store_name || '',
      order_date: req.body.order_date || null,
      order_no: req.body.order_no || '',
      platform_sales: parseFloat(req.body.platform_sales) || 0,
      shipping_income: parseFloat(req.body.shipping_income) || 0,
      discounts: parseFloat(req.body.discounts) || 0,
      platform_refunds: parseFloat(req.body.platform_refunds) || 0,
      other_income: parseFloat(req.body.other_income) || 0,
      platform_fees: parseFloat(req.body.platform_fees) || 0,
      advertising_fees: parseFloat(req.body.advertising_fees) || 0,
      shipping_fees: parseFloat(req.body.shipping_fees) || 0,
      cost_of_goods: parseFloat(req.body.cost_of_goods) || 0,
      rental_fees: parseFloat(req.body.rental_fees) || 0,
      salary_fees: parseFloat(req.body.salary_fees) || 0,
      warehouse_fees: parseFloat(req.body.warehouse_fees) || 0,
      other_expenses: parseFloat(req.body.other_expenses) || 0,
      import_vat_paid: parseFloat(req.body.import_vat_paid) || 0,
      import_duty_paid: parseFloat(req.body.import_duty_paid) || 0,
      actual_received: parseFloat(req.body.actual_received) || 0,
      is_vat_inclusive: req.body.is_vat_inclusive !== false,
      vat_rate: parseFloat(req.body.vat_rate) || VAT_RATE,
      collection_status: req.body.collection_status || 'uncollected',
      tax_invoice_issued: req.body.tax_invoice_issued === true,
      notes: req.body.notes || '',
    };

    const gross = vals.platform_sales - vals.platform_refunds;
    if (vals.is_vat_inclusive) {
      vals.vat_sales_calculated = Math.round((gross - gross / (1 + vals.vat_rate)) * 100) / 100;
    } else {
      vals.vat_sales_calculated = Math.round(gross * vals.vat_rate * 100) / 100;
    }
    const deductible = vals.platform_fees + vals.advertising_fees + vals.shipping_fees + vals.cost_of_goods;
    vals.vat_purchases_calculated = Math.round((deductible / (1 + vals.vat_rate) * vals.vat_rate + vals.import_vat_paid) * 100) / 100;

    const setClauses = [
      'platform=$1','store_name=$2','order_date=$3','order_no=$4',
      'platform_sales=$5','shipping_income=$6','discounts=$7','platform_refunds=$8','other_income=$9',
      'platform_fees=$10','advertising_fees=$11','shipping_fees=$12','cost_of_goods=$13',
      'rental_fees=$14','salary_fees=$15','warehouse_fees=$16','other_expenses=$17',
      'import_vat_paid=$18','import_duty_paid=$19','actual_received=$20',
      'is_vat_inclusive=$21','vat_rate=$22','collection_status=$23','tax_invoice_issued=$24','notes=$25',
      'vat_sales_calculated=$26','vat_purchases_calculated=$27',
    ].join(',');

    const result = await pool.query(
      `UPDATE ecommerce_sales SET ${setClauses} WHERE id=$28 RETURNING *`,
      [
        vals.platform, vals.store_name, vals.order_date, vals.order_no,
        vals.platform_sales, vals.shipping_income, vals.discounts, vals.platform_refunds, vals.other_income,
        vals.platform_fees, vals.advertising_fees, vals.shipping_fees, vals.cost_of_goods,
        vals.rental_fees, vals.salary_fees, vals.warehouse_fees, vals.other_expenses,
        vals.import_vat_paid, vals.import_duty_paid, vals.actual_received,
        vals.is_vat_inclusive, vals.vat_rate, vals.collection_status, vals.tax_invoice_issued, vals.notes,
        vals.vat_sales_calculated, vals.vat_purchases_calculated,
        id,
      ]
    );

    logAudit({ company_id: existing.rows[0].company_id, action: 'update', entity_type: 'ecommerce_sales', entity_id: parseInt(id), description: `编辑电商销售记录`, new_value: vals, req });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/ecommerce/sales/:id → 删除单条
router.delete('/sales/:id', checkPeriodLock, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM ecommerce_sales WHERE id=$1 RETURNING *', [id]);
    if (!result.rows.length) return res.status(404).json({ error: '记录不存在' });
    logAudit({ company_id: result.rows[0].company_id, action: 'delete', entity_type: 'ecommerce_sales', entity_id: parseInt(id), description: '删除电商销售记录', old_value: result.rows[0], req });
    res.json({ message: '删除成功', deleted: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/ecommerce/calculate → VAT 试算（前端即时用）
router.post('/calculate', async (req, res, next) => {
  try {
    const { platform_sales, platform_refunds, platform_fees, advertising_fees, shipping_fees, cost_of_goods, import_vat_paid, is_vat_inclusive, vat_rate } = req.body;
    const gross = parseFloat(platform_sales || 0) - parseFloat(platform_refunds || 0);
    const rate = parseFloat(vat_rate) || VAT_RATE;
    const inclusive = is_vat_inclusive !== false;

    let netExVat, vatSales;
    if (inclusive) {
      netExVat = Math.round(gross / (1 + rate) * 100) / 100;
      vatSales = Math.round((gross - netExVat) * 100) / 100;
    } else {
      vatSales = Math.round(gross * rate * 100) / 100;
      netExVat = gross;
    }

    const deductible = parseFloat(platform_fees || 0) + parseFloat(advertising_fees || 0) + parseFloat(shipping_fees || 0) + parseFloat(cost_of_goods || 0);
    const vatPurchases = Math.round((deductible / (1 + rate) * rate + parseFloat(import_vat_paid || 0)) * 100) / 100;

    res.json({ gross_sales: gross, net_sales_ex_vat: netExVat, vat_sales: vatSales, vat_purchases: vatPurchases, net_vat: Math.round((vatSales - vatPurchases) * 100) / 100 });
  } catch (err) { next(err); }
});

// POST /api/ecommerce/compliance
router.post('/compliance', checkPeriodLock, async (req, res, next) => {
  try {
    const { company_id, vat_registered, monthly_sales } = req.body;
    if (!company_id || !Array.isArray(monthly_sales)) return res.status(400).json({ error: '缺少参数' });
    const totalSales = monthly_sales.reduce((s, m) => s + (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)), 0);
    const monthsActive = monthly_sales.filter(m => (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)) > 0).length;
    const annualizedRevenue = monthsActive > 0 ? (totalSales / monthsActive) * 12 : 0;
    const THRESHOLD = 1800000;
    const exceeds = annualizedRevenue > THRESHOLD;
    let monthsOverdue = 0, cumulativeRevenue = 0, overdueStarted = false;
    for (const m of monthly_sales) {
      cumulativeRevenue += (parseFloat(m.platform_sales || 0) - parseFloat(m.platform_refunds || 0)) / (1 + VAT_RATE);
      if (cumulativeRevenue > THRESHOLD && !vat_registered && !overdueStarted) overdueStarted = true;
      if (overdueStarted) monthsOverdue++;
    }
    const excessRevenue = Math.max(0, cumulativeRevenue - THRESHOLD);
    const estimatedVatOwed = Math.round(excessRevenue * VAT_RATE * 100) / 100;
    const estimatedSurcharge = Math.round(estimatedVatOwed * monthsOverdue * 1.5) / 100;
    const totalLiability = estimatedVatOwed + estimatedSurcharge + estimatedVatOwed;
    const result = await pool.query(
      `INSERT INTO vat_compliance (company_id, check_date, vat_registered, annualized_revenue, exceeds_threshold, months_overdue, estimated_vat_owed, estimated_surcharge, estimated_fine, total_estimated_liability, status)
       VALUES ($1, CURRENT_DATE, $2, $3, $4, $5, $6, $7, $8, $9, 'completed') RETURNING *`,
      [company_id, vat_registered || false, Math.round(annualizedRevenue * 100) / 100, exceeds, monthsOverdue, estimatedVatOwed, estimatedSurcharge, estimatedVatOwed, totalLiability]
    );
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.get('/compliance', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });
    const result = await pool.query('SELECT * FROM vat_compliance WHERE company_id=$1 ORDER BY check_date DESC', [company_id]);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/template-output', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=vat_output_template.csv');
  res.send('\ufeffinvoice_date,invoice_no,customer_name,customer_tax_id,description,amount_ex_vat\n2025-12-01,INV-001,蓝鲨,,出库服务,21000\n2025-12-03,INV-002,林江伟,,出库+贴标,32000\n');
});

router.get('/template-input', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=vat_input_template.csv');
  res.send('\ufeffinvoice_date,invoice_no,supplier_name,supplier_tax_id,category,description,amount_ex_vat,deductible\n2025-12-05,SUP-001,某物业公司,0123456789012,rental,12月仓库租金,50000,true\n');
});

module.exports = router;
