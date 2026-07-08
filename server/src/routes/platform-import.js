const express = require('express');
const router = express.Router();
const multer = require('multer');
const Papa = require('papaparse');
const { pool } = require('../db');
const { logAudit } = require('../middleware/audit');
const { VAT_RATE } = require('../constants');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const r2 = n => Math.round((parseFloat(n) || 0) * 100) / 100;

// ================ 平台检测规则 ================
const PLATFORM_RULES = [
  {
    platform: 'shopee',
    name: 'Shopee',
    keywords: ['order id', 'buyer name', 'commission fee'],
    fieldMap: {
      'Order ID': 'order_id',
      'Order Date': 'order_date',
      'Buyer Name': 'customer_name',
      'Product Name': 'product_name',
      'SKU': 'sku',
      'Quantity': 'quantity',
      'Item Price': 'unit_price',
      'Shipping Fee': 'shipping_fee',
      'Commission Fee': 'platform_fee',
      'Service Fee': 'other_fee',
      'Total Amount': 'total_amount'
    }
  },
  {
    platform: 'lazada',
    name: 'Lazada',
    keywords: ['order number', 'customer name', 'commission', 'item name'],
    fieldMap: {
      'Order Number': 'order_id',
      'Order Date': 'order_date',
      'Customer Name': 'customer_name',
      'Item Name': 'product_name',
      'SKU': 'sku',
      'Quantity': 'quantity',
      'Item Price': 'unit_price',
      'Shipping Fee': 'shipping_fee',
      'Commission': 'platform_fee',
      'Payment Fee': 'other_fee',
      'Total': 'total_amount'
    }
  },
  {
    platform: 'tiktok',
    name: 'TikTok Shop',
    keywords: ['buyer username', 'platform commission', 'net amount'],
    fieldMap: {
      'Order ID': 'order_id',
      'Order Time': 'order_date',
      'Buyer Username': 'customer_name',
      'Product Name': 'product_name',
      'SKU Info': 'sku',
      'SKU': 'sku',
      'Quantity': 'quantity',
      'Unit Price': 'unit_price',
      'Shipping Fee': 'shipping_fee',
      'Platform Commission': 'platform_fee',
      'Transaction Fee': 'other_fee',
      'Total Amount': 'total_amount',
      'Net Amount': 'net_amount'
    }
  }
];

function detectPlatform(headers) {
  const headerStr = headers.join(' ').toLowerCase();
  for (const rule of PLATFORM_RULES) {
    const match = rule.keywords.every(kw => headerStr.includes(kw.toLowerCase()));
    if (match) return rule;
  }
  return null;
}

function cleanAmount(val) {
  if (val == null || val === '') return 0;
  const s = String(val).replace(/[THB฿¥$,%฿\s]/g, '').replace(/,/g, '');
  return r2(parseFloat(s)) || 0;
}

