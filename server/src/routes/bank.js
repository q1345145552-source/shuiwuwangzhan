const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { checkPeriodLock } = require('../middleware/period-lock');

const upload = multer({ dest: '/tmp/' });

// GET /api/bank?company_id=xx&period_id=xx
router.get('/', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    }
    const result = await pool.query(
      'SELECT * FROM bank_transactions WHERE company_id = $1 AND period_id = $2 ORDER BY transaction_date DESC, id DESC',
      [company_id, period_id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/bank/unmatched?company_id=xx
router.get('/unmatched', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });
    const result = await pool.query(
      'SELECT * FROM bank_transactions WHERE company_id = $1 AND matched_entry_id IS NULL ORDER BY transaction_date DESC',
      [company_id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/bank/template - CSV 模板下载
router.get('/template', (req, res) => {
  const csv = 'transaction_date,type,amount_thb,amount_cny,description,bank_account\n2025-12-08,income,22500,5000,蓝鲨充值入账,SCB-xxx\n2025-12-10,expense,3000,0,运输费,SCB-xxx\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename=bank_template.csv');
  res.send('\uFEFF' + csv); // BOM for Excel Thai
});

// POST /api/bank - 单条新增
router.post('/', checkPeriodLock, async (req, res, next) => {
  try {
    const { company_id, period_id, bank_account, transaction_date, type, amount_thb, amount_cny, description } = req.body;
    if (!company_id || !period_id || !transaction_date || !type) {
      return res.status(400).json({ error: '缺少必填字段' });
    }
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type 必须为 income 或 expense' });
    }
    const result = await pool.query(
      `INSERT INTO bank_transactions (company_id, period_id, bank_account, transaction_date, type, amount_thb, amount_cny, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [company_id, period_id, bank_account || null, transaction_date, type,
       parseFloat(amount_thb) || 0, parseFloat(amount_cny) || 0, description || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/bank/import - CSV 批量导入
router.post('/import', checkPeriodLock, upload.single('file'), async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    }

    let rows = [];

    if (req.file) {
      // CSV 文件方式
      const content = fs.readFileSync(req.file.path, 'utf-8').replace(/^\uFEFF/, '');
      rows = parseCSV(content);
      fs.unlinkSync(req.file.path);
    } else if (req.body.rows) {
      // JSON 数组方式
      try {
        rows = typeof req.body.rows === 'string' ? JSON.parse(req.body.rows) : req.body.rows;
      } catch { return res.status(400).json({ error: 'rows 格式无效' }); }
    } else {
      return res.status(400).json({ error: '请上传 CSV 文件或提供 rows 参数' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const success = [];
      const errors = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const { transaction_date, type, amount_thb, amount_cny, description, bank_account } = r;

        // 校验
        if (!transaction_date || !type) {
          errors.push({ row: i + 1, error: '日期或类型不能为空' });
          continue;
        }
        if (!['income', 'expense'].includes(type)) {
          errors.push({ row: i + 1, error: `类型无效: ${type}` });
          continue;
        }
        const thb = parseFloat(amount_thb);
        const cny = parseFloat(amount_cny) || 0;
        if (isNaN(thb)) {
          errors.push({ row: i + 1, error: `金额无效: ${amount_thb}` });
          continue;
        }

        const result = await client.query(
          `INSERT INTO bank_transactions (company_id, period_id, bank_account, transaction_date, type, amount_thb, amount_cny, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [company_id, period_id, bank_account || null, transaction_date, type, thb, cny, description || '']
        );
        success.push(result.rows[0]);
      }

      await client.query('COMMIT');
      res.status(201).json({
        message: `导入完成：成功 ${success.length} 条，失败 ${errors.length} 条`,
        success: success.length,
        errors: errors.length,
        error_details: errors,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  } catch (err) { next(err); }
});

// DELETE /api/bank/:id
router.delete('/:id', checkPeriodLock, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM bank_transactions WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '流水不存在' });
    }
    res.json({ message: '删除成功', deleted: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/bank/:id/match - 匹配分录
router.put('/:id/match', checkPeriodLock, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { matched_entry_id } = req.body;
    if (!matched_entry_id) {
      return res.status(400).json({ error: '缺少 matched_entry_id' });
    }
    const result = await pool.query(
      'UPDATE bank_transactions SET matched_entry_id = $1 WHERE id = $2 RETURNING *',
      [matched_entry_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '流水不存在' });
    }
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().replace(/^\uFEFF/, '');
  const cols = header.split(',').map(c => c.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    if (vals.length === 0 || vals.every(v => !v)) continue;
    const row = {};
    cols.forEach((c, j) => { row[c] = vals[j] || ''; });
    rows.push(row);
  }
  return rows;
}

module.exports = router;
