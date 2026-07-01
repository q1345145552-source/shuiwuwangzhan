const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { VAT_RATE } = require('../constants');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// 获取某年所有月份
async function getMonths(companyId, year) {
  const res = await pool.query(
    `SELECT id, year, month FROM accounting_periods
     WHERE company_id = $1 AND year = $2 ORDER BY month`, [companyId, year]);
  return res.rows;
}

// POST /api/data-validator/check-sales-vat
router.post('/check-sales-vat', async (req, res, next) => {
  try {
    const { company_id, year } = req.body;
    const months = await getMonths(company_id, year);
    const checks = [];
    let mismatches = 0, totalDiff = 0;

    for (const m of months) {
      // 从 ecommerce_sales 取数
      const sales = await pool.query(
        'SELECT platform_sales, platform_refunds FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2',
        [company_id, m.id]
      );
      const s = sales.rows[0] || { platform_sales: 0, platform_refunds: 0 };
      const netSales = r2(((s.platform_sales || 0) - (s.platform_refunds || 0))  / (1 + VAT_RATE));
      const vatExpected = r2(netSales * VAT_RATE);

      // 从 vat_output_details 取已申报销项
      const vatRes = await pool.query(
        'SELECT COALESCE(SUM(vat_amount),0) as vat_reported FROM vat_output_details WHERE company_id=$1 AND period_id=$2',
        [company_id, m.id]
      );
      const vatReported = r2(vatRes.rows[0].vat_reported);

      const diff = r2(vatReported - vatExpected);
      const match = Math.abs(diff) < 0.01;

      if (!match) { mismatches++; totalDiff += diff; }

      checks.push({
        month: m.month,
        sales_revenue: netSales,
        vat_reported: vatReported,
        vat_expected: vatExpected,
        difference: diff,
        match
      });
    }

    res.json({
      checks,
      summary: { total_mismatch: mismatches, total_difference: r2(totalDiff) }
    });
  } catch (e) { next(e); }
});

