const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { VAT_RATE } = require('../constants');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

function calcProfitLoss(s) {
  const gross = r2(s.platform_sales);
  const refunds = r2(s.platform_refunds);
  const otherInc = r2(s.other_income);
  const shippingInc = r2(s.shipping_income);
  const discountVal = r2(s.discounts);
  const platformSubsidy = r2(s.platform_subsidy);
  const netSales = gross - refunds;
  const netExVat = s._net_ex_vat_override !== undefined
    ? s._net_ex_vat_override
    : r2(netSales  / (1 + VAT_RATE));

  const cogsVal = r2(s.cost_of_goods);
  const platformFees = r2(s.platform_fees);
  const advertising = r2(s.advertising_fees);
  const shipping = r2(s.shipping_fees);
  const transactionFee = r2(s.transaction_fee);
  const whtDeducted = r2(s.wht_deducted);
  const campaignFee = r2(s.campaign_fee);
  const affiliateCommission = r2(s.affiliate_commission);
  const codFee = r2(s.cod_fee);
  const costTotal = r2(cogsVal + platformFees + advertising + shipping + transactionFee + whtDeducted + campaignFee + affiliateCommission + codFee);

  const rent = r2(s.rental_fees);
  const salary = r2(s.salary_fees);
  const warehouse = r2(s.warehouse_fees);
  const otherExp = r2(s.other_expenses);
  const expTotal = r2(rent + salary + warehouse + otherExp);

  const importVat = r2(s.import_vat_paid);
  const importDuty = r2(s.import_duty_paid);

  const grossProfit = r2(netExVat - costTotal);
  const netProfit = r2(grossProfit - expTotal);

  return {
    sales: {
      gross, refunds, shipping_income: shippingInc, discounts: discountVal,
      platform_subsidy: platformSubsidy, other_income: otherInc,
      net: r2(netSales), net_ex_vat: netExVat,
      vat_sales: r2(s.vat_sales_calculated),
    },
    costs: {
      cogs: cogsVal, platform_fees: platformFees, advertising, shipping,
      transaction_fee: transactionFee, wht_deducted: whtDeducted,
      campaign_fee: campaignFee, affiliate_commission: affiliateCommission,
      cod_fee: codFee, total: costTotal,
    },
    expenses: { rent, salary, warehouse, other: otherExp, total: expTotal },
    imports: { import_vat: importVat, import_duty: importDuty },
    gross_profit: grossProfit,
    net_profit: netProfit,
  };
}

function sumFields(rows, field) {
  return r2(rows.reduce((s, r) => s + parseFloat(r[field] || 0), 0));
}

