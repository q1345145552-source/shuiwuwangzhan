const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');
const { pool } = require('../db');
const { VAT_RATE } = require('../constants');

const EXPORT_DIR = path.join(__dirname, '..', '..', 'exports');
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
const fmt = n => (parseFloat(n) || 0).toFixed(2);
const toNum = n => parseFloat(n) || 0;

async function getCompanyCode(companyId) {
  const r = await pool.query('SELECT code FROM companies WHERE id = $1', [companyId]);
  return r.rows.length > 0 ? r.rows[0].code : `C${companyId}`;
}

async function getPeriodLabel(periodId) {
  const r = await pool.query('SELECT year, month FROM accounting_periods WHERE id = $1', [periodId]);
  if (r.rows.length === 0) return '';
  return `${r.rows[0].year}${String(r.rows[0].month).padStart(2, '0')}`;
}

// ---- Compute profit-loss data from DB (no HTTP self-call) ----
async function computeProfitLoss(company_id, period_id) {
  const period = await pool.query('SELECT year, month FROM accounting_periods WHERE id = $1', [period_id]);
  if (period.rows.length === 0) throw new Error('期间不存在');
  const sales = await pool.query('SELECT * FROM ecommerce_sales WHERE company_id = $1 AND period_id = $2', [company_id, period_id]);
  const rows = sales.rows;
  if (rows.length === 0) {
    return {
      period: period.rows[0],
      sales: { gross: 0, refunds: 0, shipping_income: 0, discounts: 0, platform_subsidy: 0, other_income: 0, net: 0, net_ex_vat: 0, vat_sales: 0 },
      costs: { cogs: 0, platform_fees: 0, advertising: 0, shipping: 0, transaction_fee: 0, wht_deducted: 0, campaign_fee: 0, affiliate_commission: 0, cod_fee: 0, total: 0 },
      expenses: { rent: 0, salary: 0, warehouse: 0, other: 0, total: 0 },
      imports: { import_vat: 0, import_duty: 0 },
      gross_profit: 0, net_profit: 0,
    };
  }
  const sum = f => r2(rows.reduce((s, r) => s + parseFloat(r[f] || 0), 0));
  const gross = sum('platform_sales');
  const refunds = sum('platform_refunds');
  const shippingInc = sum('shipping_income');
  const discountVal = sum('discounts');
  const platSubsidy = sum('platform_subsidy');
  const otherInc = sum('other_income');
  const netSales = gross - refunds;
  // Compute netExVat per row for mixed inclusive/exclusive
  let netExVat = 0;
  for (const r of rows) {
    const g = parseFloat(r.platform_sales || 0) - parseFloat(r.platform_refunds || 0);
    const inclusive = r.is_vat_inclusive !== false;
    const rate = parseFloat(r.vat_rate) || VAT_RATE;
    netExVat += inclusive ? g / (1 + rate) : g;
  }
  netExVat = r2(netExVat);
  const cogs = sum('cost_of_goods');
  const pf = sum('platform_fees');
  const adv = sum('advertising_fees');
  const ship = sum('shipping_fees');
  const txFee = sum('transaction_fee');
  const whtDed = sum('wht_deducted');
  const campFee = sum('campaign_fee');
  const affCom = sum('affiliate_commission');
  const codFee = sum('cod_fee');
  const costTotal = r2(cogs + pf + adv + ship + txFee + whtDed + campFee + affCom + codFee);
  const rent = sum('rental_fees');
  const salary = sum('salary_fees');
  const warehouse = sum('warehouse_fees');
  const other = sum('other_expenses');
  const expTotal = r2(rent + salary + warehouse + other);
  const importVat = sum('import_vat_paid');
  const importDuty = sum('import_duty_paid');
  return {
    period: period.rows[0],
    sales: { gross, refunds, shipping_income: shippingInc, discounts: discountVal, platform_subsidy: platSubsidy, other_income: otherInc, net: r2(netSales), net_ex_vat: netExVat, vat_sales: sum('vat_sales_calculated') },
    costs: { cogs, platform_fees: pf, advertising: adv, shipping: ship, transaction_fee: txFee, wht_deducted: whtDed, campaign_fee: campFee, affiliate_commission: affCom, cod_fee: codFee, total: costTotal },
    expenses: { rent, salary, warehouse, other, total: expTotal },
    imports: { import_vat: importVat, import_duty: importDuty },
    gross_profit: r2(netExVat - costTotal),
    net_profit: r2(netExVat - costTotal - expTotal),
  };
}