// POST /api/data-validator/check-input-vat
router.post('/check-input-vat', async (req, res, next) => {
  try {
    const { company_id, year } = req.body;
    const months = await getMonths(company_id, year);
    const checks = [];
    let mismatches = 0;

    for (const m of months) {
      const inp = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN deductible THEN vat_amount ELSE 0 END),0) as input_vat
         FROM vat_input_details WHERE company_id=$1 AND period_id=$2`,
        [company_id, m.id]
      );
      const inputVatFromDetails = r2(inp.rows[0].input_vat);

      // 从 vat_reports 取申报的进项（如果有）
      const vr = await pool.query(
        `SELECT vat_purchases FROM vat_reports WHERE company_id=$1 AND period_id=$2`,
        [company_id, m.id]
      );
      const inputVatReported = r2(vr.rows[0]?.vat_purchases || 0);

      const match = Math.abs(inputVatFromDetails - inputVatReported) < 0.01;
      if (!match) mismatches++;

      checks.push({
        month: m.month,
        input_vat_from_details: inputVatFromDetails,
        input_vat_reported: inputVatReported,
        match
      });
    }
    res.json({ checks, summary: { total_mismatch: mismatches } });
  } catch (e) { next(e); }
});

// POST /api/data-validator/check-expense-wht
router.post('/check-expense-wht', async (req, res, next) => {
  try {
    const { company_id, year } = req.body;
    // 找出 expense_details 中 wht_amount > 0 的记录
    const expQuery = await pool.query(
      `SELECT ed.*, ap.month FROM expense_details ed
       JOIN accounting_periods ap ON ap.id = ed.period_id
       WHERE ed.company_id = $1 AND ap.year = $2 AND ed.wht_amount > 0
       ORDER BY ap.month`,
      [company_id, year]
    );

    const items = [];
    for (const exp of expQuery.rows) {
      // 在 wht_details 中找匹配
      const wht = await pool.query(
        `SELECT wd.* FROM wht_details wd
         JOIN wht_reports wr ON wr.id = wd.report_id
         WHERE wr.company_id = $1 AND wd.payment_amount = $2 AND wd.wht_amount = $3`,
        [company_id, exp.amount, exp.wht_amount]
      );
      items.push({
        expense_id: exp.id,
        month: exp.month,
        category: exp.category,
        payee_name: exp.payee_name,
        amount: exp.amount,
        wht_amount: exp.wht_amount,
        wht_certificate_no: exp.wht_certificate_no,
        matched: wht.rows.length > 0
      });
    }
    res.json({ items, summary: { total: items.length, unmatched: items.filter(i => !i.matched).length } });
  } catch (e) { next(e); }
});

// POST /api/data-validator/check-missing-data
router.post('/check-missing-data', async (req, res, next) => {
  try {
    const { company_id, year } = req.body;
    const months = await getMonths(company_id, year);
    const checks = [];
    let complete = 0, partial = 0, missing = 0;

    const vatReg = await pool.query(
      'SELECT vat_registered FROM compliance_settings WHERE company_id=$1', [company_id]
    );
    const vatRegistered = vatReg.rows[0]?.vat_registered || false;

    for (const m of months) {
      // 检查各模块数据
      const [sales, vatOut, vatIn, vatReport, expenses, bank] = await Promise.all([
        pool.query('SELECT id FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM vat_output_details WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM vat_input_details WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM vat_reports WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM expense_details WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM bank_transactions WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id])
      ]);

      const hasSales = sales.rows.length > 0;
      const hasVatDetail = vatOut.rows.length > 0 || vatIn.rows.length > 0;
      const hasVatReport = vatReport.rows.length > 0;
      const hasExpenses = expenses.rows.length > 0;
      const hasBank = bank.rows.length > 0;

      const score = [hasSales, hasVatDetail, hasVatReport || !vatRegistered, hasExpenses, hasBank].filter(Boolean).length;
      const total = vatRegistered ? 5 : 4;
      let status = 'complete';
      if (score === 0) status = 'missing';
      else if (score < total) status = 'partial';

      if (status === 'complete') complete++;
      else if (status === 'partial') partial++;
      else missing++;

      checks.push({
        month: m.month,
        has_sales: hasSales,
        has_vat_details: hasVatDetail,
        has_vat_report: hasVatReport,
        has_expenses: hasExpenses,
        has_bank: hasBank,
        status
      });
    }
    res.json({ checks, summary: { complete, partial, missing } });
  } catch (e) { next(e); }
});

// POST /api/data-validator/full-check
router.post('/full-check', async (req, res, next) => {
  try {
    const { company_id, year } = req.body;

    // 复用上面4个检查的逻辑
    // check-sales-vat
    const months = await getMonths(company_id, year);
    const salesVatChecks = [];
    let salesVatMismatch = 0, salesVatDiff = 0;
    for (const m of months) {
      const sales = await pool.query(
        'SELECT platform_sales, platform_refunds FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2', [company_id, m.id]);
      const s = sales.rows[0] || { platform_sales: 0, platform_refunds: 0 };
      const netSales = r2(((s.platform_sales || 0) - (s.platform_refunds || 0))  / (1 + VAT_RATE));
      const vatExpected = r2(netSales * VAT_RATE);
      const vatRes = await pool.query(
        'SELECT COALESCE(SUM(vat_amount),0) as vr FROM vat_output_details WHERE company_id=$1 AND period_id=$2', [company_id, m.id]);
      const vatReported = r2(vatRes.rows[0].vr);
      const diff = r2(vatReported - vatExpected);
      const match = Math.abs(diff) < 0.01;
      if (!match) { salesVatMismatch++; salesVatDiff += diff; }
    }

    // check-input-vat
    let inputVatMismatch = 0;
    for (const m of months) {
      const inp = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN deductible THEN vat_amount ELSE 0 END),0) as iv
         FROM vat_input_details WHERE company_id=$1 AND period_id=$2`, [company_id, m.id]);
      const iv = r2(inp.rows[0].iv);
      const vr = await pool.query('SELECT vat_purchases FROM vat_reports WHERE company_id=$1 AND period_id=$2', [company_id, m.id]);
      const ir = r2(vr.rows[0]?.vat_purchases || 0);
      if (Math.abs(iv - ir) >= 0.01) inputVatMismatch++;
    }

    // check-expense-wht
    const whtExp = await pool.query(
      `SELECT ed.* FROM expense_details ed JOIN accounting_periods ap ON ap.id = ed.period_id
       WHERE ed.company_id = $1 AND ap.year = $2 AND ed.wht_amount > 0`, [company_id, year]);
    let whtUnmatched = 0;
    for (const exp of whtExp.rows) {
      const wht = await pool.query(
        `SELECT wd.id FROM wht_details wd JOIN wht_reports wr ON wr.id = wd.report_id
         WHERE wr.company_id = $1 AND wd.payment_amount = $2 AND wd.wht_amount = $3`, [company_id, exp.amount, exp.wht_amount]);
      if (!wht.rows.length) whtUnmatched++;
    }

    // check-missing-data
    const vatReg = await pool.query('SELECT vat_registered FROM compliance_settings WHERE company_id=$1', [company_id]);
    const vatRegistered = vatReg.rows[0]?.vat_registered || false;
    let complete = 0, partialMonths = 0, missingMonths = 0;
    for (const m of months) {
      const [sa, vo, vi, vr2, ex, bk] = await Promise.all([
        pool.query('SELECT id FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM vat_output_details WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM vat_input_details WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM vat_reports WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM expense_details WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id]),
        pool.query('SELECT id FROM bank_transactions WHERE company_id=$1 AND period_id=$2 LIMIT 1', [company_id, m.id])
      ]);
      const score = [sa.rows.length > 0, vo.rows.length > 0 || vi.rows.length > 0,
        vr2.rows.length > 0 || !vatRegistered, ex.rows.length > 0, bk.rows.length > 0].filter(Boolean).length;
      const total = vatRegistered ? 5 : 4;
      if (score === total) complete++;
      else if (score === 0) missingMonths++;
      else partialMonths++;
    }

    const totalIssues = salesVatMismatch + inputVatMismatch + whtUnmatched + missingMonths + partialMonths;
    const passedCount = (salesVatMismatch === 0 ? 1 : 0) + (inputVatMismatch === 0 ? 1 : 0) +
      (whtUnmatched === 0 ? 1 : 0) + (missingMonths + partialMonths === 0 ? 1 : 0);

    res.json({
      results: {
        sales_vat: { mismatches: salesVatMismatch, total_difference: r2(salesVatDiff) },
        input_vat: { mismatches: inputVatMismatch },
        expense_wht: { unmatched: whtUnmatched, total: whtExp.rows.length },
        data_completeness: { complete, partial: partialMonths, missing: missingMonths }
      },
      summary: { passed: passedCount, total_issues: totalIssues, total_checks: 4 }
    });
  } catch (e) { next(e); }
});

module.exports = router;
