<template>
  <div class="page">
    <div class="page-header">
      
      <el-select v-model="companyId" placeholder="选择客户公司" @change="loadAll" style="width:240px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="viewYear" @change="loadCalendar" style="width:120px;margin-left:12px">
        <el-option v-for="y in yearOptions" :key="y" :label="String(y)" :value="y" />
      </el-select>
      <el-button type="primary" @click="generateCalendar" :loading="genLoading" style="margin-left:12px">生成日历</el-button>
    </div>

    <!-- 预警概览卡片 -->
    <el-row :gutter="16" style="margin-bottom:20px">
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num upcoming">{{ upcomingCount }}</div>
          <div class="stat-label">未来30天到期</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num overdue">{{ overdueCount }}</div>
          <div class="stat-label">已逾期</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num pending">{{ pendingThisMonth }}</div>
          <div class="stat-label">本月待办</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 未来30天到期 -->
    <el-card style="margin-bottom:20px">
      <template #header><span>📅 未来30天到期事项</span></template>
      <el-table :data="upcomingItems" empty-text="暂无近期到期事项">
        <el-table-column prop="due_date" label="截止日" width="120" sortable />
        <el-table-column prop="tax_name" label="申报类型" width="180" />
        <el-table-column label="剩余天数" width="120">
          <template #default="{ row }">
            <el-tag :type="row.days_left <= 3 ? 'danger' : row.days_left <= 7 ? 'warning' : ''">
              {{ row.days_left }} 天
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="period_year" label="期间" width="120">
          <template #default="{ row }">
            {{ row.period_year }}{{ row.period_month ? '/' + row.period_month : '' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="markSubmitted(row)">去申报</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 已逾期 -->
    <el-card style="margin-bottom:20px" v-if="overdueItems.length">
      <template #header><span style="color:#f56c6c">🔴 已逾期申报事项</span></template>
      <el-table :data="overdueItems">
        <el-table-column prop="due_date" label="截止日" width="120" />
        <el-table-column prop="tax_name" label="申报类型" width="180" />
        <el-table-column label="逾期天数" width="120">
          <template #default="{ row }">
            <el-tag type="danger">{{ row.overdue_days }} 天</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="period_year" label="期间" width="120">
          <template #default="{ row }">
            {{ row.period_year }}{{ row.period_month ? '/' + row.period_month : '' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button size="small" type="success" @click="markSubmitted(row)">标记已申报</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 全年日历 -->
    <el-card>
      <template #header><span>🗓️ {{ viewYear }} 年税务日历</span></template>
      <div class="calendar-grid">
        <template v-for="m in 12" :key="m">
          <div class="calendar-month">
            <div class="month-header">{{ m }}月</div>
            <div class="month-items">
              <div v-for="item in getMonthItems(m)" :key="item.id"
                   :class="['cal-item', item.status === 'submitted' ? 'done' : isOverdue(item) ? 'overdue' : 'pending']">
                <span class="cal-dot">{{ item.status === 'submitted' ? '✅' : isOverdue(item) ? '🔴' : '⏳' }}</span>
                <span class="cal-name">{{ item.tax_name }}</span>
                <span class="cal-date">{{ formatDate(item.due_date) }}</span>
              </div>
              <div v-if="!getMonthItems(m).length" class="cal-empty">—</div>
            </div>
          </div>
        </template>
      </div>
    </el-card>

    <!-- 合规设置 -->
    <el-card style="margin-top:20px">
      <template #header>
        <span @click="showSettings = !showSettings" style="cursor:pointer;user-select:none">
          ⚙️ 合规设置 {{ showSettings ? '▲' : '▼' }}
        </span>
      </template>
      <el-form v-if="showSettings" :model="settings" label-width="180px" style="max-width:500px">
        <el-form-item label="VAT 已注册">
          <el-switch v-model="settings.vat_registered" />
        </el-form-item>
        <el-form-item label="有员工（需缴社保）">
          <el-switch v-model="settings.has_employees" />
        </el-form-item>
        <el-form-item label="有租金支出">
          <el-switch v-model="settings.has_rental_expense" />
        </el-form-item>
        <el-form-item label="有境外付款">
          <el-switch v-model="settings.has_foreign_payment" />
        </el-form-item>
        <el-form-item label="VAT门槛预警">
          <el-switch v-model="settings.vat_threshold_alert" />
        </el-form-item>
        <el-form-item label="提前提醒天数">
          <el-input-number v-model="settings.reminder_days" :min="1" :max="30" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="saveSettings" :loading="saveLoading">保存设置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'



const companyId = ref(null)
const companies = ref([])
const viewYear = ref(new Date().getFullYear())
const yearOptions = computed(() => {
  const cy = new Date().getFullYear()
  return [cy - 1, cy, cy + 1]
})

const upcomingItems = ref([])
const overdueItems = ref([])
const calendarItems = ref([])
const genLoading = ref(false)
const showSettings = ref(false)
const saveLoading = ref(false)

const settings = ref({
  vat_registered: false,
  has_employees: false,
  has_rental_expense: false,
  has_foreign_payment: false,
  vat_threshold_alert: true,
  reminder_days: 3
})

const upcomingCount = computed(() => upcomingItems.value.length)
const overdueCount = computed(() => overdueItems.value.length)
const pendingThisMonth = computed(() => {
  const now = new Date()
  return calendarItems.value.filter(i =>
    i.status === 'pending' &&
    i.period_year === now.getFullYear() &&
    i.period_month === now.getMonth() + 1
  ).length
})

function isOverdue(item) {
  return item.status === 'pending' && new Date(item.due_date) < new Date()
}
function formatDate(d) { return d ? d.slice(5) : '' }

function getMonthItems(m) {
  return calendarItems.value.filter(i => {
    const dd = new Date(i.due_date)
    return dd.getMonth() + 1 === m
  })
}

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = data
}

async function loadAll() {
  if (!companyId.value) return
  await Promise.all([loadCalendar(), loadUpcoming(), loadOverdue(), loadSettings()])
}

async function loadCalendar() {
  if (!companyId.value) return
  try {
    const data = await api.get('/compliance/calendar', {
      params: { company_id: companyId.value, year: viewYear.value }
    })
    calendarItems.value = data.items || []
  } catch (e) { /* noop */ }
}

async function loadUpcoming() {
  try {
    const data = await api.get('/compliance/upcoming', {
      params: { company_id: companyId.value, days: 30 }
    })
    upcomingItems.value = data.items || []
  } catch (e) { /* noop */ }
}

async function loadOverdue() {
  try {
    const data = await api.get('/compliance/overdue', {
      params: { company_id: companyId.value }
    })
    overdueItems.value = data.items || []
  } catch (e) { /* noop */ }
}

async function loadSettings() {
  try {
    const data = await api.get('/compliance/settings', {
      params: { company_id: companyId.value }
    })
    if (data) Object.assign(settings.value, data)
  } catch (e) { /* noop */ }
}

async function generateCalendar() {
  genLoading.value = true
  try {
    await api.post('/compliance/calendar/generate', {
      company_id: companyId.value,
      start_year: viewYear.value
    })
    ElMessage.success('日历已生成')
    await loadAll()
  } catch (e) {
    ElMessage.error('生成失败: ' + (e.response?.data?.error || e.message))
  } finally { genLoading.value = false }
}

async function markSubmitted(item) {
  try {
    await ElMessageBox.confirm(`确认已将 "${item.tax_name}" 标记为已申报？`, '确认', { type: 'info' })
    await api.post('/compliance/calendar/update-status', {
      calendar_id: item.id,
      status: 'submitted',
      submitted_date: new Date().toISOString().slice(0, 10)
    })
    ElMessage.success('已标记')
    await loadAll()
  } catch (e) { /* cancelled */ }
}

async function saveSettings() {
  saveLoading.value = true
  try {
    await api.post('/compliance/settings', {
      company_id: companyId.value,
      ...settings.value
    })
    ElMessage.success('设置已保存')
  } catch (e) {
    ElMessage.error('保存失败')
  } finally { saveLoading.value = false }
}

onMounted(() => {
  loadCompanies()
  // 默认选第一个
  const timer = setInterval(() => {
    if (companies.value.length) {
      companyId.value = companies.value[0].id
      loadAll()
      clearInterval(timer)
    }
  }, 300)
})
</script>

<style scoped>
.page { padding: 8px; }
.page-header { display:flex; align-items:center; margin-bottom:20px; gap:8px; }
.page-header h2 { margin:0 16px 0 0; }
.stat-card { text-align:center; }
.stat-num { font-size:36px; font-weight:bold; }
.stat-num.upcoming { color:#e6a23c; }
.stat-num.overdue { color:#f56c6c; }
.stat-num.pending { color:#409eff; }
.stat-label { color:#909399; margin-top:4px; }
.calendar-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:12px; }
.calendar-month { border:1px solid #ebeef5; border-radius:8px; overflow:hidden; }
.month-header { background:#f5f7fa; padding:6px 12px; font-weight:bold; text-align:center; }
.month-items { padding:4px 8px 8px; }
.cal-item { display:flex; align-items:center; gap:4px; padding:3px 0; font-size:13px; }
.cal-item.overdue { color:#f56c6c; }
.cal-item.done { color:#67c23a; text-decoration:line-through; }
.cal-item.pending { color:#606266; }
.cal-dot { flex-shrink:0; }
.cal-name { flex:1; }
.cal-date { color:#c0c4cc; font-size:12px; }
.cal-empty { text-align:center; color:#c0c4cc; padding:8px; }
@media (max-width:1200px) { .calendar-grid { grid-template-columns:repeat(3, 1fr); } }
@media (max-width:900px) { .calendar-grid { grid-template-columns:repeat(2, 1fr); } }
</style>