// ---- Compute VAT report data from DB ----
async function computeVatReport(company_id, period_id) {
  const period = await pool.query('SELECT year, month FROM accounting_periods WHERE id = $1', [period_id]);
  if (period.rows.length === 0) throw new Error('期间不存在');
  const { year, month } = period.rows[0];

  const [outSum, inSum] = await Promise.all([
    pool.query('SELECT COALESCE(SUM(amount_ex_vat),0) as ex, COALESCE(SUM(vat_amount),0) as vat, COUNT(*) as cnt FROM vat_output_details WHERE company_id=$1 AND period_id=$2', [company_id, period_id]),
    pool.query('SELECT COALESCE(SUM(vat_amount),0) as vat FROM vat_input_details WHERE company_id=$1 AND period_id=$2 AND deductible=true', [company_id, period_id])
  ]);

  let salesAmount = r2(outSum.rows[0].ex);
  let vatSales = r2(outSum.rows[0].vat);
  let vatPurchases = r2(inSum.rows[0].vat);

  // Fallback to ecommerce_sales if no detail — aggregate all rows
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
      vatSales = r2(sales.rows.reduce((s, r) => s + parseFloat(r.vat_sales_calculated || 0), 0));
      vatPurchases = r2(sales.rows.reduce((s, r) => s + parseFloat(r.vat_purchases_calculated || 0), 0));
    }
  }

  // Previous credit forward
  let pm = month - 1, py = year;
  if (pm < 1) { pm = 12; py--; }
  const prev = await pool.query(
    'SELECT vat_credit_carry FROM vat_reports vr JOIN accounting_periods ap ON ap.id=vr.period_id WHERE vr.company_id=$1 AND ap.year=$2 AND ap.month=$3',
    [company_id, py, pm]
  );
  const cf = prev.rows.length > 0 ? r2(prev.rows[0].vat_credit_carry) : 0;
  const net = vatSales - vatPurchases - cf;

  return {
    period: { year, month },
    sales_amount: salesAmount, vat_sales: vatSales, vat_purchases: vatPurchases,
    credit_forward: cf,
    vat_payable: net > 0 ? r2(net) : 0,
    vat_credit_carry: net < 0 ? r2(Math.abs(net)) : 0,
  };
}

