# Bug 清单（代码审查产出，2026-07-04）

按优先级排列。P0 = 页面崩溃/税务计算错误/安全漏洞，必须先修；P1 = 功能性缺陷；P2 = 代码质量/健壮性。

## P0 — 立即修复

### 前端（点击即崩溃）

| # | 文件:行 | 问题 | 修复方向 |
|---|---|---|---|
| 1 | `client/src/views/VatReport.vue:83` | `useCompanyStore()` 未导入 | 加 `import { useCompanyStore } from '../stores/currentCompany'` 或直接删除未用的这行 |
| 2 | `client/src/views/VatDetails.vue:231` | 同上 | 同上 |
| 3 | `client/src/views/VatCompliance.vue:143` | 同上（该变量声明后从未使用） | 直接删除这行 |
| 4 | `client/src/views/Expenses.vue:172` | 同上 | 同上 |
| 5 | `client/src/views/WhtReport.vue:244` | `store.loadPeriods()` 中 `store` 未定义 | 补 store 导入，或改为调用本地 `fetchPeriods()` |
| 6 | `client/src/views/InvoiceGen.vue:158` | 同上 | 同上 |
| 7 | `client/src/views/ExportMonthly.vue:59` | 同上 | 同上 |
| 8 | `client/src/views/ComplianceDashboard.vue:196/208/217/226/235` | `const { data } = await api.xxx()` 解构，`api` 已在拦截器解包，`data` 恒为 `undefined` | 改为 `const data = await api.xxx()` |
| 9 | `client/src/views/ComplianceDashboard.vue` `onMounted` | 因上条 bug，`setInterval` 轮询 `undefined.length` 持续报错且定时器不清除 | 修完#8后加 `clearInterval` 收尾逻辑 |
| 10 | `client/src/views/TaxReliefPlan.vue:183/205/215` | 同 #8 解构问题，`generatePlan()` 结果恒为 undefined，"生成成功"但页面空白 | 同上改法 |
| 11 | `client/src/views/VatDetails.vue:326/337/344/355/359` | 变量名 `row` 应为 `r`（作用域内实际参数名是 `r`） | 统一改成 `r` |
| 12 | `client/src/views/VatDetails.vue:167` | 模板插槽变量叫 `row`，却调用 `toggleDeductible(r)` | 改成 `toggleDeductible(row)` |
| 13 | `client/src/views/VatReport.vue:154` | 导出Excel用了不存在的变量 `companyId`/`periodId` | 改成 `selectedCompanyId.value`/`selectedPeriodId.value` |
| 14 | `client/src/views/VatDetails.vue:392` | 同上 | 同上 |
| 15 | `client/src/views/Expenses.vue:281` | 同上（`companyId`/`periodId`/`ssPeriodId` 均不存在） | 核对实际变量名后改正 |
| 16 | `client/src/views/ExportMonthly.vue:86` | 同上 | 同上 |
| 17 | `client/src/App.vue:80,123-129` | `goToTax()` 用 `useRouter()` 但只导入了 `useRoute` | 加 `import { useRouter } from 'vue-router'` |
| 18 | `client/src/views/VatReport.vue:11-12`、`Expenses.vue:22-23`、`ExportMonthly.vue:28-31` | 按钮嵌套按钮（非法DOM），点内层会连带触发外层 | 把 Excel 导出按钮挪到外层按钮同级，不要嵌套 |

### 后端（安全漏洞 + 税务计算错误）

