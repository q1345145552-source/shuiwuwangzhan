const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { VAT_RATE } = require('../constants');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// ==================== 年度数据聚合 ====================
// GET /api/cit/annual-data?company_id=xx&year=2025
router.get('/annual-data', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });

    // Aggregate from ecommerce_sales for all periods in the year
    const agg = await pool.query(
      `SELECT
        COALESCE(SUM(platform_sales - platform_refunds), 0)  / ${1 + VAT_RATE} as platform_revenue,
        COALESCE(SUM(other_income), 0) as other_revenue,
        COALESCE(SUM(cost_of_goods), 0) as cost_of_goods,
        COALESCE(SUM(platform_fees), 0) as platform_fees,
        COALESCE(SUM(advertising_fees), 0) as advertising_fees,
        COALESCE(SUM(shipping_fees), 0) as shipping_fees,
        COALESCE(SUM(rental_fees), 0) as rental_fees,
        COALESCE(SUM(salary_fees), 0) as salary_fees,
        COALESCE(SUM(warehouse_fees), 0) as warehouse_fees,
        COALESCE(SUM(other_expenses), 0) as other_expenses,
        COALESCE(SUM(import_duty_paid), 0) as import_duty,
        COUNT(*) as month_count
       FROM ecommerce_sales es
       JOIN accounting_periods ap ON ap.id = es.period_id
       WHERE es.company_id=$1 AND ap.year=$2`,
      [company_id, year]
    );

    const a = agg.rows[0];
    const totalRevenue = r2(parseFloat(a.platform_revenue) + parseFloat(a.other_revenue));
    const totalExpenses = r2(
      parseFloat(a.cost_of_goods) + parseFloat(a.platform_fees) + parseFloat(a.advertising_fees) +
      parseFloat(a.shipping_fees) + parseFloat(a.rental_fees) + parseFloat(a.salary_fees) +
      parseFloat(a.warehouse_fees) + parseFloat(a.other_expenses) + parseFloat(a.import_duty)
    );
    const netProfit = r2(totalRevenue - totalExpenses);

    // Get expense_details aggregation as supplemental
    const expAgg = await pool.query(
      `SELECT category, COALESCE(SUM(amount),0) as total FROM expense_details ed
       JOIN accounting_periods ap ON ap.id = ed.period_id
       WHERE ed.company_id=$1 AND ap.year=$2 GROUP BY category`,
      [company_id, year]
    );

    res.json({
      company_id: parseInt(company_id),
      year: parseInt(year),
      total_revenue: totalRevenue,
      platform_revenue: r2(a.platform_revenue),
      other_revenue: r2(a.other_revenue),
      total_expenses: totalExpenses,
      cost_of_goods: r2(a.cost_of_goods),
      platform_fees: r2(a.platform_fees),
      advertising_fees: r2(a.advertising_fees),
      shipping_fees: r2(a.shipping_fees),
      rental_fees: r2(a.rental_fees),
      salary_fees: r2(a.salary_fees),
      warehouse_fees: r2(a.warehouse_fees),
      utility_fees: 0,
      other_expenses: r2(a.other_expenses),
      import_duty: r2(a.import_duty),
      net_profit: netProfit,
      months_with_data: parseInt(a.month_count),
      expense_details_summary: expAgg.rows,
    });
  } catch (err) { next(err); }
});

// ==================== CIT 税额计算 ====================
// POST /api/cit/calculate-tax
router.post('/calculate-tax', async (req, res, next) => {
  try {
    const { company_id, net_profit, tax_rate, wht_credit } = req.body;
    const profit = parseFloat(net_profit) || 0;
    let rate = parseFloat(tax_rate) || 0;

    // Auto-determine rate if tax_rate is 'auto'
    if (!rate || tax_rate === 'auto') {
      if (company_id) {
        const comp = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id]);
        const company = comp.rows[0] || {};

        // 获取年度总收入用于 SME 判断（优先用 cit_reports 中的值，其次用 ecommerce_sales 汇总）
        let totalRevenue = profit;
        try {
          const revResult = await pool.query(
            'SELECT COALESCE(SUM((platform_sales - platform_refunds)  / (1 + VAT_RATE)), 0) as total FROM ecommerce_sales WHERE company_id = $1',
            [company_id]
          );
          totalRevenue = parseFloat(revResult.rows[0]?.total) || profit;
        } catch (e) { /* fallback to profit */ }

        // SME 判断：注册资本 <= 500万 THB 且 年收入 <= 3000万 THB
        const registeredCapital = parseFloat(company.registered_capital || 0);
        const isSME = registeredCapital <= 5000000 && totalRevenue <= 30000000;

        if (isSME) {
          // 中小企业累进税率
          if (profit <= 300000) rate = 0;
          else if (profit <= 3000000) rate = 15;
          else rate = 20;
        } else {
          // 非 SME 统一 20%
          rate = 20;
        }
      } else {
        rate = profit <= 300000 ? 0 : profit <= 3000000 ? 15 : 20;
      }
    }

    const taxableProfit = Math.max(0, profit);
    let taxAmount;

    if (rate === 20 && taxableProfit > 3000000) {
      // 非 SME: 统一 20%（实际系统按累进更常见，此处按用户输入税率）
      taxAmount = r2(taxableProfit * 0.20);
    } else if (rate === 20) {
      // 利润未超 300 万的小企业仍按 20% 统一税率
      taxAmount = r2(taxableProfit * 0.20);
    } else {
      // SME 累进税率
      if (taxableProfit <= 300000) {
        taxAmount = 0;
      } else if (taxableProfit <= 3000000) {
        taxAmount = r2((taxableProfit - 300000) * 0.15);
      } else {
        taxAmount = r2((3000000 - 300000) * 0.15 + (taxableProfit - 3000000) * 0.20);
      }
    }

    const credit = r2(wht_credit || 0);
    const taxPayable = r2(Math.max(0, taxAmount - credit));

    res.json({
      net_profit: taxableProfit,
      tax_base: taxableProfit,
      tax_rate: rate,
      tax_amount: taxAmount,
      wht_credit: credit,
      tax_payable: taxPayable,
    });
  } catch (err) { next(err); }
});

