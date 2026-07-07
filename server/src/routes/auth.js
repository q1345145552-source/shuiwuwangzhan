const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');


// Simple in-memory rate limiter for login
const loginAttempts = new Map();

function checkLoginRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 10;
  
  const record = loginAttempts.get(ip);
  if (record && (now - record.firstAttempt) < windowMs) {
    if (record.count >= maxAttempts) {
      return res.status(429).json({ error: '登录尝试次数过多，请15分钟后重试' });
    }
    record.count++;
  } else {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
  }
  next();
}

// POST /api/auth/login
router.post('/login', checkLoginRateLimit, async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    // 从数据库查询用户
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true', [username]
    );
    if (!result.rows.length) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const user = result.rows[0];

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.display_name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.display_name, role: user.role }
    });
  } catch (e) { next(e); }
});

// GET /api/auth/verify - 验证 token
router.get('/verify', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: '未登录' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    res.json({ valid: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ error: '登录已过期' });
  }
});

module.exports = router;