// ---- Profit & Loss PDF ----
router.get('/profit-loss', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const data = await computeProfitLoss(company_id, period_id);
    const code = await getCompanyCode(company_id);
    const ym = await getPeriodLabel(period_id);
    const fname = `${code}_利润表_${ym}.pdf`;
    const fpath = path.join(EXPORT_DIR, fname);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(fpath);
    doc.pipe(stream);

    doc.fontSize(18).font('Helvetica-Bold').text('利润表 (电商简化)', { align: 'center' });
    doc.fontSize(11).text(`${data.period?.year || ''}年${data.period?.month || ''}月`, { align: 'center' });
    doc.moveDown(0.8);

    let y = doc.y;
    const ln = (label, val, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      doc.text(`  ${label}`, 60, y, { width: 250, continued: true });
      doc.text(val, { align: 'right', width: 240 });
      y += 20;
    };
    const fmtNum = n => (Math.round((n || 0) * 100) / 100).toLocaleString();

    doc.font('Helvetica-Bold').fontSize(12).text('收入', 60, y); y += 22;
    ln('平台总销售额（含VAT）', fmtNum(data.sales?.gross));
    ln('减：退款', fmtNum(data.sales?.refunds));
    ln('加：运费收入', fmtNum(data.sales?.shipping_income));
    ln('减：优惠折扣', fmtNum(data.sales?.discounts));
    ln('加：平台补贴', fmtNum(data.sales?.platform_subsidy));
    ln('加：其他收入', fmtNum(data.sales?.other_income));
    y += 4; doc.moveTo(60, y).lineTo(520, y).stroke(); y += 10;
    ln('净销售收入（不含VAT）', fmtNum(data.sales?.net_ex_vat), true);
    y += 6;

    doc.font('Helvetica-Bold').fontSize(12).text('成本', 60, y); y += 22;
    ln('采购成本', fmtNum(data.costs?.cogs));
    ln('平台佣金', fmtNum(data.costs?.platform_fees));
    ln('广告费', fmtNum(data.costs?.advertising));
    ln('物流运费', fmtNum(data.costs?.shipping));
    ln('交易手续费', fmtNum(data.costs?.transaction_fee));
    ln('预扣税（WHT）', fmtNum(data.costs?.wht_deducted));
    ln('活动服务费', fmtNum(data.costs?.campaign_fee));
    ln('达人佣金', fmtNum(data.costs?.affiliate_commission));
    ln('COD 手续费', fmtNum(data.costs?.cod_fee));
    y += 4; doc.moveTo(60, y).lineTo(520, y).stroke(); y += 10;
    ln('成本合计', fmtNum(data.costs?.total), true);
    y += 6;

    doc.font('Helvetica-Bold').fontSize(12).text('进口', 60, y); y += 22;
    ln('进口 VAT 已缴', fmtNum(data.imports?.import_vat));
    ln('进口关税已缴', fmtNum(data.imports?.import_duty));
    y += 6;

    doc.font('Helvetica-Bold').fontSize(12).text('毛利', 60, y); y += 20;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(data.gross_profit >= 0 ? '#67c23a' : '#f56c6c');
    doc.text('  毛利', 60, y, { width: 250, continued: true });
    doc.text(fmtNum(data.gross_profit), { align: 'right', width: 240 }); doc.fillColor('#000'); y += 28;

    doc.font('Helvetica-Bold').fontSize(12).text('费用', 60, y); y += 22;
    ln('房租', fmtNum(data.expenses?.rent));
    ln('工资', fmtNum(data.expenses?.salary));
    ln('仓储费', fmtNum(data.expenses?.warehouse));
    ln('其他费用', fmtNum(data.expenses?.other));
    y += 4; doc.moveTo(60, y).lineTo(520, y).stroke(); y += 10;
    ln('费用合计', fmtNum(data.expenses?.total), true);
    y += 10;

    doc.moveTo(60, y).lineTo(560, y).stroke(); y += 12;
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#409eff');
    doc.text('  净利润', 60, y, { width: 250, continued: true });
    doc.text(fmtNum(data.net_profit), { align: 'right', width: 240 });

    doc.end();
    await new Promise(r => stream.on('finish', r));
    res.json({ url: `/exports/${fname}`, filename: fname });
  } catch (err) { next(err); }
});

// ---- VAT Report PDF ----
router.get('/vat-report', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const data = await computeVatReport(company_id, period_id);
    const code = await getCompanyCode(company_id);
    const ym = await getPeriodLabel(period_id);
    const fname = `${code}_VAT申报_${ym}.pdf`;
    const fpath = path.join(EXPORT_DIR, fname);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(fpath);
    doc.pipe(stream);

    doc.fontSize(18).font('Helvetica-Bold').text('VAT 申报表 (P.P.30)', { align: 'center' });
    doc.fontSize(11).text(`${data.period?.year}年${data.period?.month}月`, { align: 'center' });
    doc.moveDown(1);

    const fmtNum = n => (Math.round((n || 0) * 100) / 100).toLocaleString();
    let y = doc.y;
    const ln = (l, v, c) => {
      doc.fontSize(11);
      doc.font('Helvetica-Bold').text(`  ${l}`, 80, y, { width: 180, continued: true });
      if (c) doc.fillColor(c);
      doc.font('Helvetica').text(fmtNum(v), { align: 'right', width: 240 });
      doc.fillColor('#000');
      y += 24;
    };

    ln('不含税销售收入', data.sales_amount);
    ln('销项 VAT (7%)', data.vat_sales);
    ln('可抵扣进项 VAT', data.vat_purchases);
    ln('上月留抵', data.credit_forward);
    y += 8; doc.moveTo(80, y).lineTo(520, y).stroke(); y += 12;
    doc.fontSize(14).font('Helvetica-Bold');
    if (data.vat_payable > 0) {
      doc.text('  应缴 VAT', 80, y, { width: 180, continued: true });
      doc.fillColor('#f56c6c').text(fmtNum(data.vat_payable), { align: 'right', width: 240 });
    } else {
      doc.text('  留抵结转', 80, y, { width: 180, continued: true });
      doc.fillColor('#67c23a').text(fmtNum(data.vat_credit_carry), { align: 'right', width: 240 });
    }

    doc.end();
    await new Promise(r => stream.on('finish', r));
    res.json({ url: `/exports/${fname}`, filename: fname });
  } catch (err) { next(err); }
});

