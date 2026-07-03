const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { checkPeriodLock } = require('../middleware/period-lock');
const { validate, expensesBatchSchema } = require('../middleware/validator');
const { logAudit } = require('../middleware/audit');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// GET /api/expenses?company_id=xx&period_id=xx&category=xx
router.get('/', async (req, res, next) => {
  try {
    const { company_id, period_id, category } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    let sql = 'SELECT * FROM expense_details WHERE company_id=$1 AND period_id=$2', params = [company_id, period_id];
    if (category && category !== 'all') { sql += ' AND category=$3'; params.push(category); }
    sql += ' ORDER BY expense_date DESC, id DESC';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/expenses/summary?company_id=xx&period_id=xx
router.get('/summary', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const result = await pool.query(
      `SELECT category, COUNT(*) as cnt, COALESCE(SUM(amount),0) as total_amount,
        COALESCE(SUM(vat_amount),0) as total_vat, COALESCE(SUM(total_amount),0) as total_inc,
        COALESCE(SUM(wht_amount),0) as total_wht, COUNT(*) FILTER (WHERE has_wht) as wht_count
       FROM expense_details WHERE company_id=$1 AND period_id=$2 GROUP BY category ORDER BY category`,
      [company_id, period_id]
    );
    const overall = await pool.query(
      'SELECT COALESCE(SUM(amount),0) as total, COALESCE(SUM(wht_amount),0) as wht FROM expense_details WHERE company_id=$1 AND period_id=$2',
      [company_id, period_id]
    );
    res.json({ categories: result.rows, total: r2(overall.rows[0].total), total_wht: r2(overall.rows[0].wht) });
  } catch (err) { next(err); }
});

// GET /api/expenses/annual?company_id=xx&year=2025
router.get('/annual', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });
    const result = await pool.query(
      `SELECT ed.category, COALESCE(SUM(ed.amount),0) as total, COUNT(*) as cnt,
        COALESCE(SUM(ed.wht_amount),0) as wht_total
       FROM expense_details ed
       JOIN accounting_periods ap ON ap.id = ed.period_id
       WHERE ed.company_id=$1 AND ap.year=$2 GROUP BY ed.category ORDER BY ed.category`,
      [company_id, year]
    );
    const total = result.rows.reduce((s, r) => s + parseFloat(r.total), 0);
    const totalWht = result.rows.reduce((s, r) => s + parseFloat(r.wht_total), 0);
    res.json({ categories: result.rows, total: r2(total), total_wht: r2(totalWht) });
  } catch (err) { next(err); }
});

// GET /api/expenses/wht-summary?company_id=xx&year=2025
router.get('/wht-summary', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });
    const result = await pool.query(
      `SELECT ed.*, ap.month FROM expense_details ed
       JOIN accounting_periods ap ON ap.id = ed.period_id
       WHERE ed.company_id=$1 AND ap.year=$2 AND ed.has_wht=true
       ORDER BY ed.expense_date`,
      [company_id, year]
    );
    const total = result.rows.reduce((s, r) => s + parseFloat(r.wht_amount), 0);
    const deducted = result.rows.filter(r => r.wht_deducted_for_cit).reduce((s, r) => s + parseFloat(r.wht_amount), 0);
    const details = result.rows.map(r => ({
      id: r.id, month: r.month, category: r.category, payee_name: r.payee_name,
      wht_amount: parseFloat(r.wht_amount), wht_rate: parseFloat(r.wht_rate),
      certificate_no: r.wht_certificate_no, deducted: r.wht_deducted_for_cit
    }));
    res.json({ total_wht: r2(total), deducted: r2(deducted), pending: r2(total - deducted), details });
  } catch (err) { next(err); }
});

// POST /api/expenses/batch
router.post('/batch', checkPeriodLock, validate(expensesBatchSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { company_id, period_id, entries } = req.body;
    if (!company_id || !period_id || !Array.isArray(entries) || entries.length === 0)
      return res.status(400).json({ error: '缺少参数' });
    await client.query('BEGIN');
    for (const e of entries) {
      if (!e.expense_date || !e.category || !e.amount) continue;
      const amount = r2(e.amount);
      const vat = r2(e.vat_amount || 0);
      const total = r2(amount + vat);
      const whtRate = r2(e.wht_rate || 0);
      const whtAmount = r2(amount * whtRate / 100);
      await client.query(
        `INSERT INTO expense_details (company_id,period_id,expense_date,category,payee_name,payee_tax_id,description,amount,vat_amount,total_amount,has_wht,wht_rate,wht_amount,wht_certificate_no,notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [company_id, period_id, e.expense_date, e.category, e.payee_name||'', e.payee_tax_id||null, e.description||'',
         amount, vat, total, e.has_wht||false, whtRate, whtAmount, e.wht_certificate_no||null, e.notes||'']
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ message: `录入${entries.length}条`, count: entries.length });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

// POST /api/expenses/from-invoice - 从进项发票生成费用
router.post('/from-invoice', checkPeriodLock, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { company_id, period_id, input_detail_ids } = req.body;
    if (!company_id || !period_id || !Array.isArray(input_detail_ids) || input_detail_ids.length === 0)
      return res.status(400).json({ error: '缺少参数' });
    const invoices = await pool.query(
      'SELECT * FROM vat_input_details WHERE id = ANY($1) AND company_id=$2',
      [input_detail_ids, company_id]
    );
    if (invoices.rows.length === 0) return res.status(404).json({ error: '未找到对应进项' });

    await client.query('BEGIN');
    let count = 0;
    for (const inv of invoices.rows) {
      // Check if already exists
      const existing = await client.query(
        'SELECT id FROM expense_details WHERE company_id=$1 AND period_id=$2 AND description LIKE $3',
        [company_id, period_id, `%${inv.invoice_no || inv.supplier_name}%`]
      );
      if (existing.rows.length > 0) continue;

      await client.query(
        `INSERT INTO expense_details (company_id,period_id,expense_date,category,payee_name,payee_tax_id,description,amount,vat_amount,total_amount,has_wht)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false)`,
        [company_id, period_id, inv.invoice_date, inv.category, inv.supplier_name,
         inv.supplier_tax_id, inv.description, r2(inv.amount_ex_vat), r2(inv.vat_amount), r2(inv.total_amount)]
      );
      count++;
    }
    await client.query('COMMIT');
    res.status(201).json({ message: `从进项生成${count}条费用`, count });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

// PUT /api/expenses/:id/wht-info
router.put('/:id/wht-info', checkPeriodLock, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { has_wht, wht_rate, wht_amount, wht_certificate_no, wht_deducted_for_cit } = req.body;
    const result = await pool.query(
      `UPDATE expense_details SET has_wht=$1, wht_rate=$2, wht_amount=$3, wht_certificate_no=$4, wht_deducted_for_cit=$5 WHERE id=$6 RETURNING *`,
      [!!has_wht, r2(wht_rate||0), r2(wht_amount||0), wht_certificate_no||null, !!wht_deducted_for_cit, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: '不存在' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/expenses/:id
router.delete('/:id', checkPeriodLock, async (req, res, next) => {
  try {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM expense_details WHERE id=$1 RETURNING *', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '不存在' });
    res.json({ message: '删除成功' });
  } catch (err) { next(err); }
});

module.exports = router;