// ================ AI 智能字段映射引擎 ================
// 系统标准字段定义（含中英文语义描述，供 AI 匹��用）
const SYSTEM_STANDARD_FIELDS = [
  { field: 'platform_sales',    labels: ['含税销售额','销售额','总金额','total amount','gross sales','order amount','revenue'], type: 'number' },
  { field: 'platform_fees',     labels: ['平台佣金','佣金','commission fee','commission','platform commission','marketplace fee'], type: 'number' },
  { field: 'advertising_fees',  labels: ['广告费','广告','advertising','ad spend','ads','marketing'], type: 'number' },
  { field: 'shipping_fees',     labels: ['物流运费','运费支出','shipping cost','delivery fee','freight'], type: 'number' },
  { field: 'shipping_income',   labels: ['运费收入','shipping income','shipping fee','delivery income','shipping charged'], type: 'number' },
  { field: 'order_date',        labels: ['订单日期','日期','order date','order time','date','transaction date'], type: 'date' },
  { field: 'order_no',          labels: ['订单号','订单编号','order id','order number','order no','transaction id'], type: 'string' },
  { field: 'store_name',        labels: ['店铺名称','店铺','shop name','store','seller'], type: 'string' },
  { field: 'platform_refunds',  labels: ['退款','退款金额','refund','refund amount','return'], type: 'number' },
  { field: 'discounts',         labels: ['优惠折扣','折扣','discount','coupon','promotion'], type: 'number' },
  { field: 'platform_subsidy',  labels: ['平台补贴','补贴','subsidy','rebate','platform subsidy','coin'], type: 'number' },
  { field: 'other_income',      labels: ['其他收入','other income','misc income'], type: 'number' },
  { field: 'transaction_fee',   labels: ['交易手续费','手续费','transaction fee','payment fee','processing fee','service fee'], type: 'number' },
  { field: 'wht_deducted',      labels: ['预扣税','WHT','withholding tax','tax deducted'], type: 'number' },
  { field: 'campaign_fee',      labels: ['活动服务费','活动费','campaign fee','promo fee'], type: 'number' },
  { field: 'affiliate_commission', labels: ['达人佣金','达人','affiliate','koc','influencer','kol'], type: 'number' },
  { field: 'cod_fee',           labels: ['COD手续费','COD','cash on delivery','cod fee'], type: 'number' },
  { field: 'cost_of_goods',     labels: ['采购成本','成本','cost','cogs','purchase cost','supplier cost'], type: 'number' },
  { field: 'product_name',      labels: ['商品名称','商品','product name','item name','product','sku name'], type: 'string' },
  { field: 'customer_name',     labels: ['客户名称','买家','customer','buyer','buyer name','buyer username'], type: 'string' },
  { field: 'quantity',          labels: ['数量','quantity','qty','count'], type: 'number' },
  { field: 'unit_price',        labels: ['单价','unit price','item price','price'], type: 'number' },
  { field: 'sku',               labels: ['SKU','sku','sku info','product code','item code'], type: 'string' },
];

// 文本相似度 (Dice coefficient on bigrams)
function textSimilarity(a, b) {
  const s1 = a.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  const s2 = b.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0;
  const bigrams = s => { const r = new Set(); for (let i = 0; i < s.length - 1; i++) r.add(s.slice(i, i + 2)); return r; };
  const b1 = bigrams(s1), b2 = bigrams(s2);
  let intersection = 0;
  for (const bg of b1) if (b2.has(bg)) intersection++;
  const total = b1.size + b2.size;
  return total === 0 ? 0 : (2 * intersection) / total;
}

// 判断一个值看起来像是日期
function looksLikeDate(val) {
  if (!val) return false;
  const s = String(val).trim();
  return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s) || /^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s) || /^\d{4}-\d{2}-\d{2}T/.test(s);
}

// 判断一个值看起来像是订单号
function looksLikeOrderNo(val) {
  if (!val) return false;
  const s = String(val).trim();
  return /^\d{10,20}$/.test(s) || /^[A-Z0-9]{8,30}$/.test(s) || /#\d+/.test(s);
}

// 判断一个值看起来像是SKU
function looksLikeSku(val) {
  if (!val) return false;
  const s = String(val).trim();
  return /^[A-Z0-9_-]{4,20}$/.test(s) && !/^\d{4}[-/]\d/.test(s);
}