| # | 文件:行 | 问题 | 修复方向 |
|---|---|---|---|
| 19 | `server/src/index.js:44-47` | `/invoices`、`/wht-certificates`、`/exports` 静态目录挂载在鉴权中间件之前，文件名可猜测，无需登录即可下载任意客户财税文件 | 把这三个 `express.static` 挪到 `app.use(authMiddleware)` 之后，或改造成走鉴权的下载接口 |
| 20 | `server/src/routes/backup.js:59-68` | `/download/:filename` 无路径校验，可用 `../../` 读取服务器任意文件（含 `.env`） | 加 `const safe = path.basename(filename)`，校验后再拼路径 |
| 21 | `server/src/routes/compliance.js:156/163/171/180/189` | `getDueDate(taxType, year, month)` 只收3参，调用传了4个，导致VAT/PND.53/54/1/社保的到期日全部算错 | 改成 `getDueDate('vat', mon+1>11?yr+1:yr, (mon+1)%12)`（去掉多余参数） |
| 22 | `server/src/routes/cit.js:85-96` | 查了公司资料却没用来判断SME资格，所有公司无条件套用小微企业累进税率 | 用 `comp` 查询结果校验实缴资本/收入是否满足SME门槛，不满足则按20%单一税率 |
| 23 | `server/src/routes/cit.js:136-172` | INSERT + DELETE + INSERT 三次独立SQL无事务包裹，中途崩溃会丢数据 | 用 `BEGIN/COMMIT` 事务包裹，删掉多余的第一次 INSERT |
| 24 | `server/src/middleware/period-lock.js` + `vat-details.js`/`bank.js` 多处 | 期间锁定后仍可删改销项/进项明细、银行流水匹配（锁检查依赖 `period_id` 参数，但这些路由传的是记录 `id`） | 路由内先查记录所属 `period_id` 再做锁校验 |
| 25 | `server/src/middleware/period-lock.js:13-16` | 锁检查数据库异常时 `next()` 直接放行（失败开放） | 改为失败时拒绝请求并返回错误 |
| 26 | `server/src/routes/invoice-gen.js:43-50` | 发票号用 `COUNT+1` 生成，并发请求会产生重复发票号 | 改用数据库 SEQUENCE 或唯一约束+重试 |
| 27 | `server/src/routes/auth.js:14-15` | `AUTH_PASSWORD` 未设置时静默回退到硬编码弱密码 `thai2026` | 启动时校验环境变量必须设置，缺失则拒绝启动；同时给登录接口加限流 |

## P1 — 应尽快修复

| # | 位置 | 问题 |
|---|---|---|
| 28 | `server/src/routes/compliance.js:8-27` | 滞纳金按月复利计算，应为泰国法定单利，且无上限封顶 |
| 29 | `server/src/routes/financials.js`、`export.js` | `Math.max(0, cash)` 把亏损/负现金强制归零，掩盖真实亏损 |
| 30 | `server/src/routes/export.js:249,270` | 导出PDF一旦生成就永久缓存，源数据更新后不会重新生成 |
| 31 | `server/src/routes/wht.js:14-22` | 预扣税率表（利息10%、特许权使用费15%）与常见参考值（1%/3%）出入较大，需人工核实 |
| 32 | `server/src/routes/employees.js:266-267` | PND.1年化按"月薪×12"简单处理，未考虑员工年中入离职 |
| 33 | 全项目 | 认证后无基于 `company_id` 的越权校验，任意登录用户可访问所有公司数据 |
| 34 | `server/src/routes/wht.js`/`expenses.js`/`vat-details.js`/`bank.js`/`ecommerce.js` | 引入了 `logAudit` 但从未调用，关键操作无审计记录 |
| 35 | `client/src/stores/currentCompany.js` | 全局公司状态形同虚设，20+页面各自独立维护公司选择，切换靠整页刷新 |
| 36 | `EcommerceSales.vue`/`ProfitLoss.vue`/`VatReport.vue` 等 | 公司/期间切换存在竞态，旧请求可能覆盖新选择的数据，无取消机制 |
| 37 | `client/src/views/AuditReport.vue:4` | 公司选择框缺 `@change`，切换公司历史报告不刷新 |
| 38 | `client/src/views/BackupManage.vue:103-109` | "删除备份"按钮是假的，只弹提示不执行 |
| 39 | 多处 `catch(e) {}` | 静默吞错（`Companies.vue:212` 等），失败时用户无提示 |
| 40 | `server/src/routes/platform-import.js:170` | 批量导入无事务，注释写"部分成功OK" |
| 41 | `server/src/routes/exchange.js:161-236` | 批量覆盖全公司全年汇率，无二次确认 |
| 42 | `server/src/db.js:12-15` | 连接池空闲报错直接 `process.exit(-1)`，小故障拖垮整个服务 |

## P2 — 可排期优化

- `vat-details.js`/`bank.js` 手写CSV解析不支持带逗号引号字段，`platform-import.js` 已用 `papaparse`，应统一
- VAT税率 `0.07` 作为魔法数字散落在8+个文件
- `financials.js`/`export.js`/`data-validator.js` 三处重复实现利润表/VAT计算逻辑
- `server/scripts/populate.js` 硬编码了开发者本机绝对路径
- 缺少 `helmet`、限流、请求体大小限制；JWT验证未显式限定算法
- 前端20+页面重复实现"拉取公司列表"逻辑，应抽成 composable
- `Accounts.vue` 是死代码（无路由引用），`HelloWorld.vue` 是未清理的脚手架文件
- 中英文/emoji混排无国际化方案
