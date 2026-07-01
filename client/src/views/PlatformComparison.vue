<template>
  <div class="page">
    <div class="page-header">
      <el-select v-model="companyId" placeholder="客户公司" @change="loadAll" style="width:220px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="year" @change="loadComparison" style="width:110px;margin-left:12px">
        <el-option v-for="y in [2024,2025,2026]" :key="y" :label="String(y)" :value="y" />
      </el-select>
      <el-select v-model="month" @change="loadComparison" style="width:100px;margin-left:12px">
        <el-option v-for="m in 12" :key="m" :label="m+'月'" :value="m" />
      </el-select>
      <el-button type="primary" @click="loadComparison" :loading="loading" style="margin-left:12px">对比</el-button>
    </div>

    <!-- 对比卡片 -->
    <el-row v-if="comparison" :gutter="16" style="margin-bottom:20px">
      <el-col :span="8">
        <el-card shadow="hover" class="comp-card" :class="comp.statusClass('sales')">
          <div class="comp-title">💰 总销售额</div>
          <div class="comp-row">平台：<b>{{ fmt(comparison.platform_data.total_sales) }} THB</b></div>
          <div class="comp-row">系统：<b>{{ fmt(comparison.system_data.total_sales) }} THB</b></div>
          <div class="comp-diff" :class="comp.diffClass('sales')">
            差异：{{ fmt(comparison.differences.sales_diff) }} {{ comp.diffIcon('sales') }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="comp-card" :class="comp.statusClass('fees')">
          <div class="comp-title">📊 平台费用</div>
          <div class="comp-row">平台：<b>{{ fmt(comparison.platform_data.total_fees) }} THB</b></div>
          <div class="comp-row">系统：<b>{{ fmt(comparison.system_data.total_fees) }} THB</b></div>
          <div class="comp-diff" :class="comp.diffClass('fees')">
            差异：{{ fmt(comparison.differences.fees_diff) }} {{ comp.diffIcon('fees') }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card shadow="hover" class="comp-card" :class="comp.statusClass('shipping')">
          <div class="comp-title">🚚 物流费</div>
          <div class="comp-row">平台：<b>{{ fmt(comparison.platform_data.total_shipping) }} THB</b></div>
          <div class="comp-row">系统：<b>{{ fmt(comparison.system_data.total_shipping) }} THB</b></div>
          <div class="comp-diff" :class="comp.diffClass('shipping')">
            差异：{{ fmt(comparison.differences.shipping_diff) }} {{ comp.diffIcon('shipping') }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row v-if="comparison" :gutter="16" style="margin-bottom:20px">
      <el-col :span="12">
        <el-card>
          <template #header>
            <span>📋 平台独有订单（系统未录入）</span>
            <el-tag :type="comparison.missing_orders?.length ? 'danger' : 'success'" size="small" style="margin-left:8px">
              {{ comparison.missing_orders?.length || 0 }} 条
            </el-tag>
            <el-button v-if="comparison.missing_orders?.length" size="small" type="primary" style="float:right" @click="importAllMissing" :loading="importAllLoading">
              一键全部录入
            </el-button>
          </template>
          <el-table :data="comparison.missing_orders" border size="small" max-height="400" @selection-change="onSelectionChange">
            <el-table-column type="selection" width="40" />
            <el-table-column prop="order_id" label="订单号" width="140" />
            <el-table-column prop="order_date" label="日期" width="110" />
            <el-table-column label="金额" width="110">
              <template #default="{row}">{{ fmt(row.total_amount) }} THB</template>
            </el-table-column>
            <el-table-column prop="customer_name" label="客户" width="120" />
            <el-table-column label="操作" width="90">
              <template #default="{row}">
                <el-button size="small" type="primary" @click="importOne(row)">录入</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!comparison.missing_orders?.length" style="text-align:center;color:#67c23a;padding:20px">✅ 没有缺失订单，平台与系统数据一致</div>
        </el-card>
      </el-col>
      <el-col :span="12">
        <el-card>
          <template #header><span>📈 月度趋势（近6个月）</span></template>
          <div v-if="trend.length" class="bar-chart">
            <div v-for="t in trend" :key="t.month" class="bar-group">
              <div class="bar-col">
                <div class="bar plat" :style="{height: barHeight(t.platform_sales, maxBar) + 'px'}"></div>
                <div class="bar sys" :style="{height: barHeight(t.system_sales, maxBar) + 'px'}"></div>
              </div>
              <div class="bar-label">{{ t.month }}月</div>
            </div>
          </div>
          <div style="margin-top:8px">
            <span class="legend"><span class="legend-dot plat"></span> 平台数据</span>
            <span class="legend" style="margin-left:16px"><span class="legend-dot sys"></span> 系统数据</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 综合状态 -->
    <el-card v-if="comparison">
      <div class="status-banner" :class="comparison.status">
        <span v-if="comparison.status === 'matched'">✅ 平台数据与系统数据完全一致</span>
        <span v-else-if="comparison.status === 'has_differences'">⚠️ 存在 {{ comparison.missing_orders?.length || 0 }} 处差异</span>
        <span v-else>❌ 有 {{ comparison.missing_orders?.length || 0 }} 条平台订单未录入系统</span>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../api'
import { ElMessage } from 'element-plus'

const fmt = v => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const companyId = ref(null)
const companies = ref([])
const year = ref(new Date().getFullYear())
const month = ref(new Date().getMonth() + 1)
const comparison = ref(null)
const loading = ref(false)
const trend = ref([])
const importAllLoading = ref(false)
const selectedMissing = ref([])

const comp = computed(() => {
  if (!comparison.value) return {}
  const diffZero = (k) => Math.abs(parseFloat(comparison.value.differences[k] || 0)) < 0.01
  return {
    statusClass: (k) => diffZero(k) ? 'ok' : 'fail',
    diffClass: (k) => diffZero(k) ? 'ok' : 'fail',
    diffIcon: (k) => diffZero(k) ? '✅' : '❌'
  }
})

const maxBar = computed(() => {
  let m = 1
  for (const t of trend.value) {
    m = Math.max(m, parseFloat(t.platform_sales) || 0, parseFloat(t.system_sales) || 0)
  }
  return m
})

function barHeight(val, max) {
  if (!max || !val) return 0
  return Math.max(4, (parseFloat(val) / max) * 150)
}

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = Array.isArray(data) ? data : []
  if (companies.value.length) { companyId.value = companies.value[0].id; loadComparison() }
}

async function loadAll() { loadComparison() }

async function loadComparison() {
  if (!companyId.value) return
  loading.value = true
  try {
    const [compData, trendData] = await Promise.all([
      api.get('/platform-import/comparison', { params: { company_id: companyId.value, year: year.value, month: month.value } }),
      api.get('/platform-import/trend', { params: { company_id: companyId.value, year: year.value } })
    ])
    comparison.value = compData
    trend.value = Array.isArray(trendData) ? trendData : []
  } catch (e) { /* noop */ }
  finally { loading.value = false }
}

function onSelectionChange(rows) { selectedMissing.value = rows }

async function importOne(row) {
  try {
    await api.post('/platform-import/add-missing', { company_id: companyId.value, period_id: comparison.value.period_id || null, order_ids: [row.raw_id] })
    ElMessage.success('已录入')
    loadComparison()
  } catch (e) { ElMessage.error('录入失败') }
}

async function importAllMissing() {
  if (!selectedMissing.value.length) { ElMessage.warning('请先勾选订单'); return }
  importAllLoading.value = true
  try {
    await api.post('/platform-import/add-missing', { company_id: companyId.value, period_id: null, order_ids: selectedMissing.value.map(r => r.raw_id) })
    ElMessage.success(`已批量录入 ${selectedMissing.value.length} 条`)
    loadComparison()
  } catch (e) { ElMessage.error('录入失败') }
  finally { importAllLoading.value = false }
}

onMounted(() => { loadCompanies() })
</script>

<style scoped>
.page { padding: 8px; }
.page-header { display: flex; align-items: center; margin-bottom: 16px; }
.comp-card { text-align: center; }
.comp-card.ok { border-left: 4px solid #67c23a; }
.comp-card.fail { border-left: 4px solid #f56c6c; }
.comp-title { font-weight: bold; margin-bottom: 8px; font-size: 15px; }
.comp-row { margin: 4px 0; color: #606266; }
.comp-diff { margin-top: 6px; font-size: 14px; }
.comp-diff.ok { color: #67c23a; }
.comp-diff.fail { color: #f56c6c; }

.bar-chart { display: flex; align-items: flex-end; gap: 12px; height: 180px; padding: 8px 0; }
.bar-group { flex: 1; display: flex; flex-direction: column; align-items: center; }
.bar-col { display: flex; gap: 3px; align-items: flex-end; height: 160px; }
.bar { width: 18px; border-radius: 3px 3px 0 0; transition: height 0.4s; }
.bar.plat { background: #409eff; }
.bar.sys { background: #67c23a; }
.bar-label { font-size: 11px; color: #909399; margin-top: 4px; }

.legend { font-size: 12px; color: #606266; display: inline-flex; align-items: center; }
.legend-dot { width: 12px; height: 12px; border-radius: 2px; display: inline-block; margin-right: 4px; }
.legend-dot.plat { background: #409eff; }
.legend-dot.sys { background: #67c23a; }

.status-banner { padding: 16px; border-radius: 8px; text-align: center; font-size: 16px; font-weight: bold; }
.status-banner.matched { background: #f0f9eb; color: #67c23a; }
.status-banner.has_differences { background: #fdf6ec; color: #e6a23c; }
.status-banner.has_missing { background: #fef0f0; color: #f56c6c; }
</style>