// AI 智能映射主函数
function aiMapColumns(csvHeaders, sampleRows, platformRule) {
  const result = {};
  const usedFields = new Set();

  // Pre-analyze sample data
  const sampleValues = {};
  for (const h of csvHeaders) {
    const vals = sampleRows.slice(0, 10).map(r => String(r[h] || '').trim()).filter(Boolean);
    sampleValues[h] = vals;
  }

  // Pass 1: exact match from platform fieldMap
  for (const h of csvHeaders) {
    const exact = platformRule?.fieldMap?.[h];
    if (exact) {
      const stdField = translateToStandard(exact);
      if (stdField && !usedFields.has(stdField)) {
        result[h] = { field: stdField, confidence: 'exact', method: 'platform_rule' };
        usedFields.add(stdField);
      }
    }
  }

  // Pass 2: header name fuzzy match against SYSTEM_STANDARD_FIELDS labels
  for (const h of csvHeaders) {
    if (result[h]) continue;
    let bestField = null, bestScore = 0;
    for (const sf of SYSTEM_STANDARD_FIELDS) {
      if (usedFields.has(sf.field)) continue;
      for (const label of sf.labels) {
        const score = textSimilarity(h, label);
        // Also check if header contains the label or vice versa (keyword match)
        const hLow = h.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
        const lLow = label.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
        const contains = hLow.includes(lLow) || lLow.includes(hLow);
        const combined = Math.max(score, contains ? 0.75 : 0);
        if (combined > bestScore) { bestScore = combined; bestField = sf.field; }
      }
    }
    if (bestField && bestScore >= 0.5) {
      result[h] = { field: bestField, confidence: bestScore >= 0.85 ? 'high' : 'medium', method: 'fuzzy_match', score: Math.round(bestScore * 100) };
      usedFields.add(bestField);
    }
  }

  // Pass 3: sample data pattern match for remaining columns
  for (const h of csvHeaders) {
    if (result[h]) continue;
    const vals = sampleValues[h] || [];
    if (vals.length === 0) continue;

    // Date detection
    const dateRatio = vals.filter(looksLikeDate).length / vals.length;
    if (dateRatio > 0.7) {
      const candidates = ['order_date'];
      for (const cand of candidates) {
        if (!usedFields.has(cand)) {
          result[h] = { field: cand, confidence: 'high', method: 'pattern_date' };
          usedFields.add(cand);
          break;
        }
      }
      continue;
    }

    // Order number detection
    const onRatio = vals.filter(looksLikeOrderNo).length / vals.length;
    if (onRatio > 0.6) {
      if (!usedFields.has('order_no')) {
        result[h] = { field: 'order_no', confidence: 'high', method: 'pattern_orderno' };
        usedFields.add('order_no');
        continue;
      }
    }

    // SKU detection
    const skuRatio = vals.filter(looksLikeSku).length / vals.length;
    if (skuRatio > 0.5 && !/name|名称|product|item|商品/i.test(h)) {
      if (!usedFields.has('sku')) {
        result[h] = { field: 'sku', confidence: 'medium', method: 'pattern_sku' };
        usedFields.add('sku');
        continue;
      }
    }

    // Numeric detection for amount columns
    const numVals = vals.map(v => parseFloat(String(v).replace(/[^\d.-]/g, ''))).filter(v => !isNaN(v) && v !== 0);
    if (numVals.length > 0 && numVals.length / vals.length > 0.5) {
      const avg = numVals.reduce((s, v) => s + v, 0) / numVals.length;
      // Large amounts → platform_sales
      if (avg > 100 && !usedFields.has('platform_sales')) {
        result[h] = { field: 'platform_sales', confidence: 'medium', method: 'pattern_amount_large' };
        usedFields.add('platform_sales');
        continue;
      }
      // Moderate amounts → platform_fees or transaction_fee
      if (avg > 5 && avg <= 200 && !usedFields.has('platform_fees')) {
        result[h] = { field: 'platform_fees', confidence: 'low', method: 'pattern_amount_medium' };
        usedFields.add('platform_fees');
        continue;
      }
    }
  }

  // Pass 4: mark unmatched
  for (const h of csvHeaders) {
    if (!result[h]) {
      result[h] = { field: null, confidence: 'none', method: 'unmatched' };
    }
  }

  return result;
}