// ==================== 简化利润表 (从 ecommerce_sales) ====================
router.get('/profit-loss', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少参数' });
    }
    const period = await pool.query('SELECT year, month FROM accounting_periods WHERE id = $1', [period_id]);
    if (period.rows.length === 0) return res.status(404).json({ error: '期间不存在' });

    const { year, month } = period.rows[0];

    const sales = await pool.query(
      'SELECT * FROM ecommerce_sales WHERE company_id = $1 AND period_id = $2',
      [company_id, period_id]
    );

    let current;
    if (sales.rows.length > 0) {
      // Compute netExVat correctly for mixed inclusive/exclusive rows
      let aggNetExVat = 0;
      for (const r of sales.rows) {
        const gross = parseFloat(r.platform_sales || 0) - parseFloat(r.platform_refunds || 0);
        const inclusive = r.is_vat_inclusive !== false;
        const rate = parseFloat(r.vat_rate) || VAT_RATE;
        aggNetExVat += inclusive ? gross / (1 + rate) : gross;
      }
      const agg = {
        _net_ex_vat_override: r2(aggNetExVat),
        platform_sales: sumFields(sales.rows, 'platform_sales'),
        platform_refunds: sumFields(sales.rows, 'platform_refunds'),
        other_income: sumFields(sales.rows, 'other_income'),
        shipping_income: sumFields(sales.rows, 'shipping_income'),
        discounts: sumFields(sales.rows, 'discounts'),
        platform_subsidy: sumFields(sales.rows, 'platform_subsidy'),
        cost_of_goods: sumFields(sales.rows, 'cost_of_goods'),
        platform_fees: sumFields(sales.rows, 'platform_fees'),
        advertising_fees: sumFields(sales.rows, 'advertising_fees'),
        shipping_fees: sumFields(sales.rows, 'shipping_fees'),
        transaction_fee: sumFields(sales.rows, 'transaction_fee'),
        wht_deducted: sumFields(sales.rows, 'wht_deducted'),
        campaign_fee: sumFields(sales.rows, 'campaign_fee'),
        affiliate_commission: sumFields(sales.rows, 'affiliate_commission'),
        cod_fee: sumFields(sales.rows, 'cod_fee'),
        rental_fees: sumFields(sales.rows, 'rental_fees'),
        salary_fees: sumFields(sales.rows, 'salary_fees'),
        warehouse_fees: sumFields(sales.rows, 'warehouse_fees'),
        other_expenses: sumFields(sales.rows, 'other_expenses'),
        import_vat_paid: sumFields(sales.rows, 'import_vat_paid'),
        import_duty_paid: sumFields(sales.rows, 'import_duty_paid'),
        actual_received: sumFields(sales.rows, 'actual_received'),
        vat_sales_calculated: sumFields(sales.rows, 'vat_sales_calculated'),
        vat_purchases_calculated: sumFields(sales.rows, 'vat_purchases_calculated'),
      };
      current = calcProfitLoss(agg);
    } else {
      current = {
        sales: { gross: 0, refunds: 0, shipping_income: 0, discounts: 0, platform_subsidy: 0, other_income: 0, net: 0, net_ex_vat: 0, vat_sales: 0 },
        costs: { cogs: 0, platform_fees: 0, advertising: 0, shipping: 0, transaction_fee: 0, wht_deducted: 0, campaign_fee: 0, affiliate_commission: 0, cod_fee: 0, total: 0 },
        expenses: { rent: 0, salary: 0, warehouse: 0, other: 0, total: 0 },
        imports: { import_vat: 0, import_duty: 0 },
        gross_profit: 0,
        net_profit: 0,
      };
    }

    // YTD: sum all periods from month 1 to current month of the same year
    const ytdRows = await pool.query(
      `SELECT es.* FROM ecommerce_sales es
       JOIN accounting_periods ap ON ap.id = es.period_id
       WHERE es.company_id = $1 AND ap.year = $2 AND ap.month >= 1 AND ap.month <= $3`,
      [company_id, year, month]
    );

    let ytd;
    if (ytdRows.rows.length > 0) {
      // Sum all fields across periods
      const merged = ytdRows.rows.reduce((acc, r) => {
        for (const k of Object.keys(r)) {
          if (['id', 'company_id', 'period_id', 'created_at', 'updated_at'].includes(k)) continue;
          acc[k] = (parseFloat(acc[k]) || 0) + parseFloat(r[k] || 0);
        }
        return acc;
      }, {});
      ytd = calcProfitLoss(merged);
    } else {
      ytd = current;
    }

    res.json({
      company_id: parseInt(company_id),
      period: period.rows[0],
      ...current,
      ytd,
      vat_sales_calculated: sumFields(sales.rows, 'vat_sales_calculated'),
      vat_purchases_calculated: sumFields(sales.rows, 'vat_purchases_calculated'),
    });
  } catch (err) { next(err); }
});