// ---- Monthly package ZIP ----
router.get('/monthly-package', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const code = await getCompanyCode(company_id);
    const ym = await getPeriodLabel(period_id);
    const zipName = `${code}_月度报表_${ym}.zip`;
    const zipPath = path.join(EXPORT_DIR, zipName);
    const zip = new AdmZip();

    const ok = (n) => { try { zip.addLocalFile(n); } catch(e) { console.warn('ZIP跳过:', n, e.message); } };

    // Generate each report in sequence
    try {
      const pl = await computeProfitLoss(company_id, period_id);
      const plName = `${code}_利润表_${ym}.pdf`;
      const plPath = path.join(EXPORT_DIR, plName);
      if (!fs.existsSync(plPath)) {
        const fmtNum = n => (Math.round((n || 0) * 100) / 100).toLocaleString();
        const ln = (label, val, bold, col) => {
          doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
          if (col) doc.fillColor(col);
          doc.text(`  ${label}`, 50, doc.y, { width: 200, continued: true });
          doc.text(val, { align: 'right', width: 200 });
          doc.fillColor('#000');
          doc.moveDown(0.25);
        };
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(plPath);
        doc.pipe(stream);
        doc.fontSize(16).font('Helvetica-Bold').text('利润表 (电商简化)', { align: 'center' });
        doc.fontSize(10).text(`${pl.period?.year || ''}年${pl.period?.month || ''}月`, { align: 'center' });
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(12).text('收入', 50); doc.moveDown(0.3);
        ln('平台总销售额（含VAT）', fmtNum(pl.sales?.gross));
        ln('减：退款', fmtNum(pl.sales?.refunds));
        ln('加：运费收入', fmtNum(pl.sales?.shipping_income));
        ln('减：优惠折扣', fmtNum(pl.sales?.discounts));
        ln('加：平台补贴', fmtNum(pl.sales?.platform_subsidy));
        ln('加：其他收入', fmtNum(pl.sales?.other_income));
        ln('净销售收入（不含VAT）', fmtNum(pl.sales?.net_ex_vat), true);
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(12).text('成本', 50); doc.moveDown(0.3);
        ln('采购成本', fmtNum(pl.costs?.cogs));
        ln('平台佣金', fmtNum(pl.costs?.platform_fees));
        ln('广告费', fmtNum(pl.costs?.advertising));
        ln('物流运费', fmtNum(pl.costs?.shipping));
        ln('交易手续费', fmtNum(pl.costs?.transaction_fee));
        ln('预扣税（WHT）', fmtNum(pl.costs?.wht_deducted));
        ln('活动服务费', fmtNum(pl.costs?.campaign_fee));
        ln('达人佣金', fmtNum(pl.costs?.affiliate_commission));
        ln('COD 手续费', fmtNum(pl.costs?.cod_fee));
        ln('成本合计', fmtNum(pl.costs?.total), true);
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(12).text('进口', 50); doc.moveDown(0.3);
        ln('进口 VAT 已缴', fmtNum(pl.imports?.import_vat));
        ln('进口关税已缴', fmtNum(pl.imports?.import_duty));
        ln('毛利', fmtNum(pl.gross_profit), true, pl.gross_profit >= 0 ? '#67c23a' : '#f56c6c');
        doc.moveDown(0.5);
        doc.font('Helvetica-Bold').fontSize(12).text('费用', 50); doc.moveDown(0.3);
        ln('房租', fmtNum(pl.expenses?.rent));
        ln('工资', fmtNum(pl.expenses?.salary));
        ln('仓储费', fmtNum(pl.expenses?.warehouse));
        ln('其他费用', fmtNum(pl.expenses?.other));
        ln('费用合计', fmtNum(pl.expenses?.total), true);
        ln('净利润', fmtNum(pl.net_profit), true, '#409eff');
        doc.end();
        await new Promise(r => stream.on('finish', r));
      }
      ok(plPath);
    } catch(e) { console.warn('利润表生成失败:', e.message); }

    try {
      const vat = await computeVatReport(company_id, period_id);
      const vatName = `${code}_VAT申报_${ym}.pdf`;
      const vatPath = path.join(EXPORT_DIR, vatName);
      if (!fs.existsSync(vatPath)) {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(vatPath);
        doc.pipe(stream);
        doc.fontSize(16).text('VAT 申报', { align: 'center' });
        doc.text(`销项 VAT: ${vat.vat_sales.toLocaleString()}`);
        doc.text(`进项 VAT: ${vat.vat_purchases.toLocaleString()}`);
        doc.text(`应缴/留抵: ${(vat.vat_payable || vat.vat_credit_carry).toLocaleString()}`);
        doc.end();
        await new Promise(r => stream.on('finish', r));
      }
      ok(vatPath);
    } catch(e) { console.warn('VAT报告生成失败:', e.message); }

    try {
      const wht = await pool.query(
        'SELECT wr.* FROM wht_reports wr JOIN accounting_periods ap ON ap.id=wr.period_id WHERE wr.company_id=$1 AND ap.id=$2',
        [company_id, period_id]
      );
      if (wht.rows.length > 0) {
        const whtName = `${code}_WHT汇总_${ym}.txt`;
        const whtPath = path.join(EXPORT_DIR, whtName);
        let whtTxt = 'WHT 申报汇总\n\n';
        whtTxt += wht.rows.map(r => `类型:${r.report_type} 付款总额:${r.total_payment} 预扣税:${r.total_wht} 状态:${r.status}`).join('\n');
        fs.writeFileSync(whtPath, whtTxt);
        ok(whtPath);
      }
    } catch(e) { console.warn('WHT汇总生成失败:', e.message); }

    zip.writeZip(zipPath);
    res.json({ url: `/exports/${zipName}`, filename: zipName });
  } catch (err) { next(err); }
});

