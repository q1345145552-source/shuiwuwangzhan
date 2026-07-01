const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { VAT_RATE } = require('../constants');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// ==================== 滞纳金计算函数 ====================
function calculatePenalty(amountDue, dueDate, currentDate) {
  const due = new Date(dueDate);
  const now = currentDate ? new Date(currentDate) : new Date();
  const days = Math.floor((now - due) / (1000 * 60 * 60 * 24));
  if (days <= 0) return { overdue_days: 0, penalty: 0 };

  // 泰国税法：每日 0.05%，单利
  const dailyRate = 0.0005;
  const penalty = amountDue * dailyRate * days;

  return {
    overdue_days: days,
    penalty: r2(penalty)
  };
}

// 纳税截止日规则
// month: 1-12 (报告期间月份), 返回次月的截止日期
function getDueDate(taxType, year, month) {
  // 计算次月（截止日在报告期次月）
  let dueMonth = month + 1;
  let dueYear = year;
  if (dueMonth > 12) { dueMonth = 1; dueYear = year + 1; }
  // JS Date: month 0-based (0=Jan)
  // 使用 UTC 避免时区偏移（Bangkok UTC+7）
  const d = (day) => new Date(Date.UTC(dueYear, dueMonth - 1, day));

  switch (taxType) {
    case 'vat': return d(23);             // 次月23日
    case 'wht_pnd53':
    case 'wht_pnd54':
    case 'wht_pnd1': return d(7);         // 次月7日
    case 'social_security': return d(15); // 次月15日
    case 'cit_pnd50': return new Date(year + 1, 4, 30); // CIT 次年5月30日, 不受 month 影响
    case 'cit_pnd51': return new Date(year, 7, 30);     // CIT 半年 8月30日
    default: return d(15);
  }
}

function getTaxName(taxType) {
  const names = {
    'vat': 'VAT P.P.30',
    'wht_pnd53': 'PND.53 法人预扣税',
    'wht_pnd54': 'PND.54 境外预扣税',
    'wht_pnd1': 'PND.1 工资预扣税',
    'cit_pnd50': 'CIT PND.50 年度申报',
    'cit_pnd51': 'CIT PND.51 半年预付',
    'social_security': '社保缴纳'
  };
  return names[taxType] || taxType;
}

// ==================== 合规设置 ====================
// GET /api/compliance/settings?company_id=xx
router.get('/settings', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });
    const result = await pool.query(
      'SELECT * FROM compliance_settings WHERE company_id = $1',
      [company_id]
    );
    res.json(result.rows[0] || {
      company_id: parseInt(company_id),
      vat_registered: false,
      has_employees: false,
      has_rental_expense: false,
      has_foreign_payment: false,
      vat_threshold_alert: true,
      reminder_days: 3
    });
  } catch (e) { next(e); }
});

// POST /api/compliance/settings
router.post('/settings', async (req, res, next) => {
  try {
    const { company_id, vat_registered, has_employees, has_rental_expense,
            has_foreign_payment, vat_threshold_alert, reminder_days } = req.body;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });

    await pool.query(
      `INSERT INTO compliance_settings (company_id, vat_registered, has_employees, has_rental_expense,
        has_foreign_payment, vat_threshold_alert, reminder_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (company_id) DO UPDATE SET
        vat_registered = EXCLUDED.vat_registered,
        has_employees = EXCLUDED.has_employees,
        has_rental_expense = EXCLUDED.has_rental_expense,
        has_foreign_payment = EXCLUDED.has_foreign_payment,
        vat_threshold_alert = EXCLUDED.vat_threshold_alert,
        reminder_days = EXCLUDED.reminder_days`,
      [company_id, vat_registered || false, has_employees || false, has_rental_expense || false,
       has_foreign_payment || false, vat_threshold_alert !== false, reminder_days || 3]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ==================== 税务日历 ====================

// GET /api/compliance/calendar?company_id=xx&year=2026
router.get('/calendar', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });

    const result = await pool.query(
      `SELECT * FROM tax_calendar
       WHERE company_id = $1 AND period_year = $2
       ORDER BY due_date`,
      [company_id, year]
    );

    // 把逾期的算一下滞纳金
    const today = new Date();
    const items = result.rows.map(row => {
      if (row.status === 'pending' && new Date(row.due_date) < today) {
        const calc = calculatePenalty(1, row.due_date, today);
        return { ...row, overdue_days: calc.overdue_days };
      }
      return row;
    });

    res.json({ items, year: parseInt(year) });
  } catch (e) { next(e); }
});