// 平台字段名 → 标准字段名 转换
function translateToStandard(platformField) {
  const map = {
    'total_amount': 'platform_sales',
    'platform_fee': 'platform_fees',
    'shipping_fee': 'shipping_income',
    'shipping_cost': 'shipping_fees',
    'other_fee': 'transaction_fee',
    'order_id': 'order_no',
    'order_date': 'order_date',
    'customer_name': 'customer_name',
    'product_name': 'product_name',
    'sku': 'sku',
    'quantity': 'quantity',
    'unit_price': 'unit_price',
    'net_amount': 'platform_sales',
    'commission': 'platform_fees',
    'advertising': 'advertising_fees',
    'refund': 'platform_refunds',
    'discount': 'discounts',
    'order_number': 'order_no',
    'order_time': 'order_date',
    'buyer_name': 'customer_name',
    'buyer_username': 'customer_name',
    'item_name': 'product_name',
    'sku_info': 'sku',
    'transaction_fee': 'transaction_fee',
    'payment_fee': 'transaction_fee',
    'service_fee': 'campaign_fee',
    'cod_fee': 'cod_fee',
    'wht': 'wht_deducted',
  };
  return map[platformField] || null;
}


function parseCsvBuffer(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const result = Papa.parse(text, { header: true, skipEmptyLines: true, trimHeaders: true });
  return { headers: result.meta.fields || [], rows: result.data };
}

// GET /api/platform-import/templates
router.get('/templates', (req, res) => {
  res.json(
    PLATFORM_RULES.map(r => ({
      platform: r.platform,
      name: r.name,
      fields: Object.keys(r.fieldMap)
    }))
  );
});

// POST /api/platform-import/ai-map — AI 智能字段映射
router.post('/ai-map', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传CSV文件' });

    const { headers, rows } = parseCsvBuffer(req.file.buffer);
    if (!headers.length || !rows.length) return res.status(400).json({ error: 'CSV文件为空或格式不正确' });

    const detected = detectPlatform(headers);
    const platformRule = detected || PLATFORM_RULES[0];

    const aiResult = aiMapColumns(headers, rows, platformRule);

    // Return standard fields list with descriptions for frontend
    const standardFields = SYSTEM_STANDARD_FIELDS.map(f => ({
      value: f.field,
      label: f.labels[0],
      desc: f.labels.slice(0, 3).join(' / '),
      type: f.type,
    }));

    res.json({
      platform_detected: platformRule.platform,
      platform_name: platformRule.name,
      ai_mapping: aiResult,
      all_headers: headers,
      standard_fields: standardFields,
      total_rows: rows.length,
      filename: req.file.originalname,
    });
  } catch (e) { next(e); }
});

// POST /api/platform-import/preview — 上传CSV预览
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传CSV文件' });

    const { headers, rows } = parseCsvBuffer(req.file.buffer);
    if (!headers.length || !rows.length) return res.status(400).json({ error: 'CSV文件为空或格式不正确' });

    const detected = detectPlatform(headers);
    const platform = detected || { platform: 'unknown', name: '未知', fieldMap: {} };

    // Build column matching
    const columnsMatched = {};
    for (const h of headers) {
      const std = platform.fieldMap[h];
      columnsMatched[h] = std || null;
    }

    // Preview first 5 rows (clean amounts)
    const previewRows = rows.slice(0, 5).map(row => {
      const cleaned = {};
      for (const [k, v] of Object.entries(row)) {
        const std = platform.fieldMap[k];
        if (std && ['total_amount', 'platform_fee', 'shipping_fee', 'other_fee', 'unit_price', 'net_amount'].includes(std)) {
          cleaned[k] = cleanAmount(v);
        } else {
          cleaned[k] = v;
        }
      }
      return cleaned;
    });

    // Run AI smart mapping on top of platform rules
    const aiMapping = aiMapColumns(headers, rows, detected || undefined);

    res.json({
      platform_detected: platform.platform,
      platform_name: platform.name,
      columns_matched: columnsMatched,
      ai_mapping: aiMapping,
      all_headers: headers,
      standard_fields: SYSTEM_STANDARD_FIELDS.map(f => ({ value: f.field, label: f.labels[0], desc: f.labels.slice(0, 3).join(' / '), type: f.type })),
      preview_rows: previewRows,
      total_rows: rows.length,
      filename: req.file.originalname
    });
  } catch (e) { next(e); }
});

