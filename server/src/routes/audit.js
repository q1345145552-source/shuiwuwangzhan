const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/audit/logs — 查询日志
router.get('/logs', async (req, res, next) => {
  try {
    const { company_id, entity_type, action, start_date, end_date, page, limit } = req.query;
    const p = parseInt(page) || 1;
    const lim = parseInt(limit) || 50;
    const offset = (p - 1) * lim;
    const conditions = [];
    const params = [];
    let i = 1;

    if (company_id) { conditions.push(`company_id = $${i++}`); params.push(company_id); }
    if (entity_type) { conditions.push(`entity_type = $${i++}`); params.push(entity_type); }
    if (action) { conditions.push(`action = $${i++}`); params.push(action); }
    if (start_date) { conditions.push(`created_at >= $${i++}`); params.push(start_date); }
    if (end_date) { conditions.push(`created_at <= $${i++}`); params.push(end_date + ' 23:59:59'); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countRes, dataRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM audit_logs ${where}`, params),
      pool.query(
        `SELECT id, company_id, user_name, action, entity_type, entity_id, description, ip_address, created_at
         FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...params, lim, offset]
      )
    ]);

    res.json({
      items: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      page: p,
      limit: lim
    });
  } catch (e) { next(e); }
});

// GET /api/audit/logs/:id — 日志详情（含 old/new JSON）
router.get('/logs/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: '日志不存在' });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// GET /api/audit/stats — 日志统计
router.get('/stats', async (req, res, next) => {
  try {
    const [total, today, byAction] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM audit_logs'),
      pool.query("SELECT COUNT(*) FROM audit_logs WHERE created_at >= CURRENT_DATE"),
      pool.query("SELECT action, COUNT(*) as cnt FROM audit_logs GROUP BY action ORDER BY cnt DESC")
    ]);
    res.json({
      total: parseInt(total.rows[0].count),
      today: parseInt(today.rows[0].count),
      by_action: byAction.rows
    });
  } catch (e) { next(e); }
});

module.exports = router;
