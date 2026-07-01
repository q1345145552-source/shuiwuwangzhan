const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const PDFDocument = require('pdfkit');
const { pool } = require('../db');
const { logAudit } = require('../middleware/audit');
const { registerThaiFont, getFont, getBoldFont, thaiDateStr } = require('../utils/pdf-utils');

const CERT_DIR = path.join(__dirname, '..', '..', 'wht-certificates');
if (!fs.existsSync(CERT_DIR)) fs.mkdirSync(CERT_DIR, { recursive: true });

const WHT_RATES = {
  rental:      { name: '租金',      pnd53: 5,  pnd54: 15 },
  service:     { name: '服务费',    pnd53: 3,  pnd54: 15 },
  interest:    { name: '利息',      pnd53: 10, pnd54: 15 },
  royalty:     { name: '特许权',    pnd53: 15, pnd54: 15 },
  advertising: { name: '广告费',    pnd53: 2,  pnd54: 15 },
  transport:   { name: '运输费',    pnd53: 1,  pnd54: 15 },
  other:       { name: '其他',      pnd53: 3,  pnd54: 15 },
};

// GET /api/wht/rates
router.get('/rates', (req, res) => {
  const rates = Object.entries(WHT_RATES).map(([key, val]) => ({
    payment_type: key, name: val.name, pnd53_rate: val.pnd53, pnd54_rate: val.pnd54,
  }));
  res.json(rates);
});

// POST /api/wht/calculate
router.post('/calculate', (req, res) => {
  const { payment_type, payment_amount, payee_type } = req.body;
  if (!payment_type || payment_amount == null || !payee_type) {
    return res.status(400).json({ error: '缺少参数' });
  }
  const rateDef = WHT_RATES[payment_type];
  if (!rateDef) return res.status(400).json({ error: '无效付款类型' });
  if (!['domestic', 'foreign'].includes(payee_type)) {
    return res.status(400).json({ error: 'payee_type 必须为 domestic 或 foreign' });
  }
  const rate = payee_type === 'domestic' ? rateDef.pnd53 : rateDef.pnd54;
  if (rate == null) return res.status(400).json({ error: '此类型不支持该收款方' });
  const amount = parseFloat(payment_amount);
  const wht = Math.round(amount * rate) / 100;
  res.json({
    payment_type, name: rateDef.name, payee_type, rate,
    payment_amount: Math.round(amount * 100) / 100,
    wht_amount: wht,
    net_payment: Math.round((amount - wht) * 100) / 100,
  });
});

// GET /api/wht/reports?company_id=xx&period_id=xx
router.get('/reports', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少参数' });
    const result = await pool.query(
      `SELECT wr.*, (SELECT COUNT(*) FROM wht_details WHERE report_id = wr.id) as detail_count
       FROM wht_reports wr WHERE wr.company_id = $1 AND wr.period_id = $2 ORDER BY wr.id DESC`,
      [company_id, period_id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// GET /api/wht/reports/:id
router.get('/reports/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await pool.query('SELECT * FROM wht_reports WHERE id = $1', [id]);
    if (report.rows.length === 0) return res.status(404).json({ error: '申报不存在' });
    const details = await pool.query('SELECT * FROM wht_details WHERE report_id = $1 ORDER BY id', [id]);
    res.json({ ...report.rows[0], details: details.rows });
  } catch (err) { next(err); }
});

// POST /api/wht/reports
router.post('/reports', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { company_id, period_id, report_type, details } = req.body;
    if (!company_id || !period_id || !report_type) return res.status(400).json({ error: '缺少必填字段' });
    if (!['pnd53', 'pnd54', 'pnd1'].includes(report_type)) return res.status(400).json({ error: '无效报告类型' });
    if (!Array.isArray(details) || details.length === 0) return res.status(400).json({ error: '明细不能为空' });

    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      if (!d.payment_date || !d.payee_name || !d.payment_type || !d.payment_amount || d.wht_rate == null) {
        return res.status(400).json({ error: `第${i + 1}条缺必填字段` });
      }
    }

    const totalPayment = details.reduce((s, d) => s + parseFloat(d.payment_amount), 0);
    const totalWht = details.reduce((s, d) => s + Math.round(parseFloat(d.payment_amount) * parseFloat(d.wht_rate)) / 100, 0);

    await client.query('BEGIN');
    const report = await client.query(
      'INSERT INTO wht_reports (company_id, period_id, report_type, total_payment, total_wht, entry_count, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [company_id, period_id, report_type, totalPayment, Math.round(totalWht * 100) / 100, details.length, 'draft']
    );
    const inserted = [];
    for (const d of details) {
      const whtAmount = Math.round(parseFloat(d.payment_amount) * parseFloat(d.wht_rate)) / 100;
      const r = await client.query(
        'INSERT INTO wht_details (report_id, payment_date, payee_name, payee_tax_id, payment_type, payment_amount, wht_rate, wht_amount, invoice_ref, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [report.rows[0].id, d.payment_date, d.payee_name, d.payee_tax_id || null, d.payment_type, parseFloat(d.payment_amount), parseFloat(d.wht_rate), whtAmount, d.invoice_ref || null, d.description || '']
      );
      inserted.push(r.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ ...report.rows[0], details: inserted });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally { client.release(); }
});

