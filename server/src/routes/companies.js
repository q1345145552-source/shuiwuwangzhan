const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { validate, companySchema } = require('../middleware/validator');
const { logAudit } = require('../middleware/audit');


const ALL_COMPANY_FIELDS = 'code, name, tax_id, vat_number, vat_registered, address, director, contacts, accounting_start, contact_person, phone, wechat, email, address_th, address_en, business_type, platforms, tags, logo_url, service_start_date, monthly_service_fee, last_contact_date, notes';

const COMPANY_VALUES = '$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23';

router.get('/', async (req, res, next) => {
  try { const r = await pool.query('SELECT * FROM companies ORDER BY id DESC'); res.json(r.rows); }
  catch(e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM companies WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: '公司不存在' });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.post('/', validate(companySchema), async (req, res, next) => {
  try {
    const { code, name, tax_id, vat_number, vat_registered, address, director, contacts, accounting_start,
            contact_person, phone, wechat, email, address_th, address_en, business_type, platforms, tags,
            logo_url, service_start_date, monthly_service_fee, last_contact_date, notes } = req.body;
    if (!code || !name) return res.status(400).json({ error: '公司编号和名称为必填项' });
    const exists = await pool.query('SELECT id FROM companies WHERE code=$1', [code]);
    if (exists.rows.length) return res.status(409).json({ error: '公司编号已存在' });

    const safeContacts = (typeof contacts === 'string' && contacts.trim() !== '') ? contacts : null;
    const r = await pool.query(
      `INSERT INTO companies (${ALL_COMPANY_FIELDS}) VALUES (${COMPANY_VALUES}) RETURNING *`,
      [code, name, tax_id, vat_number, vat_registered||false, address, director, safeContacts, accounting_start||'2025-01-01',
       contact_person, phone, wechat, email, address_th, address_en, business_type, platforms, tags,
       logo_url, service_start_date, monthly_service_fee?parseFloat(monthly_service_fee):null, last_contact_date, notes]
    );
    logAudit({ company_id: r.rows[0].id, action: 'create', entity_type: 'company', entity_id: r.rows[0].id, description: `新增客户公司：${name}`, new_value: { code, name, tax_id }, req });
    res.status(201).json(r.rows[0]);
  } catch(e) { next(e); }
});

router.put('/:id', validate(companySchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, name, tax_id, vat_number, vat_registered, address, director, contacts, accounting_start,
            contact_person, phone, wechat, email, address_th, address_en, business_type, platforms, tags,
            logo_url, service_start_date, monthly_service_fee, last_contact_date, notes } = req.body;
    if (!code || !name) return res.status(400).json({ error: '公司编号和名称为必填项' });

    const oldCompany = await pool.query('SELECT code,name,tax_id FROM companies WHERE id=$1', [id]);
    const exists = await pool.query('SELECT id FROM companies WHERE code=$1 AND id!=$2', [code, id]);
    if (exists.rows.length) return res.status(409).json({ error: '公司编号已存在' });

    const safeContacts = (typeof contacts === 'string' && contacts.trim() !== '') ? contacts : null;
    const r = await pool.query(
      `UPDATE companies SET code=$1,name=$2,tax_id=$3,vat_number=$4,vat_registered=$5,address=$6,director=$7,contacts=$8,accounting_start=$9,contact_person=$10,phone=$11,wechat=$12,email=$13,address_th=$14,address_en=$15,business_type=$16,platforms=$17,tags=$18,logo_url=$19,service_start_date=$20,monthly_service_fee=$21,last_contact_date=$22,notes=$23,updated_at=NOW() WHERE id=$24 RETURNING *`,
      [code,name,tax_id,vat_number,vat_registered||false,address,director,safeContacts,accounting_start,contact_person,phone,wechat,email,address_th,address_en,business_type,platforms,tags,logo_url,service_start_date,monthly_service_fee?parseFloat(monthly_service_fee):null,last_contact_date,notes,id]
    );
    if (!r.rows.length) return res.status(404).json({ error: '公司不存在' });
    logAudit({ company_id: parseInt(id), action: 'update', entity_type: 'company', entity_id: parseInt(id), description: `编辑客户公司：${name}`, old_value: oldCompany.rows[0]||{}, new_value:{code,name,tax_id}, req });
    res.json(r.rows[0]);
  } catch(e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const r = await pool.query('DELETE FROM companies WHERE id=$1 RETURNING *', [id]);
    if (!r.rows.length) return res.status(404).json({ error: '公司不存在' });
    logAudit({ company_id: null, action: 'delete', entity_type: 'company', entity_id: parseInt(id), description: `删除客户公司：${r.rows[0].name}`, old_value: r.rows[0], req });
    res.json({ message: '删除成功', deleted: r.rows[0] });
  } catch(e) { next(e); }
});


module.exports = router;
