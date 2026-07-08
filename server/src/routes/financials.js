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
    let fromDetails = parseInt(outSum.rows[0].cnt) > 0;

    let grossSales = 0;
    if (parseInt(outSum.rows[0].cnt) === 0) {
      const sales = await pool.query('SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2', [company_id, period_id]);
      if (sales.rows.length > 0) {
        let totalNetSales = 0;
        grossSales = sumFields(sales.rows, 'platform_sales');
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
    } else {
      // When from details, also compute gross sales estimate
      const sales = await pool.query('SELECT COALESCE(SUM(platform_sales),0) AS gs FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2', [company_id, period_id]);
      grossSales = r2(sales.rows[0]?.gs || 0);
    }

    const { year, month } = period.rows[0];
    let prevMonth = month - 1, prevYear = year;
    if (prevMonth < 1) { prevMonth = 12; prevYear--; }

    // Get credit forward from previous period's saved vat_reports
    const prev = await pool.query(
      `SELECT vat_credit_carry FROM vat_reports vr JOIN accounting_periods ap ON ap.id=vr.period_id WHERE vr.company_id=$1 AND ap.year=$2 AND ap.month=$3`,
      [company_id, prevYear, prevMonth]
    );
    const creditForward = prev.rows.length > 0 ? r2(prev.rows[0].vat_credit_carry) : 0;

    // Get saved status for current period
    const saved = await pool.query(
      `SELECT vr.* FROM vat_reports vr JOIN accounting_periods ap ON ap.id=vr.period_id WHERE vr.company_id=$1 AND ap.year=$2 AND ap.month=$3`,
      [company_id, year, month]
    );
    const savedRecord = saved.rows[0] || null;
    const filingStatus = savedRecord ? savedRecord.status : 'pending';

    // VAT deadline: 23rd of next month
    let deadlineMonth = month + 1, deadlineYear = year;
    if (deadlineMonth > 12) { deadlineMonth = 1; deadlineYear++; }
    const deadline = `${deadlineYear}-${String(deadlineMonth).padStart(2,'0')}-23`;

    const net = vatSales - vatPurchases - creditForward;
    const payable = net > 0 ? r2(net) : 0;
    const carry = net < 0 ? r2(Math.abs(net)) : 0;

    res.json({
      company_id: parseInt(company_id),
      period: period.rows[0],
      sales_amount: salesAmount,
      gross_sales: grossSales,
      vat_sales: vatSales,
      vat_purchases: vatPurchases,
      credit_forward: creditForward,
      vat_payable: payable,
      vat_credit_carry: carry,
      from_details: fromDetails,
      deadline: deadline,
      status: filingStatus,
      saved: savedRecord,
    });
  } catch (err) { next(err); }
});