// POST /api/platform-import/import — 确认导入
router.post('/import', upload.single('file'), async (req, res, next) => {
  try {
    const { company_id, period_id, platform, import_as } = req.body;
    if (!company_id || !period_id) return res.status(400).json({ error: '缺少 company_id 或 period_id' });
    if (!req.file) return res.status(400).json({ error: '请上传CSV文件' });

    const { headers, rows } = parseCsvBuffer(req.file.buffer);
    const detected = detectPlatform(headers);
    const platRule = PLATFORM_RULES.find(r => r.platform === (platform || detected?.platform)) || PLATFORM_RULES[0];
    const platPlatform = platRule.platform;

    // Create import record first
    const importRes = await pool.query(
      `INSERT INTO platform_imports (company_id, period_id, platform, filename, import_type, total_rows) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [company_id, period_id, platPlatform, req.file.originalname, import_as || 'vat_output', rows.length]
    );
    const importId = importRes.rows[0].id;

    let success = 0, failed = 0;
    const errors = [];

    // Process each row independently (no transaction - partial success OK)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const orderId = row['Order ID'] || row['Order Number'] || `IMP-${i + 1}`;
        const orderDate = (row['Order Date'] || row['Order Time'] || new Date().toISOString().slice(0, 10)).toString().trim();
        const customerName = (row['Buyer Name'] || row['Customer Name'] || row['Buyer Username'] || '').toString().trim();
        const productName = (row['Product Name'] || row['Item Name'] || '').toString().trim();
        const totalAmount = parseFloat(cleanAmount(row['Total Amount'] || row['Total'] || 0));
        const platformFee = parseFloat(cleanAmount(row['Commission Fee'] || row['Commission'] || row['Platform Commission'] || 0));
        const shippingFee = parseFloat(cleanAmount(row['Shipping Fee'] || 0));
        const otherFee = parseFloat(cleanAmount(row['Service Fee'] || row['Payment Fee'] || row['Transaction Fee'] || 0));

        if (!totalAmount || totalAmount <= 0) { failed++; errors.push(`行${i + 2}: 金额为空`); continue; }

        // Check duplicate
        const dup = await pool.query(
          'SELECT id FROM platform_raw_orders WHERE company_id=$1 AND platform=$2 AND order_id=$3',
          [company_id, platPlatform, orderId]
        );
        if (dup.rows.length > 0) { failed++; errors.push(`行${i + 2}: 订单 ${orderId} 已存在`); continue; }

        // Insert raw order
        await pool.query(
          `INSERT INTO platform_raw_orders (company_id, period_id, platform, order_id, order_date, customer_name, product_name, total_amount, platform_fee, shipping_fee, other_fee, import_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [company_id, period_id, platPlatform, orderId, orderDate, customerName, productName, totalAmount, platformFee, shippingFee, otherFee, importId]
        );

        // Import as vat_output — then mark raw_order as matched
        if (import_as !== 'ecommerce_sales') {
          const amountExVat = r2(totalAmount  / (1 + VAT_RATE));
          const vatAmount = r2(totalAmount - amountExVat);
          await pool.query(
            `INSERT INTO vat_output_details (company_id, period_id, invoice_date, customer_name, description, amount_ex_vat, vat_amount, total_amount, source)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [company_id, period_id, orderDate, customerName, productName, amountExVat, vatAmount, totalAmount, platPlatform]
          );
        }

        // Insert one ecommerce_sales record per CSV row (multi-record mode)
        const grossSales = totalAmount;
        const vatSales = r2(grossSales - grossSales / (1 + VAT_RATE));
        // Build custom_deductions for unrecognized fees
        const cdItems = [];
        if (otherFee > 0) cdItems.push({ name: '其他费用(平台)', amount: otherFee, notes: 'CSV导入', is_vat_inclusive: true });
        const customDed = cdItems.length > 0 ? JSON.stringify(cdItems) : '[]';
        // Purchases VAT from platform_fees (is_vat_inclusive)
        const vatPurchases = r2((platformFee / (1 + VAT_RATE) * VAT_RATE) + (otherFee / (1 + VAT_RATE) * VAT_RATE));
        await pool.query(
          `INSERT INTO ecommerce_sales
            (company_id, period_id, platform, store_name, order_date, order_no,
             platform_sales, shipping_income, platform_fees,
             is_vat_inclusive, vat_rate, collection_status,
             vat_sales_calculated, vat_purchases_calculated,
             custom_deductions, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [company_id, period_id, platRule.name, '', orderDate, orderId,
           grossSales, shippingFee, platformFee,
           true, VAT_RATE, 'uncollected',
           vatSales, vatPurchases,
           customDed, productName || '']
        );

        // Mark raw order as matched
        await pool.query('UPDATE platform_raw_orders SET matched_to_detail=TRUE WHERE company_id=$1 AND platform=$2 AND order_id=$3',
          [company_id, platPlatform, orderId]).catch(err => { console.error("平台导入 DB 写入失败:", err.message); });
        success++;
      } catch (rowErr) {
        failed++;
        errors.push(`行${i + 2}: ${rowErr.message}`);
      }
    }

    // Update import record
    await pool.query(
      `UPDATE platform_imports SET success_rows=$1, failed_rows=$2, errors=$3, status=$4 WHERE id=$5`,
      [success, failed, JSON.stringify(errors), success > 0 ? 'completed' : 'failed', importId]
    );

    logAudit({ company_id: parseInt(company_id), action: 'import', entity_type: 'platform_csv',
      description: `${platRule.name} CSV导入: ${success}成功/${failed}失败`, new_value: { platform: platPlatform, success, failed }, req });

    res.json({ success: true, platform: platPlatform, total_rows: rows.length, success_rows: success, failed_rows: failed, errors, import_id: importId });
  } catch (e) { next(e); }
});

// GET /api/platform-import/history?company_id=xx
router.get('/history', async (req, res, next) => {
  try {
    const { company_id } = req.query;
    let sql = 'SELECT * FROM platform_imports WHERE 1=1 ORDER BY created_at DESC LIMIT 50';
    const params = [];
    if (company_id) { params.push(company_id); sql = `SELECT * FROM platform_imports WHERE company_id=$1 ORDER BY created_at DESC LIMIT 50`; }
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

// ================ 平台数据对比 ================
// GET /api/platform-import/comparison?company_id=xx&year=2025&month=xx
router.get('/comparison', async (req, res, next) => {
  try {
    const { company_id, year, month } = req.query;
    if (!company_id || !year || !month) return res.status(400).json({ error: '缺少参数' });

    // Get period_id
    const per = await pool.query(
      'SELECT id FROM accounting_periods WHERE company_id=$1 AND year=$2 AND month=$3',
      [company_id, year, month]
    );
    const periodId = per.rows[0]?.id;
    if (!periodId) return res.json({ error: '该期间不存在' });

    // Platform data: aggregate raw orders
    const platData = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total_sales, COALESCE(SUM(platform_fee),0) AS total_fees,
              COALESCE(SUM(shipping_fee),0) AS total_shipping, COALESCE(SUM(other_fee),0) AS total_other,
              COUNT(*) AS order_count
       FROM platform_raw_orders WHERE company_id=$1 AND period_id=$2`,
      [company_id, periodId]
    );

    // System data: from ecommerce_sales
    const sysData = await pool.query(
      `SELECT COALESCE(platform_sales,0) AS total_sales, COALESCE(platform_fees,0) AS total_fees,
              COALESCE(shipping_fees,0) AS total_shipping, COALESCE(other_expenses,0)+COALESCE(advertising_fees,0) AS total_other
       FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2`,
      [company_id, periodId]
    );

    const pd = platData.rows[0] || {};
    const sd = sysData.rows[0] || {};

    const salesDiff = r2((parseFloat(sd.total_sales) || 0) - (parseFloat(pd.total_sales) || 0));
    const feesDiff = r2((parseFloat(sd.total_fees) || 0) - (parseFloat(pd.total_fees) || 0));
    const shippingDiff = r2((parseFloat(sd.total_shipping) || 0) - (parseFloat(pd.total_shipping) || 0));

    // Missing orders: platform has but system (vat_output_details) doesn't
    const missingOrders = await pool.query(
      `SELECT pro.order_id, pro.order_date, pro.total_amount, pro.customer_name, pro.id AS raw_id
       FROM platform_raw_orders pro
       WHERE pro.company_id=$1 AND pro.period_id=$2 AND pro.matched_to_detail = FALSE
       ORDER BY pro.order_date`,
      [company_id, periodId]
    );

    const allMatched = salesDiff === 0 && feesDiff === 0 && shippingDiff === 0 && missingOrders.rows.length === 0;
    const status = allMatched ? 'matched' : missingOrders.rows.length > 0 ? 'has_missing' : 'has_differences';

    res.json({
      period: `${year}-${String(month).padStart(2, '0')}`,
      platform_data: { total_sales: r2(pd.total_sales), total_fees: r2(pd.total_fees), total_shipping: r2(pd.total_shipping), total_other: r2(pd.total_other), order_count: parseInt(pd.order_count) },
      system_data: { total_sales: r2(sd.total_sales), total_fees: r2(sd.total_fees), total_shipping: r2(sd.total_shipping), total_other: r2(sd.total_other) },
      differences: { sales_diff: salesDiff, fees_diff: feesDiff, shipping_diff: shippingDiff },
      missing_orders: missingOrders.rows,
      status
    });
  } catch (e) { next(e); }
});

// POST /api/platform-import/add-missing — 一键导入缺失订单
router.post('/add-missing', async (req, res, next) => {
  try {
    const { company_id, period_id, order_ids } = req.body;
    if (!company_id || !period_id || !order_ids?.length) return res.status(400).json({ error: '缺少参数' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      let cnt = 0;
      for (const rawId of order_ids) {
        const ord = await client.query('SELECT * FROM platform_raw_orders WHERE id=$1 AND matched_to_detail=FALSE', [rawId]);
        if (!ord.rows.length) continue;
        const o = ord.rows[0];
        const amountExVat = r2(parseFloat(o.total_amount)  / (1 + VAT_RATE));
        const vatAmount = r2(parseFloat(o.total_amount) - amountExVat);

        await client.query(
          `INSERT INTO vat_output_details (company_id, period_id, invoice_date, customer_name, description, amount_ex_vat, vat_amount, total_amount, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [company_id, period_id, o.order_date || new Date().toISOString().slice(0, 10), o.customer_name, o.product_name, amountExVat, vatAmount, o.total_amount, o.platform]
        );
        await client.query('UPDATE platform_raw_orders SET matched_to_detail=TRUE WHERE id=$1', [rawId]);
        cnt++;
      }
      await client.query('COMMIT');
      res.json({ success: true, imported: cnt });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  } catch (e) { next(e); }
});

// GET /api/platform-import/trend?company_id=xx&year=2025 — 6个月趋势
router.get('/trend', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    const result = await pool.query(
      `SELECT ap.month,
        COALESCE((SELECT SUM(total_amount) FROM platform_raw_orders WHERE company_id=$1 AND period_id=ap.id),0) AS platform_sales,
        COALESCE((SELECT COALESCE(platform_sales,0) FROM ecommerce_sales WHERE company_id=$1 AND period_id=ap.id),0) AS system_sales
       FROM accounting_periods ap
       WHERE ap.company_id=$1 AND ap.year=$2
       ORDER BY ap.month`,
      [company_id, year]
    );
    res.json(result.rows);
  } catch (e) { next(e); }
});

module.exports = router;
