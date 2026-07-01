const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logAudit } = require('../middleware/audit');

const r4 = n => Math.round((parseFloat(n) || 0) * 10000) / 10000;

// GET /api/exchange/rates?company_id=xx&year=2025
router.get('/rates', async (req, res, next) => {
  try {
    const { company_id, year } = req.query;
    if (!company_id || !year) return res.status(400).json({ error: '缺少参数' });
    const result = await pool.query(
      'SELECT * FROM exchange_rates WHERE company_id=$1 AND year=$2 ORDER BY month',
      [company_id, year]
    );
    // Fill empty months with null
    const rates = {};
    result.rows.forEach(r => { rates[r.month] = r; });
    const items = [];
    for (let m = 1; m <= 12; m++) {
      items.push(rates[m] || { company_id: parseInt(company_id), month: m, year: parseInt(year), rate_thb_cny: null, rate_cny_thb: null });
    }
    res.json({ items, year: parseInt(year) });
  } catch (e) { next(e); }
});

// GET /api/exchange/latest?company_id=xx — 获取最新汇率（当前月）
router.get('/latest', async (req, res, next) => {
  try {
    const { company_id, month, year } = req.query;
    const m = parseInt(month) || new Date().getMonth() + 1;
    const y = parseInt(year) || new Date().getFullYear();
    const result = await pool.query(
      'SELECT * FROM exchange_rates WHERE company_id=$1 AND year=$2 AND month=$3',
      [company_id, y, m]
    );
    res.json(result.rows[0] || { rate_thb_cny: 4.5000, rate_cny_thb: 0.2222, month: m, year: y });
  } catch (e) { next(e); }
});