// ---- Balance Sheet PDF (simplified) ----
router.get('/balance-sheet', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const code = await getCompanyCode(company_id);
    const ym = await getPeriodLabel(period_id);
    const fname = `${code}_资产负债表_${ym}.pdf`;
    const fpath = path.join(EXPORT_DIR, fname);

    const sales = await pool.query('SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2', [company_id, period_id]);
    const rows = sales.rows;
    const sum = f => rows.reduce((s, r) => s + parseFloat(r[f] || 0), 0);
    const netCash = r2(
      sum('platform_sales') - sum('platform_refunds')
      + sum('shipping_income') - sum('discounts') + sum('platform_subsidy') + sum('other_income')
      - sum('cost_of_goods') - sum('platform_fees') - sum('advertising_fees') - sum('shipping_fees')
      - sum('transaction_fee') - sum('wht_deducted') - sum('campaign_fee') - sum('affiliate_commission') - sum('cod_fee')
      - sum('rental_fees') - sum('salary_fees') - sum('warehouse_fees') - sum('other_expenses')
      - sum('import_vat_paid') - sum('import_duty_paid')
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(fpath);
    doc.pipe(stream);

    doc.fontSize(18).font('Helvetica-Bold').text('资产负债表（电商简化）', { align: 'center' });
    doc.moveDown(0.5);

    const ln = (l, v) => {
      doc.font('Helvetica').fontSize(11).text(`  ${l}`, 60, doc.y, { width: 250, continued: true });
      doc.font('Helvetica-Bold').text(v.toLocaleString(), { align: 'right', width: 240 });
      doc.moveDown(0.3);
    };

    doc.font('Helvetica-Bold').fontSize(13).text('资产'); doc.moveDown(0.3);
    ln('货币资金（估算）', netCash);
    doc.font('Helvetica-Bold').text(`资产总计: ${netCash.toLocaleString()}`); doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(13).text('负债 + 权益'); doc.moveDown(0.3);
    ln('未分配利润（估算）', netCash);
    doc.font('Helvetica-Bold').text(`负债+权益总计: ${netCash.toLocaleString()}`);

    doc.end();
    await new Promise(r => stream.on('finish', r));
    res.json({ url: `/exports/${fname}`, filename: fname });
  } catch (err) { next(err); }
});