// POST /api/compliance/calendar/generate - 生成未来12个月税务日历
router.post('/calendar/generate', async (req, res, next) => {
  try {
    const { company_id, start_year } = req.body;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });

    // 获取合规配置
    const cfg = await pool.query(
      'SELECT * FROM compliance_settings WHERE company_id = $1', [company_id]
    );
    const settings = cfg.rows[0] || {};
    const today = new Date();
    const startYear = start_year || today.getFullYear();

    const entries = [];

    // 生成12个月
    for (let i = 0; i < 12; i++) {
      const mon = (today.getMonth() + i) % 12;
      const yr = startYear + Math.floor((today.getMonth() + i) / 12);

      // VAT - P.P.30 每月
      entries.push({
        company_id, tax_type: 'vat', tax_name: 'VAT P.P.30',
        due_date: getDueDate('vat', yr, mon + 1),
        period_year: yr, period_month: mon + 1
      });

      // PND.53 每月（如果可能有法人付款）
      entries.push({
        company_id, tax_type: 'wht_pnd53', tax_name: 'PND.53 法人预扣税',
        due_date: getDueDate('wht_pnd53', yr, mon + 1),
        period_year: yr, period_month: mon + 1
      });

      // PND.54 如果有境外付款
      if (settings.has_foreign_payment) {
        entries.push({
          company_id, tax_type: 'wht_pnd54', tax_name: 'PND.54 境外预扣税',
          due_date: getDueDate('wht_pnd54', yr, mon + 1),
          period_year: yr, period_month: mon + 1
        });
      }

      // PND.1 如果有员工
      if (settings.has_employees) {
        entries.push({
          company_id, tax_type: 'wht_pnd1', tax_name: 'PND.1 工资预扣税',
          due_date: getDueDate('wht_pnd1', yr, mon + 1),
          period_year: yr, period_month: mon + 1
        });
      }

      // 社保 如果有员工
      if (settings.has_employees) {
        entries.push({
          company_id, tax_type: 'social_security', tax_name: '社保缴纳',
          due_date: getDueDate('social_security', yr, mon + 1),
          period_year: yr, period_month: mon + 1
        });
      }
    }

    // 年度申报 CIT PND.50 + CIT PND.51 也加入
    if (today.getMonth() < 4) {
      entries.push({
        company_id, tax_type: 'cit_pnd50', tax_name: 'CIT PND.50 年度申报',
        due_date: getDueDate('cit_pnd50', today.getFullYear() - 1, 12),
        period_year: today.getFullYear() - 1, period_month: null
      });
    } else {
      entries.push({
        company_id, tax_type: 'cit_pnd50', tax_name: 'CIT PND.50 年度申报',
        due_date: getDueDate('cit_pnd50', today.getFullYear(), 12),
        period_year: today.getFullYear(), period_month: null
      });
    }
    entries.push({
      company_id, tax_type: 'cit_pnd51', tax_name: 'CIT PND.51 半年预付',
      due_date: getDueDate('cit_pnd51', today.getFullYear(), 6),
      period_year: today.getFullYear(), period_month: null
    });

    // UPSERT all entries
    const inserted = [];
    for (const entry of entries) {
      const result = await pool.query(
        `INSERT INTO tax_calendar (company_id, tax_type, tax_name, due_date, period_year, period_month)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (company_id, tax_type, period_year, period_month) DO UPDATE SET
           tax_name = EXCLUDED.tax_name, due_date = EXCLUDED.due_date
         RETURNING *`,
        [entry.company_id, entry.tax_type, entry.tax_name, entry.due_date,
         entry.period_year, entry.period_month]
      );
      inserted.push(result.rows[0]);
    }

    res.json({ success: true, count: inserted.length, items: inserted });
  } catch (e) { next(e); }
});