// POST /api/exchange/rates — 保存或更新
router.post('/rates', async (req, res, next) => {
  try {
    const { company_id, month, year, rate_thb_cny, source, notes } = req.body;
    if (!company_id || !month || !year || !rate_thb_cny)
      return res.status(400).json({ error: '必填项：公司、月、年、汇率' });

    const rateCnyThb = r4(1 / parseFloat(rate_thb_cny));
    const result = await pool.query(
      `INSERT INTO exchange_rates (company_id, month, year, rate_thb_cny, rate_cny_thb, source, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (company_id, year, month) DO UPDATE SET
         rate_thb_cny=EXCLUDED.rate_thb_cny, rate_cny_thb=EXCLUDED.rate_cny_thb,
         source=EXCLUDED.source, notes=EXCLUDED.notes
       RETURNING *`,
      [company_id, month, year, parseFloat(rate_thb_cny), rateCnyThb, source || 'manual', notes]
    );
    logAudit({ company_id, action: 'create', entity_type: 'exchange_rate',
      description: `汇率: ${year}/${month} 1CNY=${rate_thb_cny}THB`, req });
    res.json(result.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/exchange/rates/batch — 批量填充
router.post('/rates/batch', async (req, res, next) => {
  try {
    const { company_id, year, rate_thb_cny, source } = req.body;
    if (!company_id || !year || !rate_thb_cny)
      return res.status(400).json({ error: '缺少参数' });

    const rateCnyThb = r4(1 / parseFloat(rate_thb_cny));
    const inserted = [];
    for (let m = 1; m <= 12; m++) {
      const result = await pool.query(
        `INSERT INTO exchange_rates (company_id, month, year, rate_thb_cny, rate_cny_thb, source)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (company_id, year, month) DO UPDATE SET
           rate_thb_cny=EXCLUDED.rate_thb_cny, rate_cny_thb=EXCLUDED.rate_cny_thb, source=EXCLUDED.source
         RETURNING *`,
        [company_id, m, year, parseFloat(rate_thb_cny), rateCnyThb, source || 'manual']
      );
      inserted.push(result.rows[0]);
    }
    logAudit({ company_id, action: 'create', entity_type: 'exchange_rate',
      description: `批量汇率: ${year}全年 1CNY=${rate_thb_cny}THB`, req });
    res.json({ inserted: inserted.length, items: inserted });
  } catch (e) { next(e); }
});

// DELETE /api/exchange/rates/:id
router.delete('/rates/:id', async (req, res, next) => {
  try {
    const del = await pool.query('DELETE FROM exchange_rates WHERE id=$1 RETURNING *', [req.params.id]);
    if (!del.rows.length) return res.status(404).json({ error: '记录不存在' });
    res.json({ message: '已删除', deleted: del.rows[0] });
  } catch (e) { next(e); }
});

// GET /api/exchange/convert — 汇率换算
router.get('/convert', async (req, res, next) => {
  try {
    const { amount, from, to, rate } = req.query;
    const amt = parseFloat(amount) || 0;
    let r = parseFloat(rate);
    if (!r) r = 4.5000; // default

    const result = from === 'cny' ? r4(amt * r) : r4(amt / r);
    res.json({ amount: amt, from, to, rate: r, result });
  } catch (e) { next(e); }
});

module.exports = router;

// POST /api/exchange/copy-to-companies - 单条SQL批量复制
router.post('/copy-to-companies', async (req, res, next) => {
  try {
    const { source_company_id, target_company_ids, year } = req.body;
    if (!source_company_id || !target_company_ids || !target_company_ids.length || !year) {
      return res.status(400).json({ error: '缺少参数: source_company_id, target_company_ids, year' });
    }

    const sourceRates = await pool.query(
      'SELECT * FROM exchange_rates WHERE company_id = $1 AND year = $2',
      [source_company_id, year]
    );
    if (sourceRates.rows.length === 0) {
      return res.status(404).json({ error: '源公司该年份无汇率数据' });
    }

    // Build single bulk INSERT
    const values = [];
    const params = [];
    let i = 1;
    for (const targetId of target_company_ids) {
      for (const r of sourceRates.rows) {
        values.push(`($${i},$${i+1},$${i+2},$${i+3},$${i+4},'copied')`);
        params.push(targetId, r.month, year, r.rate_thb_cny, r.rate_cny_thb);
        i += 5;
      }
    }

    await pool.query(
      `INSERT INTO exchange_rates (company_id, month, year, rate_thb_cny, rate_cny_thb, source)
       VALUES ${values.join(',')}
       ON CONFLICT (company_id, year, month) DO UPDATE SET
         rate_thb_cny = EXCLUDED.rate_thb_cny,
         rate_cny_thb = EXCLUDED.rate_cny_thb,
         source = EXCLUDED.source`,
      params
    );

    const copied = values.length;
    logAudit({ company_id: source_company_id, action: 'copy', entity_type: 'exchange_rate',
      description: `汇率复制: ${year}年 → ${target_company_ids.length}家公司`, req });
    res.json({ message: `成功复制 ${copied} 条汇率到 ${target_company_ids.length} 家公司`, copied, companies: target_company_ids.length });
  } catch (err) { next(err); }
});

// POST /api/exchange/batch-copy-all - 批量填充所有公司汇率（单条SQL, 无N+1）
router.post('/batch-copy-all', async (req, res, next) => {
  try {
    const { year, rate, override_existing } = req.body;
    if (!year || !rate) {
      return res.status(400).json({ error: '缺少参数: year, rate' });
    }

    const rateVal = parseFloat(rate);
    if (isNaN(rateVal) || rateVal <= 0) {
      return res.status(400).json({ error: '汇率必须大于0' });
    }

    const rateCnyThb = Math.round((1 / rateVal) * 10000) / 10000;
    const companies = await pool.query('SELECT id, name FROM companies ORDER BY id');
    const companyCount = companies.rows.length;

    if (override_existing) {
      // Single bulk INSERT with ON CONFLICT UPDATE
      const values = [];
      const params = [];
      let i = 1;
      for (const comp of companies.rows) {
        for (let m = 1; m <= 12; m++) {
          values.push(`($${i},$${i+1},$${i+2},$${i+3},$${i+4},'batch')`);
          params.push(comp.id, m, year, rateVal, rateCnyThb);
          i += 5;
        }
      }
      await pool.query(
        `INSERT INTO exchange_rates (company_id, month, year, rate_thb_cny, rate_cny_thb, source)
         VALUES ${values.join(',')}
         ON CONFLICT (company_id, year, month) DO UPDATE SET
           rate_thb_cny = EXCLUDED.rate_thb_cny,
           rate_cny_thb = EXCLUDED.rate_cny_thb,
           source = EXCLUDED.source`,
        params
      );
      const filled = companyCount * 12;
      logAudit({ action: 'batch', entity_type: 'exchange_rate',
        description: `批量汇率: ${year}年 ${rateVal} → ${companyCount}家公司 (填充${filled}条)`, req });
      res.json({ message: `完成: 填充 ${filled} 条`, filled, skipped: 0, companies: companyCount });
    } else {
      // Only fill empty: get all existing in one query
      const existing = await pool.query(
        'SELECT company_id, month FROM exchange_rates WHERE year = $1',
        [year]
      );
      const existingSet = new Set(existing.rows.map(r => `${r.company_id}-${r.month}`));

      const values = [];
      const params = [];
      let i = 1;
      for (const comp of companies.rows) {
        for (let m = 1; m <= 12; m++) {
          if (!existingSet.has(`${comp.id}-${m}`)) {
            values.push(`($${i},$${i+1},$${i+2},$${i+3},$${i+4},'batch')`);
            params.push(comp.id, m, year, rateVal, rateCnyThb);
            i += 5;
          }
        }
      }
      const filled = values.length;
      if (filled > 0) {
        await pool.query(
          `INSERT INTO exchange_rates (company_id, month, year, rate_thb_cny, rate_cny_thb, source)
           VALUES ${values.join(',')}`,
          params
        );
      }
      const skipped = companyCount * 12 - filled;
      logAudit({ action: 'batch', entity_type: 'exchange_rate',
        description: `批量汇率: ${year}年 ${rateVal} → ${companyCount}家公司 (填充${filled}条, 跳过${skipped}条)`, req });
      res.json({ message: `完成: 填充 ${filled} 条, 跳过 ${skipped} 条 (已有数据)`, filled, skipped, companies: companyCount });
    }
  } catch (err) { next(err); }
});
