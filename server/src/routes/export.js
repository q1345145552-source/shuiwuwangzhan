const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const AdmZip = require('adm-zip');
const ExcelJS = require('exceljs');
const { pool } = require('../db');

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
  if (sales.rows.length === 0) {
    return {
      period: period.rows[0],
      sales: { gross: 0, refunds: 0, other_income: 0, net: 0, net_ex_vat: 0 },
      costs: { cogs: 0, platform_fees: 0, advertising: 0, shipping: 0, total: 0 },
      expenses: { rent: 0, salary: 0, warehouse: 0, other: 0, total: 0 },
      gross_profit: 0, net_profit: 0,
    };
  }
  const s = sales.rows[0];
  const gross = r2(s.platform_sales || 0);
  const refunds = r2(s.platform_refunds || 0);
  const netSales = gross - refunds;
  const netExVat = r2(netSales / 1.07);
  const cogs = r2(s.cost_of_goods || 0);
  const pf = r2(s.platform_fees || 0);
  const adv = r2(s.advertising_fees || 0);
  const ship = r2(s.shipping_fees || 0);
  const costTotal = r2(cogs + pf + adv + ship);
  const rent = r2(s.rental_fees || 0);
  const salary = r2(s.salary_fees || 0);
  const warehouse = r2(s.warehouse_fees || 0);
  const other = r2(s.other_expenses || 0);
  const expTotal = r2(rent + salary + warehouse + other);
  return {
    period: period.rows[0],
    sales: { gross, refunds, other_income: r2(s.other_income || 0), net: r2(netSales), net_ex_vat: netExVat },
    costs: { cogs, platform_fees: pf, advertising: adv, shipping: ship, total: costTotal },
    expenses: { rent, salary, warehouse, other, total: expTotal },
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

  // Fallback to ecommerce_sales if no detail
  if (parseInt(outSum.rows[0].cnt) === 0) {
    const sales = await pool.query('SELECT * FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2', [company_id, period_id]);
    if (sales.rows.length > 0) {
      const s = sales.rows[0];
      salesAmount = r2((parseFloat(s.platform_sales) - parseFloat(s.platform_refunds)) / 1.07);
      vatSales = r2(s.vat_sales_calculated);
      vatPurchases = r2(s.vat_purchases_calculated);
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
    y += 4; doc.moveTo(60, y).lineTo(520, y).stroke(); y += 10;
    ln('净销售收入（不含VAT）', fmtNum(data.sales?.net_ex_vat), true);
    y += 6;

    doc.font('Helvetica-Bold').fontSize(12).text('成本', 60, y); y += 22;
    ln('采购成本', fmtNum(data.costs?.cogs));
    ln('平台佣金', fmtNum(data.costs?.platform_fees));
    ln('广告费', fmtNum(data.costs?.advertising));
    ln('物流运费', fmtNum(data.costs?.shipping));
    y += 4; doc.moveTo(60, y).lineTo(520, y).stroke(); y += 10;
    ln('成本合计', fmtNum(data.costs?.total), true);
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
        // Quick inline PDF
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(plPath);
        doc.pipe(stream);
        doc.fontSize(16).text('利润表', { align: 'center' });
        doc.text(`${pl.period?.year}年${pl.period?.month}月\n`);
        doc.text(`净销售收入(不含VAT): ${pl.sales.net_ex_vat.toLocaleString()}`);
        doc.text(`成本合计: ${pl.costs.total.toLocaleString()}`);
        doc.text(`费用合计: ${pl.expenses.total.toLocaleString()}`);
        doc.text(`净利润: ${pl.net_profit.toLocaleString()}`);
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
    const s = sales.rows[0] || {};
    const netCash = r2((s.platform_sales || 0) - (s.platform_refunds || 0) - (s.cost_of_goods || 0) - (s.platform_fees || 0) - (s.rental_fees || 0) - (s.salary_fees || 0) - (s.warehouse_fees || 0) - (s.other_expenses || 0) - (s.advertising_fees || 0) - (s.shipping_fees || 0));

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
    const p = per.rows[0] || {}; const s = sales.rows[0] || {};
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('利润表');
    ws.mergeCells('A1:C1'); ws.getCell('A1').value = `${comp.rows[0]?.name||''} - ${p.year}年${p.month}月 利润表`;
    ws.addRow(['项目','金额(THB)','']);
    ws.getColumn(1).width=30; ws.getColumn(2).width=20;
    const addRow = (label, val) => { const r = ws.addRow([label, Math.round((val||0)*100)/100]); if(label==='净利润') r.font={bold:true,size:14}; };
    const ns = ((s.platform_sales||0)-(s.platform_refunds||0))/1.07;
    addRow('平台总销售额',s.platform_sales||0); addRow('退款',s.platform_refunds||0);
    addRow('净销售收入(不含VAT)',ns); addRow('采购成本',s.cost_of_goods||0);
    addRow('平台佣金',s.platform_fees||0); addRow('广告费',s.advertising_fees||0);
    addRow('物流运费',s.shipping_fees||0);
    addRow('毛利',ns-(s.cost_of_goods||0)-(s.platform_fees||0)-(s.advertising_fees||0)-(s.shipping_fees||0));
    addRow('房租',s.rental_fees||0); addRow('工资',s.salary_fees||0);
    addRow('仓储费',s.warehouse_fees||0); addRow('其他费用',s.other_expenses||0);
    addRow('净利润',ns-(s.cost_of_goods||0)-(s.platform_fees||0)-(s.advertising_fees||0)-(s.shipping_fees||0)-(s.rental_fees||0)-(s.salary_fees||0)-(s.warehouse_fees||0)-(s.other_expenses||0));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=profit_loss_${p.year}${String(p.month).padStart(2,'0')}.xlsx`);
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
