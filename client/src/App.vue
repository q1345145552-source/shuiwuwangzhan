<template>
  <div id="app">
    <!-- 登录页：不显示外壳 -->
    <router-view v-if="isLoginPage" />
    <!-- 已登录：完整外壳 -->
    <el-container v-else style="height:100vh">
      <el-aside width="210px" style="background:#304156;overflow-y:auto;display:flex;flex-direction:column">
        <div class="logo">🏢 电商税务管理</div>
        <CompanySwitcher />
        <el-menu
          :default-active="currentRoute"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409eff"
          style="border-right:none;flex:1"
        >
          <el-menu-item index="/"><el-icon><HomeFilled /></el-icon> 首页</el-menu-item>
          <el-menu-item index="/companies"><el-icon><OfficeBuilding /></el-icon> 客户公司</el-menu-item>
          <el-menu-item index="/periods"><el-icon><Calendar /></el-icon> 会计期间</el-menu-item>
          <el-menu-item index="/ecommerce-sales"><el-icon><Sell /></el-icon> 电商销售录入</el-menu-item>
          <el-menu-item index="/platform-import"><el-icon><Upload /></el-icon> 平台导入</el-menu-item>
          <el-menu-item index="/platform-comparison"><el-icon><Monitor /></el-icon> 数据对比</el-menu-item>
          <el-menu-item index="/profit-loss"><el-icon><TrendCharts /></el-icon> 利润表</el-menu-item>
          <el-menu-item index="/vat-report"><el-icon><Document /></el-icon> VAT 申报</el-menu-item>
          <el-menu-item index="/vat-details"><el-icon><List /></el-icon> VAT 明细</el-menu-item>
          <el-menu-item index="/vat-compliance"><el-icon><WarningFilled /></el-icon> VAT 合规检测</el-menu-item>
          <el-menu-item index="/wht"><el-icon><Collection /></el-icon> 预扣税申报</el-menu-item>
          <el-menu-item index="/invoice-gen"><el-icon><Tickets /></el-icon> 发票生成</el-menu-item>
          <el-menu-item index="/bank"><el-icon><CreditCard /></el-icon> 银行流水</el-menu-item>
          <el-menu-item index="/expenses"><el-icon><Money /></el-icon> 费用管理</el-menu-item>
          <el-menu-item index="/exchange-rates"><el-icon><Coin /></el-icon> 汇率管理</el-menu-item>
          <el-menu-item index="/employees"><el-icon><User /></el-icon> 员工管理</el-menu-item>
          <el-menu-item index="/pnd1"><el-icon><List /></el-icon> PND.1 工资税</el-menu-item>
          <el-menu-item index="/cit"><el-icon><DataAnalysis /></el-icon> CIT 年度申报</el-menu-item>
          <el-menu-item index="/export-monthly"><el-icon><Download /></el-icon> 月度导出</el-menu-item>
          <el-menu-item index="/compliance"><el-icon><AlarmClock /></el-icon> 合规日历</el-menu-item>
          <el-menu-item index="/tax-relief"><el-icon><Umbrella /></el-icon> 补税方案</el-menu-item>
          <el-menu-item index="/audit-report"><el-icon><DocumentChecked /></el-icon> 稽查报告</el-menu-item>
          <el-menu-item index="/data-validator"><el-icon><CircleCheck /></el-icon> 数据校验</el-menu-item>
          <el-menu-item index="/audit-logs"><el-icon><Notebook /></el-icon> 操作日志</el-menu-item>
          <el-menu-item index="/backup"><el-icon><FolderOpened /></el-icon> 数据备份</el-menu-item>
        </el-menu>
        <div class="user-footer">
          <span class="user-name">{{ userDisplayName }}</span>
        </div>
      </el-aside>
      <el-container>
        <el-header style="background:#fff;border-bottom:1px solid #e4e7ed;display:flex;align-items:center;padding:0 20px">
          <h2 style="margin:0;font-size:18px;color:#303133">{{ pageTitle }}</h2>
          <div style="margin-left:auto;display:flex;align-items:center;gap:16px">
            <el-popover placement="bottom-end" :width="360" trigger="click">
              <template #reference>
                <el-badge :value="unreadCount" :hidden="unreadCount === 0" style="cursor:pointer">
                  <el-icon :size="20"><Bell /></el-icon>
                </el-badge>
              </template>
              <div v-if="alerts.length === 0" style="text-align:center;padding:20px;color:#999">暂无提醒</div>
              <div v-else class="notif-list">
                <div v-for="a in alerts" :key="a.type+a.company+a.tax_type" class="notif-row" :class="{ overdue: a.type==='overdue' }" @click="goToTax(a)">
                  <div class="notif-header">
                    <el-tag :type="a.type==='overdue' ? 'danger' : 'warning'" size="small">{{ a.tax_type }}</el-tag>
                    <span v-if="a.type==='deadline_soon'" style="color:#e6a23c;font-size:12px">剩 {{ a.due_in_days }} 天</span>
                    <span v-else style="color:#f56c6c;font-size:12px">逾期 {{ a.overdue_days }} 天</span>
                  </div>
                  <div class="notif-company">{{ a.company }}</div>
                </div>
              </div>
            </el-popover>
            <span style="color:#909399;font-size:13px">
              当前公司：<b style="color:#303133">{{ store.currentCompany?.name || '未选择' }}</b>
            </span>
          </div>
        </el-header>
        <el-main style="background:#f0f2f5"><router-view /></el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useCompanyStore } from './stores/currentCompany'
