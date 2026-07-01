# 泰国税务管理系统 (Thai Tax System)

## 技术栈

- **前端**: Vue 3 + Element Plus + Vite
- **后端**: Node.js + Express
- **数据库**: PostgreSQL 18

## 项目结构

```
thai-tax-system/
├── server/          # 后端
│   ├── src/
│   │   ├── index.js
│   │   ├── db.js
│   │   └── routes/
│   ├── package.json
│   └── .env
├── client/          # 前端
│   ├── src/
│   │   ├── main.js
│   │   ├── App.vue
│   │   ├── router/
│   │   ├── views/
│   │   └── api/
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## 快速开始

### 1. 数据库

```bash
createdb thai_tax_db
psql -d thai_tax_db -f server/sql/init.sql
```

### 2. 后端

```bash
cd server
npm install
npm run dev
# 服务启动在 http://localhost:3001
```

### 3. 前端

```bash
cd client
npm install
npm run dev
# 服务启动在 http://localhost:3000
```

## 验证

- 后端健康检查: http://localhost:3001/api/health → `{"status":"ok"}`
- 前端页面: http://localhost:3000
