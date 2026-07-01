const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  if (process.env.SKIP_AUTH === "true") return next();
  // 跳过登录接口和健康检查
  if (req.path === '/api/auth/login' || req.path === '/api/health') {
    return next();
  }

  // 跳过静态资源
  if (req.path.startsWith('/invoices') || req.path.startsWith('/wht-certificates') || req.path.startsWith('/exports')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ error: '无效的登录凭证' });
  }
};

module.exports = authMiddleware;
