const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');
const { logAudit } = require('../middleware/audit');
const { VAT_RATE } = require('../constants');

const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;
const fmtNum = n => (r2(n)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Risk helpers
function vatRisk(diff) {
  if (diff <= 0) return 'low';
  if (diff < 10000) return 'medium';
  return 'high';
}
function whtRisk(unmatched) {
  if (!unmatched || unmatched <= 0) return 'low';
  if (unmatched < 10000) return 'medium';
  return 'high';
}
function citRisk(unpaid) {
  if (!unpaid || unpaid <= 0) return 'low';
  if (unpaid < 50000) return 'medium';
  return 'high';
}
function overallRisk(...levels) {
  if (levels.includes('high')) return 'high';
  if (levels.includes('medium')) return 'medium';
  return 'low';
}
function riskColor(level) {
  if (level === 'high') return '#F56C6C';
  if (level === 'medium') return '#E6A23C';
  return '#67C23A';
}
function riskLabel(level) {
  if (level === 'high') return '高 ⚠️';
  if (level === 'medium') return '中 ⚡';
  return '低 ✅';
}

// Ensure output dir
const REPORT_DIR = path.join(__dirname, '..', '..', 'audit-reports');
if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ==================== POST /api/audit-report/generate ====================
router.post('/generate', async (req, res, next) => {
  try {
    const { company_id, year, include_sections, language } = req.body;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });
    const sectionsToInclude = include_sections || ['vat', 'wht', 'cit', 'compliance', 'recommendation'];
    const lang = language || 'zh';
    const zh = lang === 'zh';

    // Get company info
    const compRes = await pool.query('SELECT * FROM companies WHERE id=$1', [company_id]);
    if (!compRes.rows.length) return res.status(404).json({ error: '公司不存在' });
    const company = compRes.rows[0];

    const reportData = { company_id: parseInt(company_id), year: parseInt(year), sections: {}, risks: {} };

    // 1. VAT 分析
    if (sectionsToInclude.includes('vat')) {
      let totalSales = 0, totalVatDeclared = 0, totalVatExpected = 0;
      const monthly = [];
      for (let m = 1; m <= 12; m++) {
        const period = await pool.query(
          'SELECT id FROM accounting_periods WHERE company_id=$1 AND year=$2 AND month=$3',
          [company_id, year, m]
        );
        const pid = period.rows[0]?.id;
        if (!pid) continue;

        const salesRes = await pool.query(
          'SELECT platform_sales, platform_refunds FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2',
          [company_id, pid]
        );
        const totalSales = salesRes.rows.reduce((s, r) => s + parseFloat(r.platform_sales || 0), 0);
        const totalRefunds = salesRes.rows.reduce((s, r) => s + parseFloat(r.platform_refunds || 0), 0);
        const netSales = r2((totalSales - totalRefunds) / (1 + VAT_RATE));
        const expectedVat = r2(netSales * VAT_RATE);

        const vatRes = await pool.query(
          'SELECT COALESCE(SUM(vat_amount),0) as declared FROM vat_output_details WHERE company_id=$1 AND period_id=$2',
          [company_id, pid]
        );
        const declaredVat = r2(vatRes.rows[0].declared);
        const diff = r2(declaredVat - expectedVat);

        if (netSales > 0 || declaredVat > 0) {
          monthly.push({ month: m, net_sales: netSales, vat_expected: expectedVat, vat_declared: declaredVat, difference: diff });
          totalSales += netSales;
          totalVatDeclared += declaredVat;
          totalVatExpected += expectedVat;
        }
      }
      const vatDiff = r2(totalVatDeclared - totalVatExpected);
      reportData.sections.vat = {
        monthly_data: monthly,
        total_sales: r2(totalSales),
        total_vat_declared: r2(totalVatDeclared),
        total_vat_expected: r2(totalVatExpected),
        total_difference: vatDiff,
        risk_level: vatRisk(Math.abs(vatDiff))
      };
      reportData.risks.vat = reportData.sections.vat.risk_level;
    }

    // 2. WHT 分析
    if (sectionsToInclude.includes('wht')) {
      const unmatched = await pool.query(
        `SELECT ed.*, ap.month FROM expense_details ed
         JOIN accounting_periods ap ON ap.id = ed.period_id
         WHERE ed.company_id = $1 AND ap.year = $2 AND ed.wht_amount > 0 AND ed.wht_deducted_for_cit = FALSE
         ORDER BY ap.month`,
        [company_id, year]
      );
      let totalUnmatched = 0;
      const items = [];
      for (const u of unmatched.rows) {
        const wht = await pool.query(
          `SELECT wd.id FROM wht_details wd JOIN wht_reports wr ON wr.id = wd.report_id
           WHERE wr.company_id=$1 AND wd.payment_amount=$2 AND wd.wht_amount=$3`,
          [company_id, u.amount, u.wht_amount]
        );
        if (!wht.rows.length) {
          items.push({ month: u.month, payee: u.payee_name, amount: r2(u.amount), wht_amount: r2(u.wht_amount), category: u.category });
          totalUnmatched += parseFloat(u.wht_amount);
        }
      }
      // Also check total WHT from wht_reports
      const whtTotal = await pool.query(
        `SELECT COALESCE(SUM(total_wht),0) as total_wht, COALESCE(SUM(total_payment),0) as total_payment
         FROM wht_reports WHERE company_id=$1 AND period_id IN (SELECT id FROM accounting_periods WHERE company_id=$1 AND year=$2)`,
        [company_id, year]
      );
      reportData.sections.wht = {
        total_wht_declared: r2(whtTotal.rows[0].total_wht),
        total_payment: r2(whtTotal.rows[0].total_payment),
        unmatched_items: items,
        unmatched_total: r2(totalUnmatched),
        risk_level: whtRisk(totalUnmatched)
      };
      reportData.risks.wht = reportData.sections.wht.risk_level;
    }

    // 3. CIT 分析
    if (sectionsToInclude.includes('cit')) {
      const citRes = await pool.query(
        'SELECT * FROM cit_reports WHERE company_id=$1 AND year=$2',
        [company_id, year]
      );
      const cit = citRes.rows[0] || {};
      const profit = r2(cit.net_profit || 0);
      reportData.sections.cit = {
        net_profit: profit,
        tax_rate: cit.tax_rate || (profit > 3000000 ? 20 : profit > 300000 ? 15 : 0),
        tax_amount: r2(cit.tax_amount || 0),
        wht_credit: r2(cit.wht_credit || 0),
        half_year_paid: r2(cit.half_year_paid || 0),
        tax_payable: r2((cit.tax_amount || 0) - (cit.wht_credit || 0) - (cit.half_year_paid || 0)),
        risk_level: citRisk((cit.tax_amount || 0) - (cit.wht_credit || 0) - (cit.half_year_paid || 0))
      };
      reportData.risks.cit = reportData.sections.cit.risk_level;
    }

    // 4. 合规检查
    if (sectionsToInclude.includes('compliance')) {
      const overdue = await pool.query(
        `SELECT COUNT(*) as cnt FROM tax_calendar
         WHERE company_id=$1 AND status='pending' AND due_date < CURRENT_DATE`,
        [company_id]
      );
      const missingMonths = [];
      for (let m = 1; m <= 12; m++) {
        const period = await pool.query(
          'SELECT id FROM accounting_periods WHERE company_id=$1 AND year=$2 AND month=$3',
          [company_id, year, m]
        );
        if (!period.rows[0]?.id) { missingMonths.push(m); continue; }
        const pid = period.rows[0].id;
        const data = await pool.query(
          `SELECT (SELECT COUNT(*) FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2) AS has_sales,
                  (SELECT COUNT(*) FROM vat_output_details WHERE company_id=$1 AND period_id=$2) AS has_vat`,
          [company_id, pid]
        );
        const d = data.rows[0];
        if (parseInt(d.has_sales) === 0 && parseInt(d.has_vat) === 0) missingMonths.push(m);
      }
      reportData.sections.compliance = {
        overdue_count: parseInt(overdue.rows[0].cnt),
        missing_data_months: missingMonths,
        risk_level: missingMonths.length > 3 ? 'high' : missingMonths.length > 0 ? 'medium' : 'low'
      };
      reportData.risks.compliance = reportData.sections.compliance.risk_level;
    }

    // 5. 建议
    if (sectionsToInclude.includes('recommendation')) {
      const recs = [];
      if (reportData.sections.vat && Math.abs(reportData.sections.vat.total_difference) > 100) {
        recs.push(zh ? `销项VAT存在 ${Math.abs(reportData.sections.vat.total_difference)} THB 差异，建议核对各月申报数据` : `VAT discrepancy of ${Math.abs(reportData.sections.vat.total_difference)} THB detected`);
      }
      if (reportData.sections.wht && reportData.sections.wht.unmatched_total > 0) {
        recs.push(zh ? `有 ${reportData.sections.wht.unmatched_total} THB WHT未申报，建议立即补申报` : `${reportData.sections.wht.unmatched_total} THB WHT unmatched, recommend filing`);
      }
      if (reportData.sections.cit && reportData.sections.cit.tax_payable > 0) {
        recs.push(zh ? `CIT应补税额 ${reportData.sections.cit.tax_payable} THB，请在截止日前缴纳` : `CIT payable ${reportData.sections.cit.tax_payable} THB`);
      }
      if (reportData.sections.compliance && reportData.sections.compliance.missing_data_months.length > 0) {
        recs.push(zh ? `${reportData.sections.compliance.missing_data_months.length} 个月缺少数据，建议补充` : `${reportData.sections.compliance.missing_data_months.length} months missing data`);
      }
      if (!recs.length) recs.push(zh ? '未发现明显风险，继续保持当前合规状态' : 'No significant risks found. Maintain current compliance.');

      reportData.sections.recommendation = { items: recs };
    }

    // Overall risk
    const riskLevels = Object.values(reportData.risks).filter(Boolean);
    const overall = overallRisk(...riskLevels);

    // Generate report number
    const seqRes = await pool.query(
      'SELECT COUNT(*) as cnt FROM audit_reports WHERE company_id=$1 AND year=$2', [company_id, year]
    );
    const seq = parseInt(seqRes.rows[0].cnt) + 1;
    const reportNo = `AR-${company.code || company_id}-${year}-${String(seq).padStart(2, '0')}`;

    // Generate PDF
    const pdfFilename = `${reportNo}.pdf`;
    const pdfPath = path.join(REPORT_DIR, pdfFilename);
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const writeStream = fs.createWriteStream(pdfPath);
    doc.pipe(writeStream);

    // ---- PDF Content ----
    const headerColor = riskColor(overall);

    // Title
    doc.fontSize(20).font('Helvetica-Bold').text(zh ? '泰国电商税务稽查风险扫描报告' : 'Thai E-commerce Tax Audit Risk Report', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(11).font('Helvetica').fillColor('#909399').text(`Report No: ${reportNo}`, { align: 'center' });
    doc.fillColor('#000');

    // Company info
    doc.moveDown(1);
    doc.fontSize(12).font('Helvetica-Bold').text(zh ? '客户信息' : 'Company Info');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`${zh ? '公司名称' : 'Company'}: ${company.name}`);
    doc.text(`${zh ? '税号' : 'Tax ID'}: ${company.tax_id || '-'}`);
    doc.text(`${zh ? '年度' : 'Year'}: ${year}`);
    doc.text(`${zh ? '生成日期' : 'Generated'}: ${new Date().toISOString().slice(0, 10)}`);
    doc.text(`${zh ? '风险等级' : 'Risk Level'}: ${riskLabel(overall)}`, { continued: false });

    // Section divider helper
    function sectionHeader(title) {
      doc.moveDown(1);
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#303133').text(title);
      doc.moveDown(0.2);
      doc.fontSize(10).font('Helvetica').fillColor('#000');
    }

    // VAT Section
    if (reportData.sections.vat) {
      const v = reportData.sections.vat;
      sectionHeader(zh ? `一、VAT 分析  [风险: ${riskLabel(v.risk_level)}]` : `I. VAT Analysis [${riskLabel(v.risk_level)}]`);
      doc.text(`${zh ? '全年不含税销售额' : 'Annual Net Sales'}: ${fmtNum(v.total_sales)} THB`);
      doc.text(`${zh ? '申报销项VAT' : 'Declared Output VAT'}: ${fmtNum(v.total_vat_declared)} THB`);
      doc.text(`${zh ? '应有销项VAT' : 'Expected Output VAT'}: ${fmtNum(v.total_vat_expected)} THB`);
      doc.text(`${zh ? '差异' : 'Difference'}: ${fmtNum(v.total_difference)} THB`, { continued: false });
      doc.moveDown(0.3);
      if (v.monthly_data.length > 0) {
        doc.text(zh ? '逐月明细：' : 'Monthly Breakdown:');
        v.monthly_data.forEach(d => {
          const ok = Math.abs(d.difference) < 0.01;
          doc.text(`  ${d.month}月: 不含税${fmtNum(d.net_sales)}THB 申报${fmtNum(d.vat_declared)} 应有${fmtNum(d.vat_expected)} ${ok ? '✓' : '⚠'}`, { continued: false });
        });
      }
    }

    // WHT Section
    if (reportData.sections.wht) {
      const w = reportData.sections.wht;
      sectionHeader(zh ? `二、WHT 分析  [风险: ${riskLabel(w.risk_level)}]` : `II. WHT Analysis [${riskLabel(w.risk_level)}]`);
      doc.text(`${zh ? '已申报WHT总额' : 'Total WHT Declared'}: ${fmtNum(w.total_wht_declared)} THB`);
      doc.text(`${zh ? '已申报付款总额' : 'Total Payment Declared'}: ${fmtNum(w.total_payment)} THB`);
      if (w.unmatched_items.length > 0) {
        doc.text(`${zh ? '未匹配WHT' : 'Unmatched WHT'}: ${fmtNum(w.unmatched_total)} THB (${w.unmatched_items.length} ${zh ? '笔' : 'items'})`);
        w.unmatched_items.forEach(u => {
          doc.text(`  ${u.month}月: ${u.payee || '-'} | ${u.category} | WHT ${fmtNum(u.wht_amount)} THB`, { continued: false });
        });
      } else {
        doc.text(zh ? '✓ 所有费用中的WHT均已申报' : '✓ All WHT matched');
      }
    }

    // CIT Section
    if (reportData.sections.cit) {
      const c = reportData.sections.cit;
      sectionHeader(zh ? `三、CIT 分析  [风险: ${riskLabel(c.risk_level)}]` : `III. CIT Analysis [${riskLabel(c.risk_level)}]`);
      doc.text(`${zh ? '年度利润' : 'Net Profit'}: ${fmtNum(c.net_profit)} THB`);
      doc.text(`${zh ? '适用税率' : 'Tax Rate'}: ${c.tax_rate}%`);
      doc.text(`${zh ? '应纳税额' : 'Tax Amount'}: ${fmtNum(c.tax_amount)} THB`);
      doc.text(`${zh ? 'WHT抵免' : 'WHT Credit'}: ${fmtNum(c.wht_credit)} THB`);
      doc.text(`${zh ? '已缴预付' : 'Half-Year Paid'}: ${fmtNum(c.half_year_paid)} THB`);
      doc.text(`${zh ? '应补税额' : 'Tax Payable'}: ${fmtNum(c.tax_payable)} THB`, { continued: false });
    }

    // Compliance
    if (reportData.sections.compliance) {
      const co = reportData.sections.compliance;
      sectionHeader(zh ? `四、合规检查  [风险: ${riskLabel(co.risk_level)}]` : `IV. Compliance [${riskLabel(co.risk_level)}]`);
      doc.text(`${zh ? '逾期申报事项' : 'Overdue Items'}: ${co.overdue_count} ${zh ? '项' : 'items'}`);
      if (co.missing_data_months.length > 0) {
        doc.text(`${zh ? '缺失数据月份' : 'Missing Data Months'}: ${co.missing_data_months.join(', ')} (${co.missing_data_months.length} ${zh ? '个月' : 'months'})`);
      } else {
        doc.text(zh ? '✓ 所有月份数据完整' : '✓ All months complete');
      }
    }

    // Recommendations
    if (reportData.sections.recommendation) {
      sectionHeader(zh ? '五、建议' : 'V. Recommendations');
      reportData.sections.recommendation.items.forEach((r, i) => {
        doc.text(`${i + 1}. ${r}`, { continued: false });
      });
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(8).fillColor('#909399');
    doc.text(zh ? '免责声明：本报告仅供参考，不构成税务建议。具体税务事项请咨询注册税务师。' : 'Disclaimer: This report is for reference only and does not constitute tax advice.', { align: 'center' });
    doc.text(`Generated by 电商税务管理系统 | ${new Date().toISOString()}`, { align: 'center' });

    doc.end();

    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    // Save to DB
    const summary = {
      risk_level: overall,
      vat_diff: reportData.sections.vat?.total_difference || 0,
      wht_unmatched: reportData.sections.wht?.unmatched_total || 0,
      cit_payable: reportData.sections.cit?.tax_payable || 0,
      overdue: reportData.sections.compliance?.overdue_count || 0
    };
    const dbRes = await pool.query(
      `INSERT INTO audit_reports (company_id, year, report_no, risk_level, sections, summary, pdf_filename, pdf_path, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [company_id, year, reportNo, overall, JSON.stringify(reportData.sections), JSON.stringify(summary), pdfFilename, pdfPath, 'generated']
    );

    logAudit({ company_id: parseInt(company_id), action: 'export', entity_type: 'audit_report',
      description: `稽查报告: ${reportNo} 风险:${overall}`, req });

    res.json({
      id: dbRes.rows[0].id,
      report_no: reportNo,
      risk_level: overall,
      summary,
      sections: reportData.sections,
      pdf_filename: pdfFilename
    });
  } catch (e) { next(e); }
});

// GET /api/audit-report/history?company_id=xx
router.get('/history', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    let sql = 'SELECT id, company_id, year, report_no, risk_level, summary, pdf_filename, status, created_at FROM audit_reports';
    const params = [];
    if (company_id) { sql += ' WHERE company_id=$1'; params.push(company_id); }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

// GET /api/audit-report/download/:id
router.get('/download/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM audit_reports WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: '报告不存在' });
    const report = result.rows[0];
    if (fs.existsSync(report.pdf_path)) {
      res.download(report.pdf_path, report.pdf_filename);
    } else {
      res.status(404).json({ error: 'PDF文件不存在' });
    }
  } catch (e) { next(e); }
});

// GET /api/audit-report/preview/:id — return report data as JSON
router.get('/preview/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM audit_reports WHERE id=$1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: '报告不存在' });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

module.exports = router;
