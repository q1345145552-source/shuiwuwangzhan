const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { checkPeriodLock } = require('../middleware/period-lock');
const { validate, ecommerceSaleSchema } = require('../middleware/validator');
const { logAudit } = require('../middleware/audit');
const { VAT_RATE } = require('../constants');

const NUM_FIELDS = ['platform_sales','shipping_income','discounts','platform_refunds','other_income','platform_subsidy','platform_fees','advertising_fees','shipping_fees','transaction_fee','wht_deducted','campaign_fee','affiliate_commission','cod_fee','cost_of_goods','rental_fees','salary_fees','warehouse_fees','other_expenses','import_vat_paid','import_duty_paid','actual_received'];
const TXT_FIELDS = ['platform','store_name','order_date','order_no','notes'];

function parseBody(body) {
  const v = {};
  for (const k of NUM_FIELDS) v[k] = parseFloat(body[k]) || 0;
  for (const k of TXT_FIELDS) v[k] = body[k] || (k === 'order_date' ? null : '');
  v.is_vat_inclusive = body.is_vat_inclusive !== false;
  v.vat_rate = parseFloat(body.vat_rate) || VAT_RATE;
  v.collection_status = body.collection_status || 'uncollected';
  v.tax_invoice_issued = body.tax_invoice_issued === true;
  const gross = v.platform_sales - v.platform_refunds;
  if (v.is_vat_inclusive) {
    v.vat_sales_calculated = Math.round((gross - gross / (1 + v.vat_rate)) * 100) / 100;
  } else {
    v.vat_sales_calculated = Math.round(gross * v.vat_rate * 100) / 100;
  }
  let cdArr = body.custom_deductions;
  if (typeof cdArr === 'string') {
    try { cdArr = JSON.parse(cdArr); } catch(e) { cdArr = []; }
  }
  if (!Array.isArray(cdArr)) cdArr = [];
  v.custom_deductions = JSON.stringify(cdArr);
  const customDed_VAT_inclusive = cdArr.filter(c => c.is_vat_inclusive !== false).reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const ded = v.platform_fees + v.advertising_fees + v.shipping_fees + v.transaction_fee + v.wht_deducted + v.campaign_fee + v.affiliate_commission + v.cod_fee + v.cost_of_goods + customDed_VAT_inclusive;
  v.vat_purchases_calculated = Math.round((ded / (1 + v.vat_rate) * v.vat_rate + v.import_vat_paid) * 100) / 100;
  return v;
}

// GET /api/ecommerce/sales?company_id=xx&period_id=xx
router.get('/sales', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const r = await pool.query('SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 ORDER BY order_date, id', [company_id, period_id]);
    res.json(r.rows);
  } catch (e) { next(e); }
});

