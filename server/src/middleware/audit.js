const { pool } = require('../db');

function logAudit({ company_id, user_name, action, entity_type, entity_id, description, old_value, new_value, req }) {
  const ip = (req && req.headers && (req.headers['x-forwarded-for'] || req.connection?.remoteAddress)) || 'local';
  
  // 优先级: 显式传入 user_name > JWT用户名 > '系统'
  let name = user_name;
  if (!name && req && req.user) {
    name = req.user.username || req.user.name || '管理员';
  }
  if (!name) name = '系统';

  const query = `
    INSERT INTO audit_logs (company_id, user_name, action, entity_type, entity_id, description, old_value, new_value, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)`;
  
  pool.query(query, [
    company_id || null, name, action, entity_type, entity_id || null, description || '',
    old_value ? JSON.stringify(old_value) : null,
    new_value ? JSON.stringify(new_value) : null,
    ip
  ]).catch(err => console.error('Audit log error:', err.message));
}

module.exports = { logAudit };