// GET /api/compliance/upcoming?company_id=xx&days=30
router.get('/upcoming', async (req, res, next) => {
  try {
    const { company_id, days } = req.query;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });
    const d = parseInt(days) || 30;
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + d);

    const result = await pool.query(
      `SELECT * FROM tax_calendar
       WHERE company_id = $1 AND status = 'pending'
         AND due_date BETWEEN $2 AND $3
       ORDER BY due_date`,
      [company_id, today.toISOString().slice(0, 10), future.toISOString().slice(0, 10)]
    );

    const items = result.rows.map(row => {
      const daysLeft = Math.ceil((new Date(row.due_date) - today) / (1000 * 60 * 60 * 24));
      return { ...row, days_left: daysLeft };
    });

    res.json({ items, count: items.length });
  } catch (e) { next(e); }
});

// GET /api/compliance/overdue?company_id=xx
router.get('/overdue', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    if (!company_id) return res.status(400).json({ error: '缺少 company_id' });
    const today = new Date().toISOString().slice(0, 10);

    const result = await pool.query(
      `SELECT * FROM tax_calendar
       WHERE company_id = $1 AND status = 'pending' AND due_date < $2
       ORDER BY due_date`,
      [company_id, today]
    );

    const items = result.rows.map(row => {
      const calc = calculatePenalty(1, row.due_date, today);
      return { ...row, overdue_days: calc.overdue_days };
    });

    res.json({ items, count: items.length });
  } catch (e) { next(e); }
});

