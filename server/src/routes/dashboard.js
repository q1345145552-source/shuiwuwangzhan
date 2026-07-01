const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/dashboard/summary
router.get('/summary', async (req, res, next) => {
  try {
    // Company stats
    const [companyCount, activeCompany, vatReports] = await Promise.all([
      pool.query('SELECT COUNT(*) as cnt FROM companies'),
      pool.query('SELECT COUNT(DISTINCT company_id) as cnt FROM ecommerce_sales'),
      pool.query(`SELECT vr.*, ap.year, ap.month, c.name as company_name
        FROM vat_reports vr
        JOIN accounting_periods ap ON ap.id = vr.period_id
        JOIN companies c ON c.id = vr.company_id
        ORDER BY ap.year DESC, ap.month DESC LIMIT 12`),
    ]);

    // Upcoming deadlines (next 7 days from tax_calendar)
    const upcomingDeadlines = await pool.query(`
      SELECT tc.*, c.name as company_name
      FROM tax_calendar tc
      JOIN companies c ON c.id = tc.company_id
      WHERE tc.status = 'pending'
        AND tc.due_date >= CURRENT_DATE
        AND tc.due_date <= CURRENT_DATE + INTERVAL '7 days'
      ORDER BY tc.due_date ASC
    `);

    // Overdue items
    const overdueItems = await pool.query(`
      SELECT tc.*, c.name as company_name,
        (CURRENT_DATE - tc.due_date) as overdue_days
      FROM tax_calendar tc
      JOIN companies c ON c.id = tc.company_id
      WHERE tc.status = 'overdue'
      ORDER BY tc.due_date ASC
    `);

    // Recent activity
    const recentActivity = await pool.query(`
      SELECT al.*, c.name as company_name
      FROM audit_logs al
      LEFT JOIN companies c ON c.id = al.company_id
      ORDER BY al.created_at DESC LIMIT 5
    `);

    // Monthly trend (last 6 months of vat reports)
    const monthlyTrend = await pool.query(`
      SELECT ap.year, ap.month,
        COUNT(vr.id) FILTER (WHERE vr.status = 'filed') as filed_count,
        COUNT(vr.id) FILTER (WHERE vr.status != 'filed') as pending_count
      FROM accounting_periods ap
      LEFT JOIN vat_reports vr ON vr.period_id = ap.id
      WHERE ap.status != 'draft'
      GROUP BY ap.year, ap.month
      ORDER BY ap.year DESC, ap.month DESC LIMIT 6
    `);

    // This month's pending
    const thisMonthPending = await pool.query(`
      SELECT COUNT(*) as cnt FROM tax_calendar
      WHERE status = 'pending' AND EXTRACT(MONTH FROM due_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM due_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);

    // This month's filed
    const thisMonthFiled = await pool.query(`
      SELECT COUNT(*) as cnt FROM vat_reports
      WHERE status = 'filed' AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM CURRENT_DATE)
    `);

    res.json({
      company_count: parseInt(companyCount.rows[0].cnt),
      active_company_count: parseInt(activeCompany.rows[0].cnt),
      this_month_pending: parseInt(thisMonthPending.rows[0].cnt),
      overdue_count: overdueItems.rows.length,
      this_month_filed: parseInt(thisMonthFiled.rows[0].cnt),
      upcoming_deadlines: upcomingDeadlines.rows.map(r => ({
        company: r.company_name,
        tax_type: r.tax_type,
        due_date: r.due_date,
        due_in_days: r.due_date ? Math.ceil((new Date(r.due_date) - new Date()) / (1000 * 60 * 60 * 24)) : null,
      })),
      overdue_items: overdueItems.rows.map(r => ({
        company: r.company_name,
        tax_type: r.tax_type,
        due_date: r.due_date,
        overdue_days: parseInt(r.overdue_days) || 0,
        estimated_penalty: Math.round((parseInt(r.overdue_days) || 0) * 100),
      })),
      recent_activity: recentActivity.rows.map(r => ({
        time: getRelativeTime(r.created_at),
        action: r.action,
        company: r.company_name || '',
      })),
      monthly_trend: monthlyTrend.rows.reverse().map(r => ({
        month: `${r.year}-${String(r.month).padStart(2, '0')}`,
        filed_count: parseInt(r.filed_count) || 0,
        pending_count: parseInt(r.pending_count) || 0,
      })),
    });
  } catch (err) { next(err); }
});

function getRelativeTime(date) {
  if (!date) return '';
  const now = new Date();
  const diff = Math.floor((now - new Date(date)) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

module.exports = router;
