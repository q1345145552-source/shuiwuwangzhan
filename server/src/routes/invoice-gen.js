const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const { pool } = require('../db');
const { registerThaiFont, getFont, getBoldFont, thaiDateStr } = require('../utils/pdf-utils');

const INVOICE_DIR = path.join(__dirname, '..', '..', 'invoices');

// 确保目录存在
if (!fs.existsSync(INVOICE_DIR)) fs.mkdirSync(INVOICE_DIR, { recursive: true });

// 泰文月份
const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function thaiDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

// POST /api/invoice-generate
router.post('/invoice-generate', async (req, res, next) => {
  try {
    const { company_id, period_id, type, customer_name, customer_tax_id, customer_address, items, exchange_rate, lang } = req.body;
    const useThai = lang === 'th';

    if (!company_id || !period_id || !type || !customer_name || !items || !items.length) {
      return res.status(400).json({ error: '缺少必填字段' });
    }

    // 获取公司信息
    const company = await pool.query('SELECT * FROM companies WHERE id = $1', [company_id]);
    if (company.rows.length === 0) return res.status(404).json({ error: '公司不存在' });
    const comp = company.rows[0];

    // 计算金额
    const totalExVat = items.reduce((s, item) => s + (parseFloat(item.amount) || parseFloat(item.qty) * parseFloat(item.price) || 0), 0);
    const vatAmount = Math.round(totalExVat * 7) / 100;
    const totalIncVat = totalExVat + vatAmount;

    // 生成发票号 IN-年月-序号
    const count = await pool.query(
      "SELECT COUNT(*) as cnt FROM invoices WHERE company_id = $1 AND period_id = $2 AND type = $3",
      [company_id, period_id, type]
    );
    const seq = parseInt(count.rows[0].cnt) + 1;
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const invoiceNo = `IN-${ym}-${String(seq).padStart(3, '0')}`;
    const fileName = `${invoiceNo}.pdf`;
    const filePath = path.join(INVOICE_DIR, fileName);

    // ---------- 生成 PDF ----------
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    registerThaiFont(doc);
    const font = getFont(useThai ? 'th' : 'zh');
    const fontBold = getBoldFont(useThai ? 'th' : 'zh');
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // 1. Title
    const titleText = type === 'tax_invoice' ? 'ใบกำกับภาษี / Tax Invoice' : 'ใบเสร็จรับเงิน / Receipt';
    doc.fontSize(18).font(fontBold).text(titleText, { align: 'center' });
    doc.moveDown(0.5);

    // 2,3 Seller info
    doc.fontSize(11).font(fontBold).text('ผู้ออกใบกำกับภาษี / Seller:', { continued: false });
    doc.font(font).fontSize(10)
       .text(`ชื่อ / Name: ${comp.name}`)
       .text(`เลขประจำตัวผู้เสียภาษี / Tax ID: ${comp.tax_id || comp.code}`)
       .text(`ที่อยู่ / Address: ${comp.address || '-'}`);
    doc.moveDown(0.5);

    // 4,5 Buyer info
    doc.font(fontBold).fontSize(11).text('ผู้ซื้อ / Buyer:', { continued: false });
    doc.font(font).fontSize(10)
       .text(`ชื่อ / Name: ${customer_name}`)
       .text(`เลขประจำตัวผู้เสียภาษี / Tax ID: ${customer_tax_id || '-'}`);
    doc.moveDown(0.5);

    // 6,7 Invoice No & Date
    doc.font(fontBold).fontSize(10)
       .text(`เลขที่ใบกำกับภาษี / Invoice No: ${invoiceNo}`)
       .text(`วันที่ / Date: ${thaiDate(now.toISOString().substring(0, 10))}`);
    doc.moveDown(0.5);

    // Table header
    const tableTop = doc.y + 5;
    const colX = [50, 260, 320, 390, 460, 520]; // name, qty, price, amount
    const colW = [210, 60, 70, 70, 60, 0];

    doc.font(fontBold).fontSize(9);
    doc.text('รายการ / Description', colX[0], tableTop, { width: colW[0] });
    doc.text('จำนวน / Qty', colX[1], tableTop, { width: colW[1], align: 'right' });
    doc.text('ราคา/หน่วย / Price', colX[2], tableTop, { width: colW[2], align: 'right' });
    doc.text('จำนวนเงิน / Amount', colX[3], tableTop, { width: colW[3], align: 'right' });

    // Line
    const lineY = tableTop + 15;
    doc.moveTo(50, lineY).lineTo(550, lineY).stroke();

    // 8,9,10 Items
    let itemY = lineY + 8;
    doc.font(font).fontSize(10);
    for (const item of items) {
      const qty = parseFloat(item.qty) || 1;
      const price = parseFloat(item.price) || 0;
      const amount = parseFloat(item.amount) || qty * price;
      doc.text(item.name || '-', colX[0], itemY, { width: colW[0] });
      doc.text(qty.toLocaleString(), colX[1], itemY, { width: colW[1], align: 'right' });
      doc.text(price.toFixed(2), colX[2], itemY, { width: colW[2], align: 'right' });
      doc.text(amount.toFixed(2), colX[3], itemY, { width: colW[3], align: 'right' });
      itemY += 20;
      if (itemY > 700) { doc.addPage(); itemY = 50; }
    }

    // Summary
    let sumY = itemY + 10;
    doc.moveTo(50, sumY).lineTo(550, sumY).stroke();
    sumY += 8;
    doc.font(font).fontSize(11);
    doc.text('รวมเงินไม่รวมภาษี / Total (excl. VAT):', 300, sumY, { width: 150, align: 'right' });
    doc.text(totalExVat.toFixed(2), 460, sumY, { width: 90, align: 'right' });
    sumY += 22;
    // 11 VAT
    doc.text('ภาษีมูลค่าเพิ่ม 7% / VAT 7%:', 300, sumY, { width: 150, align: 'right' });
    doc.text(vatAmount.toFixed(2), 460, sumY, { width: 90, align: 'right' });
    sumY += 22;
    doc.font(fontBold).fontSize(12);
    doc.text('รวมเงินทั้งสิ้น / Grand Total:', 300, sumY, { width: 150, align: 'right' });
    doc.text(totalIncVat.toFixed(2), 460, sumY, { width: 90, align: 'right' });

    // Footer
    sumY += 40;
    doc.font(font).fontSize(9).fillColor('#666');
    doc.text('หมายเหตุ / Note: เอกสารนี้สร้างโดยระบบอัตโนมัติ', 50, sumY, { align: 'center' });

    doc.end();

    await new Promise((resolve) => stream.on('finish', resolve));

    // 保存到 invoices 表
    const invResult = await pool.query(
      `INSERT INTO invoices (company_id, period_id, type, invoice_no, customer_name, customer_tax_id, items,
         total_ex_vat, vat_amount, total_inc_vat, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [company_id, period_id, type, invoiceNo, customer_name, customer_tax_id || null,
       JSON.stringify(items), totalExVat, vatAmount, totalIncVat, 'issued']
    );

    res.status(201).json({
      url: `/invoices/${fileName}`,
      id: invResult.rows[0].id,
      invoice_no: invoiceNo,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/invoices?company_id=xx&period_id=xx
router.get('/invoices', async (req, res, next) => {
  try {
    const { company_id, period_id } = req.query;
    if (!company_id || !period_id) {
      return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    }
    const result = await pool.query(
      'SELECT * FROM invoices WHERE company_id = $1 AND period_id = $2 ORDER BY id DESC',
      [company_id, period_id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