// ==================== CIT 申报 CRUD ====================
// GET /api/cit/report?company_id=xx&year=2025
router.get('/report', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });
    const result = await pool.query(
      'SELECT * FROM cit_reports WHERE company_id=$1 AND year=$2', [company_id, year]
    );
    res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (err) { next(err); }
});

// POST /api/cit/report
router.post('/report', async (req, res, next) => {
  try {
    const { company_id, year, ...fields } = req.body;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });

    const numKeys = [
      'total_revenue','platform_revenue','other_revenue','total_expenses',
      'cost_of_goods','platform_fees','advertising_fees','shipping_fees',
      'rental_fees','salary_fees','warehouse_fees','utility_fees','other_expenses','import_duty',
      'net_profit','tax_base','tax_rate','tax_amount','wht_credit','half_year_paid','tax_payable'
    ];
    const vals = numKeys.map(k => r2(fields[k] || 0));
    vals.push(company_id, year);
    vals.push(fields.status || 'draft', fields.notes || '');

    const result = await pool.query(
      `INSERT INTO cit_reports (${numKeys.join(',')}, company_id, year, status, notes)
       VALUES (${numKeys.map((_,i)=>`$${i+1}`).join(',')}, $${numKeys.length+1}, $${numKeys.length+2}, $${numKeys.length+3}, $${numKeys.length+4})
       ON CONFLICT (company_id, year)
       DO UPDATE SET ${numKeys.map(k=>`${k}=EXCLUDED.${k}`).join(',')}, status=$3, notes=$4
       RETURNING *`.replace('status=$3', `status=$${numKeys.length+3}`).replace('notes=$4', `notes=$${numKeys.length+4}`),
      vals
    );

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/cit/report/:id/status
router.put('/report/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['draft', 'filed'].includes(status)) return res.status(400).json({ error: '状态无效' });
    const sql = status === 'filed'
      ? 'UPDATE cit_reports SET status=$1, filed_date=NOW() WHERE id=$2 RETURNING *'
      : 'UPDATE cit_reports SET status=$1 WHERE id=$2 RETURNING *';
    const result = await pool.query(sql, [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '不存在' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// ==================== 半年预付 PND.51 ====================
// GET /api/cit/half-year?company_id=xx&year=2025
router.get('/half-year', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });
    const result = await pool.query(
      'SELECT * FROM cit_half_year WHERE company_id=$1 AND year=$2', [company_id, year]
    );
    res.json(result.rows.length > 0 ? result.rows[0] : null);
  } catch (err) { next(err); }
});

// POST /api/cit/half-year
router.post('/half-year', async (req, res, next) => {
  try {
    const { company_id, year, half_year_revenue, half_year_expenses, estimated_profit, estimated_tax, paid_amount, status, paid_date } = req.body;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });

    // Delete then insert (simpler than upsert)
    await pool.query('DELETE FROM cit_half_year WHERE company_id=$1 AND year=$2', [company_id, year]);
    const result = await pool.query(
      `INSERT INTO cit_half_year (company_id, year, half_year_revenue, half_year_expenses, estimated_profit, estimated_tax, paid_amount, status, paid_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [company_id, year, r2(half_year_revenue||0), r2(half_year_expenses||0), r2(estimated_profit||0),
       r2(estimated_tax||0), r2(paid_amount||0), status||'draft', paid_date||null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