// ==================== VAT 申报（从明细表取精确值）====================
router.get('/vat-report', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });

    const period = await pool.query('SELECT year, month FROM accounting_periods WHERE id = $1', [period_id]);
    if (period.rows.length === 0) return res.status(404).json({ error: '期间不存在' });

    const [outSum, inSum] = await Promise.all([
      pool.query('SELECT COALESCE(SUM(amount_ex_vat),0) as ex, COALESCE(SUM(vat_amount),0) as vat, COUNT(*) as cnt FROM vat_output_details WHERE company_id=$1 AND period_id=$2', [company_id, period_id]),
      pool.query('SELECT COALESCE(SUM(vat_amount),0) as vat, COUNT(*) as cnt FROM vat_input_details WHERE company_id=$1 AND period_id=$2 AND deductible=true', [company_id, period_id])
    ]);

    let salesAmount = r2(outSum.rows[0].ex);
    let vatSales = r2(outSum.rows[0].vat);
    let vatPurchases = r2(inSum.rows[0].vat);

    if (parseInt(outSum.rows[0].cnt) === 0) {
      const sales = await pool.query('SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2', [company_id, period_id]);
      if (sales.rows.length > 0) {
        let totalNetSales = 0;
        for (const r of sales.rows) {
          const gross = parseFloat(r.platform_sales || 0) - parseFloat(r.platform_refunds || 0);
          const inclusive = r.is_vat_inclusive !== false;
          const rate = parseFloat(r.vat_rate) || VAT_RATE;
          totalNetSales += inclusive ? gross / (1 + rate) : gross;
        }
        salesAmount = r2(totalNetSales);
        vatSales = sumFields(sales.rows, 'vat_sales_calculated');
        vatPurchases = sumFields(sales.rows, 'vat_purchases_calculated');
      }
    }

    const { year, month } = period.rows[0];
    let prevMonth = month - 1, prevYear = year;
    if (prevMonth < 1) { prevMonth = 12; prevYear--; }
    const prev = await pool.query(
      `SELECT vat_credit_carry FROM vat_reports vr JOIN accounting_periods ap ON ap.id=vr.period_id WHERE vr.company_id=$1 AND ap.year=$2 AND ap.month=$3`,
      [company_id, prevYear, prevMonth]
    );
    const creditForward = prev.rows.length > 0 ? r2(prev.rows[0].vat_credit_carry) : 0;

    const net = vatSales - vatPurchases - creditForward;
    const payable = net > 0 ? r2(net) : 0;
    const carry = net < 0 ? r2(Math.abs(net)) : 0;

    res.json({
      company_id: parseInt(company_id),
      period: period.rows[0],
      sales_amount: salesAmount,
      vat_sales: vatSales,
      vat_purchases: vatPurchases,
      credit_forward: creditForward,
      vat_payable: payable,
      vat_credit_carry: carry,
    });
  } catch (err) { next(err); }
});

// ==================== 资产负债表 ====================
router.get('/balance-sheet', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });

    const period = await pool.query('SELECT year, month FROM accounting_periods WHERE id = $1', [period_id]);
    if (period.rows.length === 0) return res.status(404).json({ error: '期间不存在' });

    const sales = await pool.query('SELECT * FROM ecommerce_sales WHERE company_id = $1 AND period_id = $2', [company_id, period_id]);
    if (sales.rows.length === 0) {
      return res.json({
        company_id: parseInt(company_id), period: period.rows[0],
        assets: { items: [], total: 0 },
        liabilities: { items: [], total: 0 },
        equity: { items: [], total: 0 },
        balanced: true,
      });
    }

    const s = sales.rows[0];
    // Simplified balance sheet from ecommerce data
    const cash = r2(parseFloat(s.platform_sales) - parseFloat(s.platform_refunds) - parseFloat(s.cost_of_goods) - parseFloat(s.platform_fees) - parseFloat(s.rental_fees) - parseFloat(s.salary_fees) - parseFloat(s.warehouse_fees) - parseFloat(s.other_expenses) - parseFloat(s.advertising_fees) - parseFloat(s.shipping_fees));
    const totalAssets = cash;

    res.json({
      company_id: parseInt(company_id), period: period.rows[0],
      assets: {
        items: [{ code: '1001', name: '货币资金（估算）', amount: totalAssets }],
        total: totalAssets,
      },
      liabilities: { items: [], total: 0 },
      equity: { items: [{ code: '4002', name: '未分配利润（估算）', amount: totalAssets }], total: totalAssets },
      balanced: true,
    });
  } catch (err) { next(err); }
});

module.exports = router;
