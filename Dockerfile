# ===== Stage 1: 构建前端 =====
FROM node:24-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ===== Stage 2: 生产运行 =====
FROM node:24-alpine
WORKDIR /app

# 复制后端
COPY server/package*.json ./server/
RUN cd server && npm install --production

COPY server/ ./server/

# 从前端构建阶段复制 dist
COPY --from=client-builder /app/client/dist /app/client/dist

# 创建持久化目录
RUN mkdir -p /app/server/invoices /app/server/wht-certificates /app/server/exports /app/server/audit-reports

WORKDIR /app/server
EXPOSE 3007

CMD ["node", "src/index.js"]
