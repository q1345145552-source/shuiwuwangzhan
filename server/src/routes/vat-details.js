const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const { pool } = require('../db');
const { checkPeriodLock } = require('../middleware/period-lock');
const { validate, vatOutputBatchSchema } = require('../middleware/validator');
const { logAudit } = require('../middleware/audit');
const { VAT_RATE } = require('../constants');
const upload = multer({ dest: '/tmp/' });

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// ==================== OUTPUT (销项) ====================

// GET /api/vat-details/output?company_id=xx&period_id=xx&page=1&limit=20
router.get('/output', async (req, res, next) => {
  try {
    const { company_id, period_id, page = 1, limit = 20 } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const [data, count] = await Promise.all([
      pool.query('SELECT * FROM vat_output_details WHERE company_id=$1 AND period_id=$2 ORDER BY invoice_date DESC, id DESC LIMIT $3 OFFSET $4', [company_id, period_id, parseInt(limit), offset]),
      pool.query('SELECT COUNT(*) as total FROM vat_output_details WHERE company_id=$1 AND period_id=$2', [company_id, period_id])
    ]);
    res.json({ rows: data.rows, total: parseInt(count.rows[0].total), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/vat-details/output/summary?company_id=xx&period_id=xx
router.get('/output/summary', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const r = await pool.query(
      'SELECT COUNT(*) as cnt, COALESCE(SUM(amount_ex_vat),0) as total_ex, COALESCE(SUM(vat_amount),0) as total_vat, COALESCE(SUM(total_amount),0) as total_inc FROM vat_output_details WHERE company_id=$1 AND period_id=$2',
      [company_id, period_id]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/vat-details/output/batch
router.post('/output/batch', checkPeriodLock, validate(vatOutputBatchSchema), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { company_id, period_id, entries } = req.body;
    if (!company_id || !period_id || !Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: '缺少参数' });
    if (entries.length > 50) return res.status(400).json({ error: '单次最多50条' });

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.invoice_date || !e.amount_ex_vat || e.amount_ex_vat <= 0) return res.status(400).json({ error: `第${i+1}条缺少日期或金额` });
    }

    await client.query('BEGIN');
    const inserted = [];
    for (const e of entries) {
      const ex = r2(e.amount_ex_vat);
      const vat = r2(ex * VAT_RATE);
      const tot = r2(ex + vat);
      const r = await client.query(
        `INSERT INTO vat_output_details (company_id,period_id,invoice_date,invoice_no,customer_name,customer_tax_id,description,amount_ex_vat,vat_amount,total_amount,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [company_id, period_id, e.invoice_date, e.invoice_no || null, e.customer_name || '', e.customer_tax_id || null, e.description || '', ex, vat, tot, e.source || 'manual']
      );
      inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ message: `成功录入${inserted.length}条`, count: inserted.length });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

// DELETE /api/vat-details/output/:id
router.delete('/output/:id', checkPeriodLock, async (req, res, next) => {
  try {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM vat_output_details WHERE id=$1 RETURNING *', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '不存在' });
    res.json({ message: '删除成功' });
  } catch (err) { next(err); }
});

// POST /api/vat-details/output/import-csv
router.post('/output/import-csv', checkPeriodLock, upload.single('file'), async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    if (!req.file) return res.status(400).json({ error: '请上传CSV' });
    const content = fs.readFileSync(req.file.path, 'utf-8').replace(/^\uFEFF/, '');
    fs.unlinkSync(req.file.path);
    const rows = parseCSV(content);
    if (rows.length === 0) return res.status(400).json({ error: 'CSV无数据' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let ok = 0;
      for (const r of rows) {
        if (!r.invoice_date || !r.amount_ex_vat) continue;
        const ex = r2(r.amount_ex_vat), vat = r2(ex * VAT_RATE), tot = r2(ex + vat);
        await client.query(
          `INSERT INTO vat_output_details (company_id,period_id,invoice_date,invoice_no,customer_name,customer_tax_id,description,amount_ex_vat,vat_amount,total_amount,source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'import')`,
          [company_id, period_id, r.invoice_date, r.invoice_no || null, r.customer_name || '', r.customer_tax_id || null, r.description || '', ex, vat, tot]
        );
        ok++;
      }
      await client.query('COMMIT');
      res.json({ message: `导入成功${ok}条`, count: ok });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  } catch (err) { next(err); }
});

// ==================== INPUT (进项) ====================

// GET /api/vat-details/input?company_id=xx&period_id=xx&category=xx&page=1&limit=20
router.get('/input', async (req, res, next) => {
  try {
    const { company_id, period_id, category, page = 1, limit = 20 } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE company_id=$1 AND period_id=$2', params = [company_id, period_id];
    if (category && category !== 'all') { where += ' AND category=$3'; params.push(category); }

    const [data, count] = await Promise.all([
      pool.query(`SELECT * FROM vat_input_details ${where} ORDER BY invoice_date DESC, id DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, parseInt(limit), offset]),
      pool.query(`SELECT COUNT(*) as total FROM vat_input_details ${where}`, params)
    ]);
    res.json({ rows: data.rows, total: parseInt(count.rows[0].total), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { next(err); }
});

// GET /api/vat-details/input/summary?company_id=xx&period_id=xx
router.get('/input/summary', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const r = await pool.query(
      `SELECT COUNT(*) as cnt,
        COALESCE(SUM(vat_amount) FILTER (WHERE deductible=true), 0) as deductible_vat,
        COALESCE(SUM(vat_amount) FILTER (WHERE deductible=false), 0) as nondeductible_vat,
        COALESCE(SUM(amount_ex_vat), 0) as total_ex
       FROM vat_input_details WHERE company_id=$1 AND period_id=$2`,
      [company_id, period_id]
    );
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/vat-details/input/batch
router.post('/input/batch', checkPeriodLock, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { company_id, period_id, entries } = req.body;
    if (!company_id || !period_id || !Array.isArray(entries) || entries.length === 0) return res.status(400).json({ error: '缺少参数' });
    if (entries.length > 50) return res.status(400).json({ error: '单次最多50条' });

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (!e.invoice_date || !e.supplier_name || !e.amount_ex_vat || e.amount_ex_vat <= 0) return res.status(400).json({ error: `第${i+1}条缺必填字段` });
    }

    await client.query('BEGIN');
    for (const e of entries) {
      const ex = r2(e.amount_ex_vat), vat = r2(ex * VAT_RATE), tot = r2(ex + vat);
      await client.query(
        `INSERT INTO vat_input_details (company_id,period_id,invoice_date,invoice_no,supplier_name,supplier_tax_id,description,amount_ex_vat,vat_amount,total_amount,deductible,category,source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [company_id, period_id, e.invoice_date, e.invoice_no || null, e.supplier_name, e.supplier_tax_id || null, e.description || '', ex, vat, tot, e.deductible !== false, e.category || 'purchase', e.source || 'manual']
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ message: `成功录入${entries.length}条`, count: entries.length });
  } catch (err) { await client.query('ROLLBACK'); next(err); } finally { client.release(); }
});

// DELETE /api/vat-details/input/:id
router.delete('/input/:id', checkPeriodLock, async (req, res, next) => {
  try {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM vat_input_details WHERE id=$1 RETURNING *', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '不存在' });
    res.json({ message: '删除成功' });
  } catch (err) { next(err); }
});

// PUT /api/vat-details/input/:id/deductible
router.put('/input/:id/deductible', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { deductible } = req.body;
    const r = await pool.query('UPDATE vat_input_details SET deductible=$1 WHERE id=$2 RETURNING *', [!!deductible, id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '不存在' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/vat-details/input/import-csv
router.post('/input/import-csv', checkPeriodLock, upload.single('file'), async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    if (!req.file) return res.status(400).json({ error: '请上传CSV' });
    const content = fs.readFileSync(req.file.path, 'utf-8').replace(/^\uFEFF/, '');
    fs.unlinkSync(req.file.path);
    const rows = parseCSV(content);
    if (rows.length === 0) return res.status(400).json({ error: 'CSV无数据' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let ok = 0;
      for (const r of rows) {
        if (!r.invoice_date || !r.supplier_name || !r.amount_ex_vat) continue;
        const ex = r2(r.amount_ex_vat), vat = r2(ex * VAT_RATE), tot = r2(ex + vat);
        const ded = r.deductible ? (r.deductible.toLowerCase() === 'true') : true;
        await client.query(
          `INSERT INTO vat_input_details (company_id,period_id,invoice_date,invoice_no,supplier_name,supplier_tax_id,description,amount_ex_vat,vat_amount,total_amount,deductible,category,source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'import')`,
          [company_id, period_id, r.invoice_date, r.invoice_no || null, r.supplier_name, r.supplier_tax_id || null, r.description || '', ex, vat, tot, ded, r.category || 'purchase']
        );
        ok++;
      }
      await client.query('COMMIT');
      res.json({ message: `导入成功${ok}条`, count: ok });
    } catch (err) { await client.query('ROLLBACK'); throw err; } finally { client.release(); }
  } catch (err) { next(err); }
});

// ==================== IMPORT VAT (进口VAT) ====================
router.post('/input/import-entry', checkPeriodLock, async (req, res, next) => {
  try {
    const { company_id, period_id, entry_date, invoice_no, customs_doc_no, supplier_name, description, cif_value, import_duty, import_vat_paid, declarant } = req.body;
    if (!company_id || !period_id || !entry_date || !supplier_name || !import_vat_paid) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    const desc = `进口清关VAT [CIF:${cif_value||0} 关税:${import_duty||0}] ${customs_doc_no||''} ${declarant||''}`;
    const vat = r2(import_vat_paid);
    const result = await pool.query(
      `INSERT INTO vat_input_details (company_id,period_id,invoice_date,invoice_no,supplier_name,description,amount_ex_vat,vat_amount,total_amount,deductible,category,source)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$7,true,'import','manual') RETURNING *`,
      [company_id, period_id, entry_date, invoice_no || null, supplier_name, desc.trim(), vat]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// ==================== RECONCILIATION (对账) ====================
router.get('/reconciliation', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });

    const [outSum, inSum] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(vat_amount),0) as total FROM vat_output_details WHERE company_id=$1 AND period_id=$2', [company_id, period_id]),
      pool.query('SELECT COALESCE(SUM(vat_amount),0) as total FROM vat_input_details WHERE company_id=$1 AND period_id=$2 AND deductible=true', [company_id, period_id])
    ]);

    // get prev credit forward
    const period = await pool.query('SELECT year, month FROM accounting_periods WHERE id=$1', [period_id]);
    let creditForward = 0;
    if (period.rows.length > 0) {
      const { year, month } = period.rows[0];
      let pm = month - 1, py = year;
      if (pm < 1) { pm = 12; py--; }
      const prev = await pool.query(
        'SELECT vat_credit_carry FROM vat_reports vr JOIN accounting_periods ap ON ap.id=vr.period_id WHERE vr.company_id=$1 AND ap.year=$2 AND ap.month=$3',
        [company_id, py, pm]
      );
      creditForward = prev.rows.length > 0 ? r2(prev.rows[0].vat_credit_carry) : 0;
    }

    const outVat = r2(outSum.rows[0].total);
    const inVat = r2(inSum.rows[0].total);
    const net = r2(outVat - inVat - creditForward);

    res.json({
      vat_output_total: outVat,
      vat_input_deductible: inVat,
      credit_forward: creditForward,
      vat_payable: net > 0 ? net : 0,
      vat_credit_carry: net < 0 ? r2(Math.abs(net)) : 0,
    });
  } catch (err) { next(err); }
});

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().replace(/^\uFEFF/, '').split(',').map(s => s.trim().replace(/"/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    if (vals.length === 0 || vals.every(v => !v)) continue;
    const row = {};
    header.forEach((h, j) => { row[h] = vals[j] || ''; });
    rows.push(row);
  }
  return rows;
}

module.exports = router;
