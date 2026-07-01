<template>
  <div class="page">
    <!-- 筛选 -->
    <el-card style="margin-bottom:16px">
      <el-form :inline="true" :model="filters" size="default">
        <el-form-item label="客户公司">
          <el-select v-model="filters.company_id" clearable placeholder="全部" style="width:180px">
            <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作类型">
          <el-select v-model="filters.action" clearable placeholder="全部" style="width:130px">
            <el-option label="新增" value="create" />
            <el-option label="编辑" value="update" />
            <el-option label="删除" value="delete" />
            <el-option label="导入" value="import" />
            <el-option label="导出" value="export" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作对象">
          <el-select v-model="filters.entity_type" clearable placeholder="全部" style="width:150px">
            <el-option label="客户公司" value="company" />
            <el-option label="销售数据" value="ecommerce_sales" />
            <el-option label="销项明细" value="vat_output" />
            <el-option label="进项明细" value="vat_input" />
            <el-option label="费用" value="expense" />
            <el-option label="WHT申报" value="wht_report" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="dateRange" type="daterange" range-separator="至"
            start-placeholder="开始" end-placeholder="结束" format="YYYY-MM-DD" value-format="YYYY-MM-DD"
            style="width:260px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadLogs">搜索</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 统计卡 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ stats.total || 0 }}</div>
          <div class="stat-label">总操作数</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num green">{{ stats.today || 0 }}</div>
          <div class="stat-label">今日操作</div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-detail">
            <span v-for="a in stats.by_action" :key="a.action" style="margin:0 6px">
              <el-tag size="small">{{ a.action }} {{ a.cnt }}</el-tag>
            </span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 日志列表 -->
    <el-card>
      <template #header><span>📋 操作日志</span></template>
      <el-table :data="logs" v-loading="loading" stripe>
        <el-table-column prop="created_at" label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="user_name" label="操作人" width="100" />
        <el-table-column label="操作类型" width="90">
          <template #default="{ row }">
            <el-tag :type="actionType(row.action)" size="small">{{ actionLabel(row.action) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作对象" width="110">
          <template #default="{ row }">{{ entityLabel(row.entity_type) }}</template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
        <el-table-column prop="ip_address" label="IP" width="120" />
        <el-table-column label="操作" width="80" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="showDetail(row)">详情</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div style="margin-top:16px;text-align:right">
        <el-pagination background layout="prev, pager, next" :total="totalLogs" :page-size="50" v-model:current-page="currentPage" @current-change="loadLogs" />
      </div>
    </el-card>

    <!-- 详情弹窗 -->
    <el-dialog v-model="detailVisible" title="操作详情" width="650px">
      <template v-if="detail">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="时间">{{ formatTime(detail.created_at) }}</el-descriptions-item>
          <el-descriptions-item label="操作人">{{ detail.user_name }}</el-descriptions-item>
          <el-descriptions-item label="操作类型">{{ actionLabel(detail.action) }}</el-descriptions-item>
          <el-descriptions-item label="操作对象">{{ entityLabel(detail.entity_type) }}</el-descriptions-item>
          <el-descriptions-item label="描述" :span="2">{{ detail.description }}</el-descriptions-item>
        </el-descriptions>
        <div v-if="detail.old_value" style="margin-top:16px">
          <h4>修改前</h4>
          <pre class="json-block">{{ JSON.stringify(detail.old_value, null, 2) }}</pre>
        </div>
        <div v-if="detail.new_value" style="margin-top:12px">
          <h4>修改后</h4>
          <pre class="json-block">{{ JSON.stringify(detail.new_value, null, 2) }}</pre>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../api'

const filters = reactive({ company_id: null, action: '', entity_type: '', start_date: '', end_date: '' })
const dateRange = ref([])
const logs = ref([])
const totalLogs = ref(0)
const currentPage = ref(1)
const loading = ref(false)
const stats = reactive({ total: 0, today: 0, by_action: [] })
const companies = ref([])
const detail = ref(null)
const detailVisible = ref(false)

function actionType(a) {
  const m = { create: '', update: 'warning', delete: 'danger', import: 'success', export: 'info' }
  return m[a] || ''
}
function actionLabel(a) {
  const m = { create: '新增', update: '编辑', delete: '删除', import: '导入', export: '导出', login: '登录' }
  return m[a] || a
}
function entityLabel(e) {
  const m = { company: '客户公司', ecommerce_sales: '销售数据', vat_output: '销项明细', vat_input: '进项明细', expense: '费用', wht_report: 'WHT申报', cit_report: 'CIT申报', invoice: '发票', bank: '银行流水' }
  return m[e] || e
}
function formatTime(t) { return t ? new Date(t).toLocaleString('zh-CN') : '-' }

async function loadLogs() {
  loading.value = true
  try {
    if (dateRange.value?.length === 2) {
      filters.start_date = dateRange.value[0]
      filters.end_date = dateRange.value[1]
    } else { filters.start_date = ''; filters.end_date = '' }
    const params = { ...filters, page: currentPage.value, limit: 50 }
    // Remove empty params
    Object.keys(params).forEach(k => { if (!params[k] && params[k] !== 0) delete params[k] })
    const data = await api.get('/audit/logs', { params })
    logs.value = data.items || []
    totalLogs.value = data.total || 0
  } catch (e) { /* noop */ }
  finally { loading.value = false }
}

async function loadStats() {
  try { const data = await api.get('/audit/stats'); Object.assign(stats, data) } catch (e) { /* noop */ }
}

async function loadCompanies() {
  try { const data = await api.get('/companies'); companies.value = Array.isArray(data) ? data : [] } catch (e) { /* noop */ }
}

async function showDetail(row) {
  try { detail.value = await api.get('/audit/logs/' + row.id); detailVisible.value = true } catch (e) { /* noop */ }
}

function resetFilters() {
  Object.assign(filters, { company_id: null, action: '', entity_type: '', start_date: '', end_date: '' })
  dateRange.value = []
  currentPage.value = 1
  loadLogs()
}

onMounted(() => { loadCompanies(); loadStats(); loadLogs() })
</script>

<style scoped>
.page { padding: 8px; }
.stat-card { text-align: center; }
.stat-num { font-size: 28px; font-weight: bold; color: #409eff; }
.stat-num.green { color: #67c23a; }
.stat-label { color: #909399; margin-top: 4px; font-size: 13px; }
.stat-detail { padding: 8px 0; }
.json-block { background: #f5f7fa; padding: 12px; border-radius: 6px; font-size: 12px; max-height: 300px; overflow: auto; white-space: pre-wrap; }
</style>
