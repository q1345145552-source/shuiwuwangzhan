const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    const validUsername = process.env.AUTH_USERNAME || 'admin';
    const validPassword = process.env.AUTH_PASSWORD;
    if (!validPassword) {
      console.error('❌ 错误：.env 中未配置 AUTH_PASSWORD，系统无法处理登录');
      return res.status(500).json({ error: '服务器配置错误' });
    }

    if (username !== validUsername) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 密码支持明文和 bcrypt 两种
    let passwordMatch = false;
    if (validPassword.startsWith('$2a$') || validPassword.startsWith('$2b$')) {
      passwordMatch = await bcrypt.compare(password, validPassword);
    } else {
      passwordMatch = password === validPassword;
    }

    if (!passwordMatch) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';
    const token = jwt.sign(
      { username, name: '管理员' },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    res.json({
      token,
      user: { username, name: '管理员' }
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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (err) {
    return res.status(401).json({ error: '登录已过期' });
  }
});

module.exports = router;