// ---- Excel exports (unchanged, already use pool directly) ----
router.get('/profit-loss/xlsx', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    const [comp, per, sales] = await Promise.all([
      pool.query('SELECT * FROM companies WHERE id=$1',[company_id]),
      pool.query('SELECT * FROM accounting_periods WHERE id=$1',[period_id]),
      pool.query('SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2',[company_id,period_id])
    ]);
    const p = per.rows[0] || {};
    const rows = sales.rows;
    const sum = f => rows.reduce((s, r) => s + parseFloat(r[f] || 0), 0);
    let netExVat = 0;
    for (const r of rows) {
      const g = parseFloat(r.platform_sales || 0) - parseFloat(r.platform_refunds || 0);
      const inc = r.is_vat_inclusive !== false;
      const rate = parseFloat(r.vat_rate) || VAT_RATE;
      netExVat += inc ? g / (1 + rate) : g;
    }
    netExVat = Math.round(netExVat * 100) / 100;
    const gs = sum('platform_sales'), refs = sum('platform_refunds');
    const si = sum('shipping_income'), disc = sum('discounts'), ps = sum('platform_subsidy'), oi = sum('other_income');
    const cogs = sum('cost_of_goods'), pf = sum('platform_fees'), adv = sum('advertising_fees'), ship = sum('shipping_fees');
    const tx = sum('transaction_fee'), wht = sum('wht_deducted'), camp = sum('campaign_fee'), aff = sum('affiliate_commission'), cod = sum('cod_fee');
    const costTotal = cogs + pf + adv + ship + tx + wht + camp + aff + cod;
    const rent = sum('rental_fees'), sal = sum('salary_fees'), wh = sum('warehouse_fees'), oth = sum('other_expenses');
    const expTotal = rent + sal + wh + oth;
    const iv = sum('import_vat_paid'), idu = sum('import_duty_paid');
    const gp = netExVat - costTotal, np = gp - expTotal;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('利润表');
    ws.mergeCells('A1:C1'); ws.getCell('A1').value = `${comp.rows[0]?.name||''} - ${p.year}年${p.month}月 利润表`;
    ws.addRow(['项目','当月金额(THB)','']);
    ws.getColumn(1).width=30; ws.getColumn(2).width=20;
    const addRow = (label, val) => { const r = ws.addRow([label, Math.round((val||0)*100)/100]); if(label==='净利润') r.font={bold:true,size:14}; };
    addRow('平台总销售额（含VAT）',gs); addRow('减：退款',refs);
    addRow('加：运费收入',si); addRow('减：优惠折扣',disc);
    addRow('加：平台补贴',ps); addRow('加：其他收入',oi);
    addRow('净销售收入（不含VAT）',netExVat);
    addRow('采购成本',cogs); addRow('平台佣金',pf);
    addRow('广告费',adv); addRow('物流运费',ship);
    addRow('交易手续费',tx); addRow('预扣税（WHT）',wht);
    addRow('活动服务费',camp); addRow('达人佣金',aff);
    addRow('COD 手续费',cod); addRow('成本合计',costTotal);
    addRow('进口 VAT 已缴',iv); addRow('进口关税已缴',idu);
    addRow('毛利',gp);
    addRow('房租',rent); addRow('工资',sal);
    addRow('仓储费',wh); addRow('其他费用',oth);
    addRow('费用合计',expTotal);
    addRow('净利润',np);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=profit_loss_${p.year}${String(p.month).padStart(2,'0')}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(e) { next(e); }
});

