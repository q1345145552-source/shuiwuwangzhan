import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'

const routes = [
  { path: '/login', name: 'Login', component: () => import('../views/Login.vue') },
  { path: '/', name: 'Home', component: () => import('../views/Home.vue') },
  { path: '/companies', name: 'Companies', component: () => import('../views/Companies.vue') },
  { path: '/companies/:id', name: 'CompanyDetail', component: () => import('../views/CompanyDetail.vue') },
  { path: '/periods', name: 'Periods', component: () => import('../views/Periods.vue') },
  { path: '/ecommerce-sales', name: 'EcommerceSales', component: () => import('../views/EcommerceSales.vue') },
  { path: '/profit-loss', name: 'ProfitLoss', component: () => import('../views/ProfitLoss.vue') },
  { path: '/vat-report', name: 'VatReport', component: () => import('../views/VatReport.vue') },
  { path: '/vat-details', name: 'VatDetails', component: () => import('../views/VatDetails.vue') },
  { path: '/vat-compliance', name: 'VatCompliance', component: () => import('../views/VatCompliance.vue') },
  { path: '/wht', name: 'WhtReport', component: () => import('../views/WhtReport.vue') },
  { path: '/invoice-gen', name: 'InvoiceGen', component: () => import('../views/InvoiceGen.vue') },
  { path: '/bank', name: 'BankTransactions', component: () => import('../views/BankTransactions.vue') },
  { path: '/expenses', name: 'Expenses', component: () => import('../views/Expenses.vue') },
  { path: '/cit', name: 'CitReport', component: () => import('../views/CitReport.vue') },
  { path: '/export-monthly', name: 'ExportMonthly', component: () => import('../views/ExportMonthly.vue') },
  { path: '/compliance', name: 'ComplianceDashboard', component: () => import('../views/ComplianceDashboard.vue') },
  { path: '/tax-relief', name: 'TaxReliefPlan', component: () => import('../views/TaxReliefPlan.vue') },
  { path: '/backup', name: 'BackupManage', component: () => import('../views/BackupManage.vue') },
  { path: '/platform-import', name: 'PlatformImport', component: () => import('../views/PlatformImport.vue') },
  { path: '/platform-comparison', name: 'PlatformComparison', component: () => import('../views/PlatformComparison.vue') },
  { path: '/exchange-rates', name: 'ExchangeRates', component: () => import('../views/ExchangeRates.vue') },
  { path: '/audit-report', name: 'AuditReport', component: () => import('../views/AuditReport.vue') },
  { path: '/employees', name: 'Employees', component: () => import('../views/Employees.vue') },
  { path: '/pnd1', name: 'Pnd1Report', component: () => import('../views/Pnd1Report.vue') },
  { path: '/audit-logs', name: 'AuditLogs', component: () => import('../views/AuditLogs.vue') },
  { path: '/data-validator', name: 'DataValidator', component: () => import('../views/DataValidator.vue') },
]

const router = createRouter({ history: createWebHistory(), routes })

// 路由守卫：未登录 → 跳转登录页
router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')

  if (to.path === '/login') {
    // 已登录则直接进首页
    if (token) return next('/')
    return next()
  }

  if (!token) {
    ElMessage.warning('请先登录')
    return next('/login')
  }

  next()
})

export default router
