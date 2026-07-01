const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/periods?company_id=xx
router.get('/', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    if (!company_id) {
      return res.status(400).json({ error: '缺少 company_id 参数' });
    }
    const result = await pool.query(
      'SELECT * FROM accounting_periods WHERE company_id = $1 ORDER BY year DESC, month DESC',
      [company_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/periods
router.post('/', async (req, res, next) => {
  try {
    const { company_id, year, month } = req.body;
    if (!company_id || !year || !month) {
      return res.status(400).json({ error: 'company_id, year, month 为必填项' });
    }
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: '月份必须在 1-12 之间' });
    }
    // 检查重复
    const dup = await pool.query(
      'SELECT id FROM accounting_periods WHERE company_id = $1 AND year = $2 AND month = $3',
      [company_id, year, month]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: '该会计期间已存在' });
    }
    const result = await pool.query(
      'INSERT INTO accounting_periods (company_id, year, month, status) VALUES ($1,$2,$3,$4) RETURNING *',
      [company_id, year, month, 'draft']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/periods/:id/status
router.put('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['draft', 'confirmed', 'filed'].includes(status)) {
      return res.status(400).json({ error: '状态值无效，允许: draft, confirmed, filed' });
    }
    const result = await pool.query(
      'UPDATE accounting_periods SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '会计期间不存在' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/periods/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const period = await pool.query('SELECT * FROM accounting_periods WHERE id = $1', [id]);
    if (period.rows.length === 0) {
      return res.status(404).json({ error: '会计期间不存在' });
    }
    if (period.rows[0].status !== 'draft') {
      return res.status(403).json({ error: '仅 draft 状态的期间可删除' });
    }
    await pool.query('DELETE FROM accounting_periods WHERE id = $1', [id]);
    res.json({ message: '删除成功' });
  } catch (err) {
    next(err);
  }
});


// PUT /api/periods/:id/lock
router.put("/:id/lock", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query("UPDATE accounting_periods SET status = 'locked' WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "会计期间不存在" });
    res.json({ message: "期间已锁定", period: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/periods/:id/unlock
router.put("/:id/unlock", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query("UPDATE accounting_periods SET status = 'draft' WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "会计期间不存在" });
    res.json({ message: "期间已解锁", period: result.rows[0] });
  } catch (err) { next(err); }
});
module.exports = router;