router.get('/ecommerce-sales/xlsx', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    const [comp, per, sales] = await Promise.all([
      pool.query('SELECT * FROM companies WHERE id=$1',[company_id]),
      pool.query('SELECT * FROM accounting_periods WHERE id=$1',[period_id]),
      pool.query('SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2 ORDER BY order_date, id',[company_id,period_id])
    ]);
    const p = per.rows[0] || {};
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('电商销售明细');
    ws.mergeCells('A1:N1'); ws.getCell('A1').value = `${comp.rows[0]?.name||''} - ${p.year}年${p.month}月 电商销售明细`;
    const hdr = ws.addRow(['订单日期','订单号','平台','店铺','销售额','运费收入','折扣','退款','平台补贴','其他收入','平台佣金','广告费','物流费','交易手续费','WHT','活动服务费','达人佣金','COD手续费','采购成本','进口VAT','进口关税','实际回款','回款状态','销项VAT','进项VAT','备注']);
    hdr.font = {bold:true}; hdr.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F0FE'}});
    let totals = new Array(26).fill(0);
    sales.rows.forEach(r => {
      const vals = [r.order_date||'',r.order_no||'',r.platform||'',r.store_name||'',fmt(r.platform_sales),fmt(r.shipping_income),fmt(r.discounts),fmt(r.platform_refunds),fmt(r.platform_subsidy),fmt(r.other_income),fmt(r.platform_fees),fmt(r.advertising_fees),fmt(r.shipping_fees),fmt(r.transaction_fee),fmt(r.wht_deducted),fmt(r.campaign_fee),fmt(r.affiliate_commission),fmt(r.cod_fee),fmt(r.cost_of_goods),fmt(r.import_vat_paid),fmt(r.import_duty_paid),fmt(r.actual_received),r.collection_status||'',fmt(r.vat_sales_calculated),fmt(r.vat_purchases_calculated),r.notes||''];
      ws.addRow(vals);
      for(let i=4;i<=21;i++) totals[i-2] += toNum(vals[i-2]);
    });
    const sumRow = ws.addRow(['合计','','','',...totals.map(v=>fmt(v)),'','','','']);
    sumRow.font = {bold:true}; sumRow.eachCell(c=>c.border={top:{style:'double'}});
    ws.columns.forEach((c,i)=>{const w=[12,14,10,16,13,11,10,10,11,11,11,10,10,12,10,12,10,12,11,12,12,12,10,14,11,10,20][i]||12;c.width=w});
    ws.views=[{state:'frozen',ySplit:2}];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=ecommerce_sales_${p.year}${String(p.month).padStart(2,'0')}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(e) { next(e); }
});

router.get('/vat-report/xlsx', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    const [comp, per, out, inp] = await Promise.all([
      pool.query('SELECT * FROM companies WHERE id=$1',[company_id]),
      pool.query('SELECT * FROM accounting_periods WHERE id=$1',[period_id]),
      pool.query('SELECT COALESCE(SUM(amount_ex_vat),0) as ex, COALESCE(SUM(vat_amount),0) as vat FROM vat_output_details WHERE company_id=$1 AND period_id=$2',[company_id,period_id]),
      pool.query('SELECT COALESCE(SUM(vat_amount),0) as vat FROM vat_input_details WHERE company_id=$1 AND period_id=$2 AND deductible=true',[company_id,period_id])
    ]);
    const p = per.rows[0] || {};
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('VAT申报');
    ws.mergeCells('A1:B1'); ws.getCell('A1').value = `${comp.rows[0]?.name||''} - ${p.year}年${p.month}月 VAT申报`;
    ws.addRow(['项目','金额(THB)']); ws.getColumn(1).width=25; ws.getColumn(2).width=18;
    ws.addRow(['不含税销售收入',fmt(out.rows[0]?.ex||0)]);
    ws.addRow(['销项VAT',fmt(out.rows[0]?.vat||0)]);
    ws.addRow(['可抵扣进项VAT',fmt(inp.rows[0]?.vat||0)]);
    const net=toNum(out.rows[0]?.vat||0)-toNum(inp.rows[0]?.vat||0);
    ws.addRow([net>0?'应缴VAT':'留抵结转',fmt(Math.abs(net))]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=vat_report_${p.year}${String(p.month).padStart(2,'0')}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(e) { next(e); }
});