// ==================== VAT 来源追溯 ====================
router.get('/vat-report/source-trace', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });

    const period = await pool.query('SELECT year, month FROM accounting_periods WHERE id = $1', [period_id]);
    if (period.rows.length === 0) return res.status(404).json({ error: '期间不存在' });

    // ── 销项 VAT 来源 ──
    const outDetails = await pool.query(
      'SELECT * FROM vat_output_details WHERE company_id=$1 AND period_id=$2 ORDER BY invoice_date',
      [company_id, period_id]
    );

    let outputSources = [];
    if (outDetails.rows.length > 0) {
      outputSources = outDetails.rows.map(r => ({
        source_type: r.source || 'manual',
        source_label: r.source === 'shopee' ? '平台导入(Shopee)' : r.source === 'lazada' ? '平台导入(Lazada)' : r.source === 'tiktok' ? '平台导入(TikTok)' : '手工录入',
        platform: r.source || '',
        store_name: '',
        order_date: r.invoice_date || '',
        order_no: r.invoice_no || '',
        gross_amount: r2(r.total_amount),
        net_amount: r2(r.amount_ex_vat),
        vat_amount: r2(r.vat_amount),
        customer_name: r.customer_name || '',
        description: r.description || '',
        record_id: r.id,
      }));
    } else {
      // Fallback: 电商销售记录
      const sales = await pool.query(
        'SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 ORDER BY order_date, id',
        [company_id, period_id]
      );
      outputSources = sales.rows.map(r => {
        const gross = parseFloat(r.platform_sales || 0);
        const inclusive = r.is_vat_inclusive !== false;
        const rate = parseFloat(r.vat_rate) || VAT_RATE;
        const net = inclusive ? r2(gross / (1 + rate)) : r2(gross);
        return {
          source_type: 'ecommerce',
          source_label: '电商销售估算',
          platform: r.platform || '',
          store_name: r.store_name || '',
          order_date: r.order_date || '',
          order_no: r.order_no || '',
          gross_amount: r2(gross),
          net_amount: net,
          vat_amount: r2(r.vat_sales_calculated),
          customer_name: '',
          description: r.notes || '',
          record_id: r.id,
        };
      });
    }

    // ── 进项 VAT 来源 ──
    const inputSources = [];

    // 1. VAT 进项明细表 (vat_input_details)
    const inDetails = await pool.query(
      'SELECT * FROM vat_input_details WHERE company_id=$1 AND period_id=$2 ORDER BY invoice_date',
      [company_id, period_id]
    );
    for (const r of inDetails.rows) {
      inputSources.push({
        source_type: 'vat_input_detail',
        source_label: 'VAT进项明细',
        category: r.category || '',
        supplier_name: r.supplier_name || '',
        date: r.invoice_date || '',
        invoice_no: r.invoice_no || '',
        gross_amount: r2(r.total_amount),
        net_amount: r2(r.amount_ex_vat),
        vat_amount: r2(r.vat_amount),
        deductible: r.deductible === true,
        non_deductible_reason: r.deductible === false ? '手动标记为不可抵扣' : '',
        description: r.description || '',
        record_id: r.id,
      });
    }

    // 2. 费用管理明细 (expense_details) — 仅取有VAT的
    const expDetails = await pool.query(
      "SELECT * FROM expense_details WHERE company_id=$1 AND period_id=$2 AND vat_amount > 0 ORDER BY expense_date",
      [company_id, period_id]
    );
    for (const r of expDetails.rows) {
      inputSources.push({
        source_type: 'expense',
        source_label: '费用管理',
        category: r.category || '',
        supplier_name: r.payee_name || '',
        date: r.expense_date || '',
        invoice_no: '',
        gross_amount: r2(r.total_amount),
        net_amount: r2(r.amount),
        vat_amount: r2(r.vat_amount),
        deductible: true,
        non_deductible_reason: '',
        description: r.description || '',
        record_id: r.id,
      });
    }

    // 3. 电商销售中的含税自定义扣费 — 作为进项VAT来源
    const salesWithCD = await pool.query(
      "SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 AND custom_deductions IS NOT NULL AND custom_deductions::text != '[]' ORDER BY order_date, id",
      [company_id, period_id]
    );
    for (const s of salesWithCD.rows) {
      let cdArr = [];
      try {
        cdArr = typeof s.custom_deductions === 'string' ? JSON.parse(s.custom_deductions) : s.custom_deductions;
      } catch(e) { cdArr = []; }
      if (!Array.isArray(cdArr)) cdArr = [];
      for (const cd of cdArr) {
        const amt = parseFloat(cd.amount) || 0;
        if (amt <= 0) continue;
        const inclusive = cd.is_vat_inclusive !== false;
        const rate = parseFloat(s.vat_rate) || VAT_RATE;
        const net = inclusive ? r2(amt / (1 + rate)) : r2(amt);
        const vat = inclusive ? r2(amt - net) : 0;
        inputSources.push({
          source_type: 'custom_deduction',
          source_label: '电商销售自定义扣费',
          category: cd.name || '自定义扣费',
          supplier_name: s.platform || '',
          date: s.order_date || '',
          invoice_no: s.order_no || '',
          gross_amount: r2(amt),
          net_amount: net,
          vat_amount: vat,
          deductible: inclusive,
          non_deductible_reason: inclusive ? '' : '未含税，不可抵扣',
          description: cd.notes || '',
          record_id: s.id,
        });
      }
    }

    // 4. 进口 VAT — 从电商销售记录
    const salesWithImport = await pool.query(
      'SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 AND import_vat_paid > 0 ORDER BY order_date, id',
      [company_id, period_id]
    );
    for (const s of salesWithImport.rows) {
      inputSources.push({
        source_type: 'import_vat',
        source_label: '进口VAT',
        category: 'import',
        supplier_name: '海关',
        date: s.order_date || '',
        invoice_no: s.order_no || '',
        gross_amount: r2(s.import_vat_paid),
        net_amount: r2(s.import_vat_paid / (1 + VAT_RATE)),
        vat_amount: r2(s.import_vat_paid),
        deductible: true,
        non_deductible_reason: '',
        description: '进口清关VAT',
        record_id: s.id,
      });
    }

    // 汇总
    const outputTotal = r2(outputSources.reduce((s, r) => s + r.vat_amount, 0));
    const inputDeductible = r2(inputSources.filter(r => r.deductible).reduce((s, r) => s + r.vat_amount, 0));
    const inputNonDeductible = r2(inputSources.filter(r => !r.deductible).reduce((s, r) => s + r.vat_amount, 0));
    const inputTotal = r2(inputDeductible + inputNonDeductible);

    // Source type stats
    const outputBySource = {};
    for (const r of outputSources) {
      const k = r.source_label;
      outputBySource[k] = r2((outputBySource[k] || 0) + r.vat_amount);
    }
    const inputBySource = {};
    for (const r of inputSources) {
      const k = r.source_label;
      inputBySource[k] = r2((inputBySource[k] || 0) + r.vat_amount);
    }

    res.json({
      company_id: parseInt(company_id),
      period: period.rows[0],
      output_sources: outputSources,
      input_sources: inputSources,
      summary: {
        output_vat_total: outputTotal,
        input_vat_deductible: inputDeductible,
        input_vat_non_deductible: inputNonDeductible,
        input_vat_total: inputTotal,
        output_record_count: outputSources.length,
        input_record_count: inputSources.length,
      },
      breakdown: {
        output_by_source: outputBySource,
        input_by_source: inputBySource,
      },
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

    const sum = (f) => sales.rows.reduce((s, r) => s + parseFloat(r[f] || 0), 0);
    const cash = r2(sum('platform_sales') - sum('platform_refunds') - sum('cost_of_goods') - sum('platform_fees') - sum('rental_fees') - sum('salary_fees') - sum('warehouse_fees') - sum('other_expenses') - sum('advertising_fees') - sum('shipping_fees'));
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