// POST /api/calendar/update-status
router.post('/calendar/update-status', async (req, res, next) => {
  try {
    const { calendar_id, status, submitted_date } = req.body;
    await pool.query(
      `UPDATE tax_calendar SET status = $1, submitted_date = $2
       WHERE id = $3`,
      [status, submitted_date || new Date().toISOString().slice(0, 10), calendar_id]
    );
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ==================== 滞纳金计算 ====================
// POST /api/compliance/calculate-penalty
router.post('/calculate-penalty', async (req, res, next) => {
  try {
    const { tax_type, amount_due, due_date, current_date } = req.body;
    const result = calculatePenalty(parseFloat(amount_due) || 0, due_date, current_date);
    res.json({ ...result, tax_type, amount_due: parseFloat(amount_due) });
  } catch (e) { next(e); }
});

// ==================== 历史补税方案 ====================
// POST /api/compliance/tax-relief-plan
router.post('/tax-relief-plan', async (req, res, next) => {
  try {
    const { company_id, start_month, end_month, monthly_sales, has_input_invoices, estimated_input_vat } = req.body;
    const today = new Date();

    const breakdown = [];
    const inputVatTotal = parseFloat(estimated_input_vat) || 0;
    let totalVatOwed = 0;
    let totalPenalty = 0;

    // 计算总销售额（用于月占比）
    const totalSales = monthly_sales.reduce((sum, m) => sum + (parseFloat(m.sales_incl_vat) || 0), 0);

    for (const item of monthly_sales) {
      const salesInclVat = parseFloat(item.sales_incl_vat) || 0;
      const refunds = parseFloat(item.refunds) || 0;
      const netSalesInclVat = salesInclVat - refunds;
      const salesExVat = netSalesInclVat  / (1 + VAT_RATE);
      const vatDue = salesExVat * VAT_RATE;

      // 月度进项分配（按销售占比）
      const monthInputRatio = totalSales > 0 ? (salesInclVat / totalSales) : 0;
      const monthInputVat = has_input_invoices ? inputVatTotal * monthInputRatio : 0;
      const netVatDue = Math.max(0, vatDue - monthInputVat);

      // 该月的截止日 = 次月23日
      const [y, m] = item.month.split('-').map(Number);
      const dueDate = new Date(y, m, 23); // 次月23日

      const penaltyCalc = calculatePenalty(netVatDue, dueDate, today);

      breakdown.push({
        month: item.month,
        sales_incl_vat: r2(salesInclVat),
        refunds: r2(refunds),
        sales_ex_vat: r2(salesExVat),
        vat_due: r2(vatDue),
        input_vat_deducted: r2(monthInputVat),
        net_vat_due: r2(netVatDue),
        penalty: penaltyCalc.penalty,
        overdue_days: penaltyCalc.overdue_days,
        due_date: dueDate.toISOString().slice(0, 10),
        status: penaltyCalc.overdue_days > 0 ? 'overdue' : 'pending'
      });

      totalVatOwed += netVatDue;
      totalPenalty += penaltyCalc.penalty;
    }

    totalVatOwed = r2(totalVatOwed);
    totalPenalty = r2(totalPenalty);
    const financialPenalty = r2(totalVatOwed); // Section 22 主动补税 ≈ 0.5倍，但主动可减免
    const totalOptimistic = r2(totalVatOwed + totalPenalty); // 主动补税：仅补税+滞纳金
    const totalPessimistic = r2(totalVatOwed + totalPenalty + totalVatOwed * 2); // 被稽查：补税+滞纳金+2倍罚款

    // 分期建议
    const installment = totalOptimistic <= 500000 ? null :
      totalOptimistic <= 2000000 ?
        { months: 6, monthly: r2(totalOptimistic / 6) } :
        { months: 12, monthly: r2(totalOptimistic / 12) };

    res.json({
      summary: {
        total_vat_owed: totalVatOwed,
        total_penalty: totalPenalty,
        financial_penalty: financialPenalty,
        total_liability: totalOptimistic,
        total_liability_optimistic: totalOptimistic,
        total_liability_pessimistic: totalPessimistic
      },
      monthly_breakdown: breakdown,
      action_plan: {
        recommended: '主动补税（Section 22）',
        steps: [
          'Step 1: 立即注册 VAT（如未注册）',
          'Step 2: 联系税务局申请 Section 22 主动补税',
          'Step 3: 准备各月销售凭证/平台报告',
          'Step 4: 补缴 VAT 本金 + 滞纳金',
          'Step 5: 恢复正常月度 P.P.30 申报'
        ],
        installment: installment ?
          `可申请${installment.months}期分期，每月约 ${installment.monthly.toLocaleString()} THB` :
          '一次性缴清',
        deadline: '建议30天内完成'
      }
    });
  } catch (e) { next(e); }
});

module.exports = router;

// ==================== 通知提醒 ====================
// GET /api/compliance/notifications?company_id=xx
router.get('/notifications', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const threeDaysLater = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    let whereCompany = '';
    const params = [];
    if (company_id) {
      whereCompany = 'AND tc.company_id = $1';
      params.push(company_id);
    }

    // Deadline soon: due within 3 days, status pending
    const upcoming = await pool.query(
      `SELECT tc.*, c.name as company_name
       FROM tax_calendar tc
       JOIN companies c ON c.id = tc.company_id
       WHERE tc.status = 'pending'
         AND tc.due_date >= $${params.length + 1}
         AND tc.due_date <= $${params.length + 2}
         ${whereCompany}
       ORDER BY tc.due_date ASC`,
      [...params, today, threeDaysLater]
    );

    // Overdue
    const overdue = await pool.query(
      `SELECT tc.*, c.name as company_name,
        (DATE '${today}' - tc.due_date) as overdue_days
       FROM tax_calendar tc
       JOIN companies c ON c.id = tc.company_id
       WHERE tc.status = 'overdue'
         ${whereCompany}
       ORDER BY tc.due_date ASC`,
      params
    );

    const alerts = [
      ...upcoming.rows.map(r => ({
        type: 'deadline_soon',
        company: r.company_name,
        tax_type: r.tax_type,
        due_date: r.due_date,
        due_in_days: Math.ceil((new Date(r.due_date) - new Date()) / 86400000),
        read: false,
      })),
      ...overdue.rows.map(r => ({
        type: 'overdue',
        company: r.company_name,
        tax_type: r.tax_type,
        due_date: r.due_date,
        overdue_days: parseInt(r.overdue_days) || 0,
        read: false,
      })),
    ];

    res.json({ alerts, unread_count: alerts.length });
  } catch (err) { next(err); }
});

// POST /api/compliance/notifications/mark-read
router.post('/notifications/mark-read', (req, res) => {
  // Client-side read tracking, just acknowledge
  res.json({ success: true });
});