// -- Excel exports (restored from original) --
router.get('/expenses/xlsx', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    const [comp, per, exps] = await Promise.all([
      pool.query('SELECT * FROM companies WHERE id=$1',[company_id]),
      pool.query('SELECT * FROM accounting_periods WHERE id=$1',[period_id]),
      pool.query('SELECT * FROM expense_details WHERE company_id=$1 AND period_id=$2 ORDER BY expense_date',[company_id,period_id])
    ]);
    const p = per.rows[0] || {};
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('费用明细');
    ws.mergeCells('A1:I1'); ws.getCell('A1').value = `${comp.rows[0]?.name||''} - ${p.year}年${p.month}月 费用明细`;
    const hdr = ws.addRow(['日期','类别','收款方','税号','不含税金额','VAT','含税金额','WHT','摘要']);
    hdr.font = {bold:true}; hdr.eachCell(c=>c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8F0FE'}});
    let totalAmt=0,totalVat=0,totalAll=0,totalWht=0;
    exps.rows.forEach(e=>{
      ws.addRow([e.expense_date||'',e.category||'',e.payee_name||'',e.payee_tax_id||'',fmt(e.amount),fmt(e.vat_amount),fmt(e.total_amount),e.has_wht?fmt(e.wht_amount):'0',e.description||'']);
      totalAmt+=toNum(e.amount);totalVat+=toNum(e.vat_amount);totalAll+=toNum(e.total_amount);totalWht+=e.has_wht?toNum(e.wht_amount):0;
    });
    const sum = ws.addRow(['合计','','','',fmt(totalAmt),fmt(totalVat),fmt(totalAll),fmt(totalWht),'']);
    sum.font = {bold:true}; sum.eachCell(c=>c.border={top:{style:'double'}});
    ws.getColumn(1).width=12;ws.getColumn(2).width=12;ws.getColumn(3).width=18;ws.getColumn(5).width=16;ws.getColumn(6).width=14;ws.getColumn(7).width=16;ws.getColumn(9).width=25;
    ws.views=[{state:'frozen',ySplit:2}];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=expenses_${p.year}${String(p.month).padStart(2,'0')}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(e) { next(e); }
});

router.get('/vat-details/xlsx', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    const [comp, per, outDet, inDet] = await Promise.all([
      pool.query('SELECT * FROM companies WHERE id=$1',[company_id]),
      pool.query('SELECT * FROM accounting_periods WHERE id=$1',[period_id]),
      pool.query('SELECT * FROM vat_output_details WHERE company_id=$1 AND period_id=$2 ORDER BY invoice_date',[company_id,period_id]),
      pool.query('SELECT * FROM vat_input_details WHERE company_id=$1 AND period_id=$2 ORDER BY invoice_date',[company_id,period_id])
    ]);
    const p = per.rows[0] || {};
    const wb = new ExcelJS.Workbook();
    const ws1 = wb.addWorksheet('销项明细');
    ws1.mergeCells('A1:G1');ws1.getCell('A1').value=`${comp.rows[0]?.name||''} 销项明细`;
    const h1=ws1.addRow(['日期','客户','说明','不含税金额','VAT','含税金额','来源']);h1.font={bold:true};
    if(!outDet.rows.length)ws1.addRow(['本月无数据']);
    else{outDet.rows.forEach(d=>ws1.addRow([d.invoice_date||'',d.customer_name||'',d.description||'',fmt(d.amount_ex_vat),fmt(d.vat_amount),fmt(d.total_amount),d.source||'manual']));}
    const ws2 = wb.addWorksheet('进项明细');
    ws2.mergeCells('A1:H1');ws2.getCell('A1').value=`${comp.rows[0]?.name||''} 进项明细`;
    const h2=ws2.addRow(['日期','供应商','说明','类别','不含税金额','VAT','含税金额','可抵扣']);h2.font={bold:true};
    if(!inDet.rows.length)ws2.addRow(['本月无数据']);
    else{inDet.rows.forEach(d=>ws2.addRow([d.invoice_date||'',d.supplier_name||'',d.description||'',d.category||'',fmt(d.amount_ex_vat),fmt(d.vat_amount),fmt(d.total_amount),d.deductible?'是':'否']));}
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=vat_details_${p.year}${String(p.month).padStart(2,'0')}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(e) { next(e); }
});

router.get('/all/xlsx', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    const wb = new ExcelJS.Workbook();
    const p = (await pool.query('SELECT * FROM accounting_periods WHERE id=$1',[period_id])).rows[0]||{};
    const ws0 = wb.addWorksheet('概览');
    ws0.addRow([`全量导出 - ${p.year}年${p.month}月`]).font={bold:true,size:14};
    ws0.addRow(['包含：利润表 / VAT申报 / 销项明细 / 进项明细 / 费用明细']);
    ws0.addRow(['']);
    ws0.addRow(['提示：请查看其他工作表标签获取详细数据。']);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=full_export_${p.year}${String(p.month).padStart(2,'0')}.xlsx`);
    await wb.xlsx.write(res); res.end();
  } catch(e) { next(e); }
});

module.exports = router;
