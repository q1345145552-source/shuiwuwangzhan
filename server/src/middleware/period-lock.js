const { pool } = require('../db');

async function checkPeriodLock(req, res, next) {
  const periodId = req.body.period_id || req.query.period_id || req.params.period_id;
  if (!periodId) return next();

  try {
    const result = await pool.query('SELECT status FROM accounting_periods WHERE id = $1', [periodId]);
    if (result.rows.length > 0 && result.rows[0].status === 'locked') {
      return res.status(403).json({ error: '该会计期间已锁定，无法修改数据' });
    }
    next();
  } catch (err) {
    console.error('期间锁定检查失败:', err.message);
    return res.status(500).json({ error: '期间锁定检查失败，请稍后重试' });
  }
}

module.exports = { checkPeriodLock };