// POST /api/ecommerce/sales — 新增一条
router.post('/sales', checkPeriodLock, validate(ecommerceSaleSchema), async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    const v = parseBody(req.body);
    const fields = [...TXT_FIELDS, ...NUM_FIELDS, 'is_vat_inclusive','vat_rate','collection_status','tax_invoice_issued','vat_sales_calculated','vat_purchases_calculated'];
    const cols = [...fields, 'custom_deductions', 'company_id', 'period_id'];
    const ph = cols.map((_, i) => `$${i+1}`).join(',');
    const vals = [...TXT_FIELDS.map(k => v[k]), ...NUM_FIELDS.map(k => v[k]), v.is_vat_inclusive, v.vat_rate, v.collection_status, v.tax_invoice_issued, v.vat_sales_calculated, v.vat_purchases_calculated, v.custom_deductions, company_id, period_id];
    const r = await pool.query(`INSERT INTO ecommerce_sales (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
    logAudit({ company_id, action: 'create', entity_type: 'ecommerce_sales', entity_id: r.rows[0].id, description: '新增销售记录', new_value: v, req });
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/ecommerce/sales/:id
router.put('/sales/:id', checkPeriodLock, validate(ecommerceSaleSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const old = await pool.query('SELECT * FROM ecommerce_sales WHERE id=$1', [id]);
    if (!old.rows.length) return res.status(404).json({ error: '记录不存在' });
    const v = parseBody(req.body);
    const pairs = [
      'platform=$1','store_name=$2','order_date=$3','order_no=$4','notes=$5',
      'platform_sales=$6','shipping_income=$7','discounts=$8','platform_refunds=$9','other_income=$10',
      'platform_fees=$11','advertising_fees=$12','shipping_fees=$13','cost_of_goods=$14',
      'rental_fees=$15','salary_fees=$16','warehouse_fees=$17','other_expenses=$18',
      'import_vat_paid=$19','import_duty_paid=$20','actual_received=$21',
      'is_vat_inclusive=$22','vat_rate=$23','collection_status=$24','tax_invoice_issued=$25',
      'vat_sales_calculated=$26','vat_purchases_calculated=$27','custom_deductions=$28',
    ];
    const vals = [
      v.platform, v.store_name, v.order_date, v.order_no, v.notes,
      v.platform_sales, v.shipping_income, v.discounts, v.platform_refunds, v.other_income,
      v.platform_fees, v.advertising_fees, v.shipping_fees, v.cost_of_goods,
      v.rental_fees, v.salary_fees, v.warehouse_fees, v.other_expenses,
      v.import_vat_paid, v.import_duty_paid, v.actual_received,
      v.is_vat_inclusive, v.vat_rate, v.collection_status, v.tax_invoice_issued,
      v.vat_sales_calculated, v.vat_purchases_calculated, v.custom_deductions,
      id,
    ];
    const r = await pool.query(`UPDATE ecommerce_sales SET ${pairs.join(',')} WHERE id=$${vals.length} RETURNING *`, vals);
    logAudit({ company_id: old.rows[0].company_id, action: 'update', entity_type: 'ecommerce_sales', entity_id: +id, description: '编辑销售记录', new_value: v, req });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/ecommerce/sales/:id
router.delete('/sales/:id', checkPeriodLock, async (req, res, next) => {
  try {
    const r = await pool.query('DELETE FROM ecommerce_sales WHERE id=$1 RETURNING *', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: '记录不存在' });
    logAudit({ company_id: r.rows[0].company_id, action: 'delete', entity_type: 'ecommerce_sales', entity_id: +req.params.id, description: '删除销售记录', old_value: r.rows[0], req });
    res.json({ message: '已删除', deleted: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/ecommerce/calculate — VAT 试算
router.post('/calculate', async (req, res, next) => {
  try {
    const { platform_sales, platform_refunds, platform_fees, advertising_fees, shipping_fees, cost_of_goods, import_vat_paid, is_vat_inclusive, vat_rate } = req.body;
    const gross = parseFloat(platform_sales||0) - parseFloat(platform_refunds||0);
    const rate = parseFloat(vat_rate) || VAT_RATE;
    const incl = is_vat_inclusive !== false;
    let net, vat;
    if (incl) { net = Math.round(gross/(1+rate)*100)/100; vat = Math.round((gross-net)*100)/100; }
    else { vat = Math.round(gross*rate*100)/100; net = gross; }
    const cdArr = req.body.custom_deductions || [];
    const customDedVatInc = (Array.isArray(cdArr) ? cdArr : []).filter(c => c && c.is_vat_inclusive !== false).reduce((s,c) => s + (parseFloat(c.amount)||0), 0);
    const ded = parseFloat(platform_fees||0)+parseFloat(advertising_fees||0)+parseFloat(shipping_fees||0)+parseFloat(cost_of_goods||0)+customDedVatInc;
    const vatPur = Math.round((ded/(1+rate)*rate+parseFloat(import_vat_paid||0))*100)/100;
    res.json({ gross_sales: gross, net_sales_ex_vat: net, vat_sales: vat, vat_purchases: vatPur, net_vat: Math.round((vat-vatPur)*100)/100 });
  } catch (e) { next(e); }
});

// compliance + templates (unchanged)
router.post('/compliance', checkPeriodLock, async (req, res, next) => {
  try {
    const { company_id, vat_registered, monthly_sales } = req.body;
    if (!company_id || !Array.isArray(monthly_sales)) return res.status(400).json({ error: '缺少参数' });
    const ts = monthly_sales.reduce((s,m)=>s+(parseFloat(m.platform_sales||0)-parseFloat(m.platform_refunds||0)),0);
    const ma = monthly_sales.filter(m=>(parseFloat(m.platform_sales||0)-parseFloat(m.platform_refunds||0))>0).length;
    const ar = ma>0?(ts/ma)*12:0; const TH=1800000; const exc = ar>TH;
    let mo=0, cr=0, os=false;
    for(const m of monthly_sales){cr+=(parseFloat(m.platform_sales||0)-parseFloat(m.platform_refunds||0))/(1+VAT_RATE);if(cr>TH&&!vat_registered&&!os)os=true;if(os)mo++;}
    const evo = Math.round(Math.max(0,cr-TH)*VAT_RATE*100)/100;
    const esc = Math.round(evo*mo*1.5)/100;
    const r = await pool.query(`INSERT INTO vat_compliance (company_id,check_date,vat_registered,annualized_revenue,exceeds_threshold,months_overdue,estimated_vat_owed,estimated_surcharge,estimated_fine,total_estimated_liability,status) VALUES ($1,CURRENT_DATE,$2,$3,$4,$5,$6,$7,$8,$9,'completed') RETURNING *`,
      [company_id,vat_registered||false,Math.round(ar*100)/100,exc,mo,evo,esc,evo,evo+esc+evo]);
    res.json(r.rows[0]);
  } catch(e){next(e);}
});
router.get('/compliance', async (req, res, next) => {
  try { const r = await pool.query('SELECT * FROM vat_compliance WHERE company_id=$1 ORDER BY check_date DESC',[req.query.company_id]); res.json(r.rows); } catch(e){next(e);}
});
router.get('/template-output', (req,res)=>{res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=vat_output_template.csv'});res.send('\ufeffinvoice_date,invoice_no,customer_name,customer_tax_id,description,amount_ex_vat\n2025-12-01,INV-001,蓝鲨,,出库服务,21000\n');});
router.get('/template-input', (req,res)=>{res.set({'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename=vat_input_template.csv'});res.send('\ufeffinvoice_date,invoice_no,supplier_name,supplier_tax_id,category,description,amount_ex_vat,deductible\n2025-12-05,SUP-001,某物业公司,,rental,租金,50000,true\n');});

module.exports = router;
