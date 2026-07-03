const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const authMiddleware = require('./middleware/auth');

const authRouter = require('./routes/auth');
const companiesRouter = require('./routes/companies');
const accountsRouter = require('./routes/accounts');
const periodsRouter = require('./routes/periods');
const financialsRouter = require('./routes/financials');
const invoiceGenRouter = require('./routes/invoice-gen');
const bankRouter = require('./routes/bank');
const whtRouter = require('./routes/wht');
const ecommerceRouter = require('./routes/ecommerce');
const vatDetailsRouter = require('./routes/vat-details');
const exportRouter = require('./routes/export');
const expensesRouter = require('./routes/expenses');
const citRouter = require('./routes/cit');
const complianceRouter = require('./routes/compliance');
const employeesRouter = require('./routes/employees');
const platformImportRouter = require('./routes/platform-import');
const exchangeRouter = require('./routes/exchange');
const dashboardRouter = require('./routes/dashboard');
const auditReportRouter = require('./routes/audit-report');
const backupRouter = require('./routes/backup');
const auditLogRouter = require('./routes/audit');
const dataValidatorRouter = require('./routes/data-validator');

const app = express();
const PORT = process.env.PORT || 3007;

// CORS: 从环境变量读取，支持逗号分隔多个域名
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:5173')
  .split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            return callback(new Error('CORS 不允许的来源: ' + origin), false);
        }
        return callback(null, true);
    },
    credentials: true
}));

app.use(express.json());

// 健康检查 & 登录（不走 JWT）
app.get('/api/health', (req, res) => { res.json({ status: 'ok' }); });
app.use('/api/auth', authRouter);

// ===== 前端静态文件（无需鉴权）=====
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  console.log('📦 生产模式：托管前端静态文件 ' + clientDist);
  app.use(express.static(clientDist));
  // SPA fallback — 非 /api 请求返回 index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// ===== JWT 认证中间件 =====
app.use(authMiddleware);

// 静态资源（需登录鉴权）
app.use('/invoices', express.static(path.join(__dirname, '..', 'invoices')));
app.use('/wht-certificates', express.static(path.join(__dirname, '..', 'wht-certificates')));
app.use('/exports', express.static(path.join(__dirname, '..', 'exports')));
app.use('/audit-reports', express.static(path.join(__dirname, '..', 'audit-reports')));

// API 路由
app.use('/api/companies', companiesRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/periods', periodsRouter);
app.use('/api', financialsRouter);
app.use('/api', invoiceGenRouter);
app.use('/api/bank', bankRouter);
app.use('/api/wht', whtRouter);
app.use('/api/ecommerce', ecommerceRouter);
app.use('/api/vat-details', vatDetailsRouter);
app.use('/api/export', exportRouter);
app.use('/api/expenses', expensesRouter);
app.use('/api/cit', citRouter);
app.use('/api/compliance', complianceRouter);
app.use('/api', employeesRouter);
app.use('/api/platform-import', platformImportRouter);
app.use('/api/exchange', exchangeRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/audit-report', auditReportRouter);
app.use('/api/backup', backupRouter);
app.use('/api/audit', auditLogRouter);
app.use('/api/data-validator', dataValidatorRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
