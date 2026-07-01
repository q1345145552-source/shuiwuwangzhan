const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const FONT_DIR = path.join(__dirname, '..', '..', 'fonts');
const THAI_FONT_PATH = path.join(FONT_DIR, 'NotoSansThai.ttf');
const THAI_FONT_EXISTS = fs.existsSync(THAI_FONT_PATH);

function registerThaiFont(doc) {
  if (!THAI_FONT_EXISTS) return;
  try {
    doc.registerFont('Thai', THAI_FONT_PATH);
  } catch(e) {
    console.warn('泰文字体加载失败:', e.message);
  }
}

// Get font based on language preference
function getFont(lang) {
  if (lang === 'th' && THAI_FONT_EXISTS) return 'Thai';
  return 'Helvetica';
}

function getBoldFont(lang) {
  if (lang === 'th' && THAI_FONT_EXISTS) return 'Thai';
  return 'Helvetica-Bold';
}

const THAI_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน',
  'กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

function thaiDateStr(dateStr) {
  const d = new Date(dateStr);
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function createReportHeader(doc, { company, reportTitle, period, logoPath }) {
  if (logoPath && fs.existsSync(logoPath)) {
    try { doc.image(logoPath, 50, 40, { width: 60 }); } catch(e) { console.warn('Logo加载失败:', e.message); }
  }
  doc.fontSize(11).font('Helvetica-Bold').text(company.name || '', 350, 40, { align: 'right' });
  doc.fontSize(8).font('Helvetica').fillColor('#666');
  if (company.address_en) doc.text(company.address_en || '', 350, 55, { align: 'right' });
  if (company.tax_id) doc.text(`Tax ID: ${company.tax_id}`, 350, 65, { align: 'right' });
  doc.fillColor('#000');
  doc.moveTo(50, 90).lineTo(545, 90).stroke('#ccc');
  doc.fontSize(18).font('Helvetica-Bold').text(reportTitle, 50, 105, { align: 'center' });
  doc.fontSize(10).font('Helvetica');
  doc.text(`报告期间: ${period}`, 50, 130, { align: 'center' });
  doc.text(`生成日期: ${new Date().toLocaleDateString('zh-CN')}`, 50, 145, { align: 'center' });
  doc.moveTo(50, 165).lineTo(545, 165).stroke('#ccc');
}

module.exports = {
  registerThaiFont, getFont, getBoldFont, thaiDateStr, THAI_MONTHS, createReportHeader
};
