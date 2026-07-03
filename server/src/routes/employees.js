const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logAudit } = require('../middleware/audit');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// ==================== 员工管理 ====================

// GET /api/employees?company_id=xx&active=true
router.get('/employees', async (req, res, next) => {
  try {
    const { company_id, active } = req.query;
    let sql = 'SELECT * FROM employees WHERE 1=1';
    const params = [];
    if (company_id) { params.push(company_id); sql += ` AND company_id = $${params.length}`; }
    if (active === 'true') { sql += ' AND is_active = TRUE'; }
    sql += ' ORDER BY id';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

// GET /api/employees/:id
router.get('/employees/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM employees WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: '员工不存在' });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/employees
router.post('/employees', async (req, res, next) => {
  try {
    const { company_id, employee_code, full_name, nationality, id_card_no, position, salary, social_security_base, start_date, notes } = req.body;
    if (!company_id || !employee_code || !full_name || !salary || !start_date)
      return res.status(400).json({ error: '必填字段：公司、员工编号、姓名、月薪、入职日期' });

    const ssBase = social_security_base || Math.min(parseFloat(salary), 15000);

    const result = await pool.query(
      `INSERT INTO employees (company_id, employee_code, full_name, nationality, id_card_no, position, salary, social_security_base, start_date, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [company_id, employee_code, full_name, nationality || 'ไทย', id_card_no, position, parseFloat(salary), r2(ssBase), start_date, notes]
    );
    logAudit({ company_id, action: 'create', entity_type: 'employee', entity_id: result.rows[0].id,
      description: `新增员工：${full_name}`, new_value: { employee_code, full_name, salary }, req });
    res.status(201).json(result.rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/employees/:id
router.put('/employees/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { employee_code, full_name, nationality, id_card_no, position, salary, social_security_base, start_date, notes, is_active } = req.body;

    const old = await pool.query('SELECT * FROM employees WHERE id = $1', [id]);
    if (!old.rows.length) return res.status(404).json({ error: '员工不存在' });

    const ssBase = social_security_base || Math.min(parseFloat(salary || old.rows[0].salary), 15000);

    const result = await pool.query(
      `UPDATE employees SET employee_code=$1, full_name=$2, nationality=$3, id_card_no=$4, position=$5,
       salary=$6, social_security_base=$7, start_date=$8, notes=$9, is_active=$10 WHERE id=$11 RETURNING *`,
      [employee_code, full_name, nationality, id_card_no, position, parseFloat(salary), r2(ssBase), start_date, notes, is_active !== false, id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '员工不存在' });
    logAudit({ company_id: result.rows[0].company_id, action: 'update', entity_type: 'employee', entity_id: parseInt(id),
      description: `编辑员工：${full_name}`, old_value: old.rows[0], new_value: result.rows[0], req });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/employees/:id/resign
router.post('/employees/:id/resign', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { end_date } = req.body;
    const result = await pool.query(
      `UPDATE employees SET is_active = FALSE, end_date = $1 WHERE id = $2 RETURNING *`,
      [end_date || new Date().toISOString().slice(0, 10), id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '员工不存在' });
    logAudit({ company_id: result.rows[0].company_id, action: 'update', entity_type: 'employee', entity_id: parseInt(id),
      description: `员工离职：${result.rows[0].full_name}`, req });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/employees/:id
router.delete('/employees/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const del = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    if (!del.rows.length) return res.status(404).json({ error: '员工不存在' });
    logAudit({ company_id: del.rows[0].company_id, action: 'delete', entity_type: 'employee', entity_id: parseInt(id),
      description: `删除员工：${del.rows[0].full_name}`, old_value: del.rows[0], req });
    res.json({ message: '删除成功', deleted: del.rows[0] });
  } catch (e) { next(e); }
});

// ==================== 社保计算 ====================

// POST /api/social-security/calculate
router.post('/social-security/calculate', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });

    // 获取在职员工
    const emps = await pool.query(
      `SELECT * FROM employees WHERE company_id = $1 AND is_active = TRUE ORDER BY id`,
      [company_id]
    );
    if (!emps.rows.length) return res.json({ items: [], summary: { employer: 0, employee: 0, total: 0 } });

    const records = [];
    let totalEmployer = 0, totalEmployee = 0;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const emp of emps.rows) {
        const ssBase = r2(Math.min(parseFloat(emp.salary), 15000));
        const employer = r2(ssBase * 0.05);
        const employee = r2(ssBase * 0.05);
        const total = r2(employer + employee);

        // UPSERT
        const rec = await client.query(
          `INSERT INTO social_security_records (company_id, employee_id, period_id, salary, ss_base, employer_contribution, employee_contribution, total_contribution)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (employee_id, period_id) DO UPDATE SET
             salary=EXCLUDED.salary, ss_base=EXCLUDED.ss_base,
             employer_contribution=EXCLUDED.employer_contribution,
             employee_contribution=EXCLUDED.employee_contribution,
             total_contribution=EXCLUDED.total_contribution
           RETURNING *`,
          [company_id, emp.id, period_id, emp.salary, ssBase, employer, employee, total]
        );
        records.push({ ...rec.rows[0], employee_name: emp.full_name });
        totalEmployer += employer;
        totalEmployee += employee;
      }
      await client.query('COMMIT');

      logAudit({ company_id, action: 'create', entity_type: 'social_security',
        description: `计算社保：${emps.rows.length} 人，雇主 ${r2(totalEmployer)}，员工 ${r2(totalEmployee)}`, req });

      res.json({
        items: records,
        summary: { employer: r2(totalEmployer), employee: r2(totalEmployee), total: r2(totalEmployer + totalEmployee), count: emps.rows.length }
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally { client.release(); }
  } catch (e) { next(e); }
});

// GET /api/social-security/records?company_id=xx&period_id=xx
router.get('/social-security/records', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    let sql = `SELECT ssr.*, e.full_name AS employee_name, e.employee_code
               FROM social_security_records ssr
               JOIN employees e ON e.id = ssr.employee_id
               WHERE 1=1`;
    const params = [];
    if (company_id) { params.push(company_id); sql += ` AND ssr.company_id = $${params.length}`; }
    if (period_id) { params.push(period_id); sql += ` AND ssr.period_id = $${params.length}`; }
    sql += ' ORDER BY e.id';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

// PUT /api/social-security/records/:id/paid
router.put('/social-security/records/:id/paid', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { paid_date } = req.body;
    const result = await pool.query(
      `UPDATE social_security_records SET paid = TRUE, paid_date = $1 WHERE id = $2 RETURNING *`,
      [paid_date || new Date().toISOString().slice(0, 10), id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '记录不存在' });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// GET /api/social-security/annual?company_id=xx&year=2025
router.get('/social-security/annual', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    const result = await pool.query(
      `SELECT ap.month, COUNT(DISTINCT ssr.employee_id) AS employee_count,
              COALESCE(SUM(ssr.employer_contribution),0) AS total_employer,
              COALESCE(SUM(ssr.employee_contribution),0) AS total_employee,
              COALESCE(SUM(ssr.total_contribution),0) AS total
       FROM social_security_records ssr
       JOIN accounting_periods ap ON ap.id = ssr.period_id
       WHERE ssr.company_id = $1 AND ap.year = $2
       GROUP BY ap.month ORDER BY ap.month`,
      [company_id, year]
    );
    res.json({ items: result.rows, year: parseInt(year) });
  } catch (e) { next(e); }
});

// ==================== PND.1 工资预扣税 ====================

// 泰国 PIT 累进税率表（年化）
const PIT_BRACKETS = [
  { threshold: 150000, rate: 0 },
  { threshold: 300000, rate: 0.05 },
  { threshold: 500000, rate: 0.10 },
  { threshold: 750000, rate: 0.15 },
  { threshold: 1000000, rate: 0.20 },
  { threshold: 2000000, rate: 0.25 },
  { threshold: 5000000, rate: 0.30 },
  { threshold: Infinity, rate: 0.35 }
];

function calcAnnualTax(taxableIncome) {
  let tax = 0;
  let remaining = taxableIncome;
  let prevThreshold = 0;
  for (const bracket of PIT_BRACKETS) {
    const bracketAmount = Math.min(remaining, bracket.threshold - prevThreshold);
    if (bracketAmount <= 0) break;
    tax += bracketAmount * bracket.rate;
    remaining -= bracketAmount;
    prevThreshold = bracket.threshold;
  }
  return r2(tax);
}

// POST /api/pnd1/calculate
router.post('/pnd1/calculate', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });

    const emps = await pool.query(
      `SELECT * FROM employees WHERE company_id = $1 AND is_active = TRUE ORDER BY id`,
      [company_id]
    );
    if (!emps.rows.length) return res.json({ items: [], summary: { total_salary: 0, total_wht: 0 } });

    const items = [];
    let totalSalary = 0, totalWht = 0, totalSsEmployer = 0, totalSsEmployee = 0;

    // Get SS records for this period to get actual deductions
    const ssRecords = await pool.query(
      `SELECT employee_id, employer_contribution, employee_contribution FROM social_security_records
       WHERE company_id = $1 AND period_id = $2`,
      [company_id, period_id]
    );
    const ssMap = {};
    ssRecords.rows.forEach(r => { ssMap[r.employee_id] = r; });

    for (const emp of emps.rows) {
      const salary = parseFloat(emp.salary);
      const monthsWorked = parseInt(emp.months_worked) || 12; // Default 12 for full year
      const annualized = salary * monthsWorked;

      // Personal allowance (60,000 THB) + employee SS deduction (max 9,000) as defaults
      const ssEmployeeDeduction = ssMap[emp.id] ? parseFloat(ssMap[emp.id].employee_contribution) * monthsWorked : 0;
      const personalAllowance = 60000;
      const expenseDeduction = Math.min(annualized * 0.5, 100000); // employment expense deduction 50% max 100k
      const taxableIncome = Math.max(0, annualized - expenseDeduction - personalAllowance - ssEmployeeDeduction);

      const annualTax = calcAnnualTax(taxableIncome);
      const monthlyWht = r2(annualTax / 12);

      items.push({
        employee_id: emp.id,
        employee_name: emp.full_name,
        employee_code: emp.employee_code,
        salary: r2(salary),
        annual_salary: r2(annualized),
        expense_deduction: r2(expenseDeduction),
        personal_allowance: personalAllowance,
        ss_deduction: r2(ssEmployeeDeduction),
        taxable_income: r2(taxableIncome),
        annual_tax: annualTax,
        monthly_wht: monthlyWht
      });

      totalSalary += salary;
      totalWht += monthlyWht;
    }

    res.json({
      items,
      summary: {
        total_salary: r2(totalSalary),
        total_wht: r2(totalWht),
        employee_count: emps.rows.length
      }
    });
  } catch (e) { next(e); }
});

// POST /api/pnd1/report
router.post('/pnd1/report', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.body;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });

    // Calculate first
    const emps = await pool.query(
      `SELECT * FROM employees WHERE company_id = $1 AND is_active = TRUE`, [company_id]
    );

    // Simple aggregation
    const ssRes = await pool.query(
      `SELECT COALESCE(SUM(employer_contribution),0) as emp_er, COALESCE(SUM(employee_contribution),0) as emp_ee
       FROM social_security_records WHERE company_id = $1 AND period_id = $2`, [company_id, period_id]
    );

    let totalSalary = 0, totalWht = 0;
    for (const emp of emps.rows) {
      const salary = parseFloat(emp.salary);
      totalSalary += salary;
      const annualized = salary * 12;
      const expenseDeduction = Math.min(annualized * 0.5, 100000);
      const taxableIncome = Math.max(0, annualized - expenseDeduction - 60000);
      const annualTax = calcAnnualTax(taxableIncome);
      totalWht += r2(annualTax / 12);
    }

    const result = await pool.query(
      `INSERT INTO pnd1_reports (company_id, period_id, total_salary, total_exempt, total_taxable, total_wht,
        total_ss_employer, total_ss_employee, employee_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (company_id, period_id) DO UPDATE SET
        total_salary=EXCLUDED.total_salary, total_wht=EXCLUDED.total_wht,
        total_ss_employer=EXCLUDED.total_ss_employer, total_ss_employee=EXCLUDED.total_ss_employee,
        employee_count=EXCLUDED.employee_count, status=EXCLUDED.status
       RETURNING *`,
      [company_id, period_id, r2(totalSalary), r2(totalSalary), r2(totalSalary), r2(totalWht),
       r2(ssRes.rows[0].emp_er), r2(ssRes.rows[0].emp_ee), emps.rows.length, 'draft']
    );
    logAudit({ company_id, action: 'create', entity_type: 'pnd1_report', entity_id: result.rows[0].id,
      description: `保存PND.1申报：${emps.rows.length}人，预扣税 ${r2(totalWht)}`, req });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// GET /api/pnd1/report?company_id=xx&period_id=xx
router.get('/pnd1/report', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    const result = await pool.query(
      `SELECT * FROM pnd1_reports WHERE company_id = $1 AND period_id = $2`,
      [company_id, period_id]
    );
    res.json(result.rows[0] || null);
  } catch (e) { next(e); }
});

// PUT /api/pnd1/report/:id/status
router.put('/pnd1/report/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, filed_date } = req.body;
    const result = await pool.query(
      `UPDATE pnd1_reports SET status = $1, filed_date = $2 WHERE id = $3 RETURNING *`,
      [status, filed_date || new Date().toISOString().slice(0, 10), id]
    );
    if (!result.rows.length) return res.status(404).json({ error: '申报不存在' });
    logAudit({ company_id: result.rows[0].company_id, action: 'update', entity_type: 'pnd1_report', entity_id: parseInt(id),
      description: `PND.1状态更新：${status}`, req });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