import { Bell } from '@element-plus/icons-vue'
import api from './api'
import CompanySwitcher from './components/CompanySwitcher.vue'

const route = useRoute()
const router = useRouter()
const store = useCompanyStore()

// 是否在登录页
const isLoginPage = computed(() => route.path === '/login')

const userDisplayName = computed(() => {
  try { return JSON.parse(localStorage.getItem('user'))?.name || '管理员' } catch { return '管理员' }
})

// ----- Notification bell -----
const alerts = ref([])
const unreadCount = ref(0)
let notifTimer = null

const fetchNotifications = async () => {
  try {
    const data = await api.get('/compliance/notifications')
    alerts.value = data.alerts || []
    unreadCount.value = data.unread_count || 0
  } catch (e) { /* ignore */ }
}

const taxRouteMap = {
  'VAT P.P.30': '/vat-report',
  'VAT 申报': '/vat-report',
  'vat': '/vat-report',
  'PND.53 法人预扣税': '/wht',
  'PND.54 境外预扣税': '/wht',
  'PND.1 工资预扣税': '/pnd1',
  'wht_pnd53': '/wht',
  'wht_pnd54': '/wht',
  'wht_pnd1': '/pnd1',
  'CIT PND.50 年度申报': '/cit',
  'CIT PND.51 半年预付': '/cit',
  'cit_pnd50': '/cit',
  'cit_pnd51': '/cit',
  '社保缴纳': '/employees',
  'social_security': '/employees',
}

const goToTax = (a) => {
  const target = taxRouteMap[a.tax_type]
  if (target) {
    router.push(target)
  }
}

onMounted(() => {
  fetchNotifications()
  notifTimer = setInterval(fetchNotifications, 30 * 60 * 1000) // every 30 min
})

onUnmounted(() => {
  if (notifTimer) clearInterval(notifTimer)
})

const currentRoute = computed(() => {
  const p = route.path
  if (p.startsWith('/companies')) return '/companies'
  return p
})

const pageTitle = computed(() => {
  const map = {
    '/': '首页', '/companies': '客户公司管理', '/periods': '会计期间管理',
    '/ecommerce-sales': '电商销售录入', '/profit-loss': '利润表',
    '/vat-report': 'VAT 申报', '/vat-details': 'VAT 明细管理',
    '/vat-compliance': 'VAT 合规检测', '/wht': '预扣税申报',
    '/invoice-gen': '发票生成', '/bank': '银行流水管理',
    '/expenses': '费用管理', '/cit': 'CIT 年度申报',
    '/export-monthly': '月度报表导出', '/compliance': '合规预警日历',
    '/tax-relief': '历史补税方案', '/platform-import': '平台CSV导入',
    '/platform-comparison': '数据对比看板', '/employees': '员工管理',
    '/pnd1': 'PND.1 工资预扣税', '/backup': '数据备份',
    '/audit-logs': '操作日志', '/exchange-rates': '汇率管理',
    '/audit-report': '稽查报告', '/data-validator': '数据校验'
  }
  const p = route.path
  if (p.startsWith('/companies/')) return '公司详情'
  return map[p] || '电商税务管理系统'
})

onMounted(() => { store.loadCompanies() })
</script>

<style>
body { margin: 0; font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Microsoft YaHei', sans-serif; }
.logo { color: #fff; font-size: 16px; font-weight: bold; padding: 16px 20px; border-bottom: 1px solid #4a5064; text-align: center; }
.user-footer { padding: 12px 16px; border-top: 1px solid #4a5064; }
.user-name { color: #bfcbd9; font-size: 13px; }
.notif-list { max-height: 350px; overflow-y: auto; }
.notif-row { padding: 10px 0; border-bottom: 1px solid #f0f0f0; cursor: pointer; }
.notif-row:last-child { border-bottom: none; }
.notif-row:hover { background: #f5f7fa; }
.notif-row.overdue { background: #fef0f0; }
.notif-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.notif-company { font-size: 13px; color: #303133; }
</style>
