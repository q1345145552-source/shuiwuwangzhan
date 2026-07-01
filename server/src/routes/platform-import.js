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

    res.json({
      platform_detected: platform.platform,
      platform_name: platform.name,
      columns_matched: columnsMatched,
      all_headers: headers,
      standard_fields: platform.fieldMap,
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

        // Upsert ecommerce_sales
        const existing = await pool.query(
          'SELECT id FROM ecommerce_sales WHERE company_id=$1 AND period_id=$2',
          [company_id, period_id]
        );
        if (existing.rows.length) {
          await pool.query(
            `UPDATE ecommerce_sales SET platform_sales = COALESCE(platform_sales,0) + $1, platform_fees = COALESCE(platform_fees,0) + $2, shipping_fees = COALESCE(shipping_fees,0) + $3 WHERE id = $4`,
            [totalAmount, platformFee, shippingFee, existing.rows[0].id]
          );
        } else {
          await pool.query(
            `INSERT INTO ecommerce_sales (company_id, period_id, platform_sales, platform_fees, shipping_fees) VALUES ($1,$2,$3,$4,$5)`,
            [company_id, period_id, totalAmount, platformFee, shippingFee]
          );
        }

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