// PUT /api/wht/reports/:id/status
router.put('/reports/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['draft', 'filed'].includes(status)) return res.status(400).json({ error: '状态无效' });
    let sql = 'UPDATE wht_reports SET status = $1 WHERE id = $2 RETURNING *';
    if (status === 'filed') sql = 'UPDATE wht_reports SET status = $1, filed_date = NOW() WHERE id = $2 RETURNING *';
    const result = await pool.query(sql, [status, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: '申报不存在' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/wht/reports/:id
router.delete('/reports/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const r = await pool.query('SELECT status FROM wht_reports WHERE id = $1', [id]);
    if (r.rows.length === 0) return res.status(404).json({ error: '申报不存在' });
    if (r.rows[0].status !== 'draft') return res.status(403).json({ error: '仅草稿可删除' });
    await pool.query('DELETE FROM wht_reports WHERE id = $1', [id]);
    res.json({ message: '删除成功' });
  } catch (err) { next(err); }
});

// GET /api/wht/50-tavi/:detail_id
router.get('/50-tavi/:detail_id', async (req, res, next) => {
  const useThai = req.query.lang === 'th';
  try {
    const { detail_id } = req.params;
    const detail = await pool.query(
      `SELECT wd.*, wr.company_id, wr.report_type
       FROM wht_details wd JOIN wht_reports wr ON wr.id = wd.report_id WHERE wd.id = $1`, [detail_id]
    );
    if (detail.rows.length === 0) return res.status(404).json({ error: '明细不存在' });

    const d = detail.rows[0];
    const company = await pool.query('SELECT code, name, tax_id, address FROM companies WHERE id = $1', [d.company_id]);
    if (company.rows.length === 0) return res.status(404).json({ error: '公司不存在' });
    const comp = company.rows[0];

    const year = new Date().getFullYear();
    const cnt = await pool.query('SELECT COUNT(*) as c FROM wht_details WHERE report_id IN (SELECT id FROM wht_reports WHERE company_id = $1)', [d.company_id]);
    const certNo = `WHT-${comp.code || d.company_id}-${year}-${String(parseInt(cnt.rows[0].c) || 1).padStart(3, '0')}`;
    const fileName = `${certNo}.pdf`;
    const filePath = path.join(CERT_DIR, fileName);

    await generateCertFile(d, comp, filePath, certNo, useThai);
    res.json({ url: `/wht-certificates/${fileName}`, cert_no: certNo, detail_id: parseInt(detail_id) });
  } catch (err) { next(err); }
});

// GET /api/wht/50-tavi-batch?report_id=xx
router.get('/50-tavi-batch', async (req, res, next) => {
  try {
    const { report_id } = req.query;
    if (!report_id) return res.status(400).json({ error: '缺少 report_id' });

    const details = await pool.query(
      'SELECT wd.*, wr.company_id FROM wht_details wd JOIN wht_reports wr ON wr.id = wd.report_id WHERE wd.report_id = $1 ORDER BY wd.id', [report_id]
    );
    if (details.rows.length === 0) return res.status(404).json({ error: '无明细' });

    // Get company once
    const compId = details.rows[0].company_id;
    const company = await pool.query('SELECT code, name, tax_id, address FROM companies WHERE id = $1', [compId]);
    const comp = company.rows.length > 0 ? company.rows[0] : { code: '', name: '', tax_id: '', address: '' };

    // Generate each cert
    const fnames = [];
    for (const d of details.rows) {
      const fname = `wht_detail_${d.id}.pdf`;
      const fp = path.join(CERT_DIR, fname);
      if (!fs.existsSync(fp)) {
        await generateCertFile(d, comp, fp, null, req.query.lang === 'th');
      }
      fnames.push(fname);
    }

    if (fnames.length === 0) return res.status(404).json({ error: '无法生成凭证' });

    // ZIP using adm-zip
    const zipName = `wht_batch_${report_id}.zip`;
    const zipPath = path.join(CERT_DIR, zipName);
    const zip = new AdmZip();
    for (const fn of fnames) {
      zip.addLocalFile(path.join(CERT_DIR, fn));
    }
    zip.writeZip(zipPath);

    res.json({ url: `/wht-certificates/${zipName}`, count: fnames.length });
  } catch (err) { next(err); }
});

// --- PDF Helper ---
async function generateCertFile(detail, company, filePath, certNo, useThai) {
  const THAI_M = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
  const thaiD = ds => { const dt = new Date(ds); return `${dt.getDate()} ${THAI_M[dt.getMonth()]} ${dt.getFullYear() + 543}`; };

  const doc = new PDFDocument({ size: 'A4', margin: 60 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  registerThaiFont(doc);
  const font = getFont(useThai ? 'th' : 'zh');
  const fontBold = getBoldFont(useThai ? 'th' : 'zh');

  doc.fontSize(16).font(fontBold).text('หนังสือรับรองภาษีหัก ณ ที่จ่าย', { align: 'center' });
  doc.fontSize(12).font(font).text('Withholding Tax Certificate (50 Tavi)', { align: 'center' });
  if (certNo) {
    doc.moveDown(0.3);
    doc.fontSize(10).font(font).text(`เลขที่ / No: ${certNo}`, { align: 'right' });
  }
  doc.moveDown(0.8);

  doc.fontSize(11).font(fontBold).text('ผู้จ่ายเงิน / Payor:');
  doc.font(font).fontSize(10)
     .text(`ชื่อ / Name: ${company.name}`)
     .text(`เลขประจำตัวผู้เสียภาษี / Tax ID: ${company.tax_id || company.code}`)
     .text(`ที่อยู่ / Address: ${company.address || '-'}`);
  doc.moveDown(0.5);

  doc.font(fontBold).fontSize(11).text('ผู้รับเงิน / Payee:');
  doc.font(font).fontSize(10)
     .text(`ชื่อ / Name: ${detail.payee_name}`)
     .text(`เลขประจำตัวผู้เสียภาษี / Tax ID: ${detail.payee_tax_id || '-'}`);
  doc.moveDown(0.5);

  const rateDef = WHT_RATES[detail.payment_type];
  const ln = (l, v) => { doc.font(fontBold).fontSize(10).text(`${l}: `, { continued: true }); doc.font(font).text(v); };
  ln('ประเภทเงินได้ / Payment Type', rateDef ? rateDef.name : detail.payment_type);
  ln('จำนวนเงินที่จ่าย / Amount Paid', `${parseFloat(detail.payment_amount).toFixed(2)} THB`);
  ln('อัตราภาษี / WHT Rate', `${parseFloat(detail.wht_rate).toFixed(2)}%`);
  ln('จำนวนภาษีที่หัก / WHT Amount', `${parseFloat(detail.wht_amount).toFixed(2)} THB`);
  ln('จำนวนเงินสุทธิ / Net Amount', `${(parseFloat(detail.payment_amount) - parseFloat(detail.wht_amount)).toFixed(2)} THB`);
  doc.moveDown(0.3);

  const pd = detail.payment_date ? detail.payment_date.toString().substring(0, 10) : '';
  doc.font(fontBold).fontSize(10).text('วันที่จ่าย / Payment Date: ', { continued: true });
  doc.font(font).text(thaiD(pd));
  doc.font(fontBold).text('วันที่ออกใบรับรอง / Issue Date: ', { continued: true });
  doc.font(font).text(thaiD(new Date().toISOString().substring(0, 10)));

  doc.moveDown(1.5);
  const mx = doc.page.width / 2;
  doc.font(font).fontSize(10).text('ลงชื่อ .....................................................', mx - 40, doc.y);
  doc.text(`      (${company.name})`, mx - 40, doc.y + 5);

  doc.moveDown(1);
  doc.fontSize(8).fillColor('#999').font(font).text('เอกสารนี้สร้างโดยระบบอัตโนมัติ', { align: 'center' });

  doc.end();
  await new Promise(r => stream.on('finish', r));
}

module.exports = router;
