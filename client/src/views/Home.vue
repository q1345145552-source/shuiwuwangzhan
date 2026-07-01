<template>
  <div class="home-dashboard">
    <!-- Header -->
    <div class="dashboard-header">
      <h2>📊 泰国电商税务管理系统</h2>
      <p>{{ greeting }}，管理员</p>
    </div>

    <!-- Stat Cards -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="$router.push('/companies')" style="cursor:pointer">
          <div class="stat-label">客户总数</div>
          <div class="stat-value">{{ summary.company_count }}</div>
          <div class="stat-sub">个</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">本月待办</div>
          <div class="stat-value" style="color:#e6a23c">{{ summary.this_month_pending }}</div>
          <div class="stat-sub">项</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">逾期事项</div>
          <div class="stat-value" :style="{color: summary.overdue_count > 0 ? '#f56c6c' : '#67c23a'}">{{ summary.overdue_count }}</div>
          <div class="stat-sub">项 {{ summary.overdue_count > 0 ? '🔴' : '✅' }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">本月已申报</div>
          <div class="stat-value" style="color:#67c23a">{{ summary.this_month_filed }}</div>
          <div class="stat-sub">项</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <!-- Left: Deadlines + Overdue -->
      <el-col :span="14">
        <!-- Upcoming Deadlines -->
        <el-card shadow="hover" style="margin-bottom:16px">
          <template #header><h3 style="margin:0">⏰ 即将到期（未来7天）</h3></template>
          <div v-if="summary.upcoming_deadlines?.length" class="deadline-list">
            <div v-for="d in summary.upcoming_deadlines" :key="d.company+d.tax_type+d.due_date" class="deadline-row">
              <span class="deadline-date">{{ formatDate(d.due_date) }}</span>
              <el-tag size="small" type="warning">{{ d.tax_type }}</el-tag>
              <span class="deadline-company">{{ d.company }}</span>
              <span class="deadline-days">还剩 {{ d.due_in_days }} 天</span>
              <el-button link type="primary" size="small">→</el-button>
            </div>
          </div>
          <el-empty v-else description="暂无即将到期事项" :image-size="60" />
        </el-card>

        <!-- Overdue -->
        <el-card shadow="hover">
          <template #header><h3 style="margin:0;color:#f56c6c">🔴 已逾期</h3></template>
          <div v-if="summary.overdue_items?.length" class="deadline-list">
            <div v-for="d in summary.overdue_items" :key="d.company+d.tax_type+d.due_date" class="deadline-row overdue-row">
              <span class="deadline-date">{{ formatDate(d.due_date) }}</span>
              <el-tag size="small" type="danger">{{ d.tax_type }}</el-tag>
              <span class="deadline-company">{{ d.company }}</span>
              <span class="deadline-days" style="color:#f56c6c">逾期 {{ d.overdue_days }} 天</span>
              <span style="color:#909399;font-size:12px">~{{ d.estimated_penalty.toLocaleString() }} THB</span>
              <el-button link type="primary" size="small">→</el-button>
            </div>
          </div>
          <el-empty v-else description="无逾期事项 ✅" :image-size="60" />
        </el-card>
      </el-col>

      <!-- Right: Recent Activity + Trend -->
      <el-col :span="10">
        <!-- Recent Activity -->
        <el-card shadow="hover" style="margin-bottom:16px">
          <template #header><h3 style="margin:0">💬 最近操作</h3></template>
          <div v-if="summary.recent_activity?.length" class="activity-list">
            <div v-for="a in summary.recent_activity" :key="a.time+a.action" class="activity-row">
              <span class="activity-time">{{ a.time }}</span>
              <span class="activity-dot">·</span>
              <span class="activity-action">{{ a.action }}</span>
              <span class="activity-dot">·</span>
              <span class="activity-company">{{ a.company }}</span>
            </div>
          </div>
          <el-empty v-else description="暂无操作记录" :image-size="60" />
        </el-card>

        <!-- Monthly Trend -->
        <el-card shadow="hover">
          <template #header><h3 style="margin:0">📈 近6个月申报趋势</h3></template>
          <div class="trend-chart">
            <div v-for="m in summary.monthly_trend" :key="m.month" class="trend-bar-group">
              <div class="trend-bar-wrapper">
                <div class="trend-bar filed" :style="{height: barHeight(m.filed_count)}" :title="'已申报: '+m.filed_count"></div>
                <div class="trend-bar pending" :style="{height: barHeight(m.pending_count)}" :title="'待办: '+m.pending_count"></div>
              </div>
              <div class="trend-label">{{ m.month.substring(5) }}月</div>
            </div>
          </div>
          <div class="trend-legend">
            <span><span class="legend-box filed"></span> 已申报</span>
            <span><span class="legend-box pending"></span> 待办</span>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import api from '../api'

const summary = ref({
  company_count: 0,
  active_company_count: 0,
  this_month_pending: 0,
  overdue_count: 0,
  this_month_filed: 0,
  upcoming_deadlines: [],
  overdue_items: [],
  recent_activity: [],
  monthly_trend: [],
})

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const formatDate = (d) => {
  if (!d) return ''
  const dt = new Date(d)
  return `${dt.getMonth()+1}月${dt.getDate()}日`
}

const barHeight = (count) => {
  return Math.max(4, Math.min(60, count * 12)) + 'px'
}

const fetchSummary = async () => {
  try {
    summary.value = await api.get('/dashboard/summary')
  } catch (e) {
    console.error('获取仪表盘数据失败:', e)
  }
}

onMounted(fetchSummary)
</script>

<style scoped>
.home-dashboard { max-width: 1200px; }
.dashboard-header { margin-bottom: 24px; }
.dashboard-header h2 { margin: 0 0 4px 0; font-size: 22px; }
.dashboard-header p { margin: 0; color: #909399; }

.stat-card { text-align: center; padding: 8px 0; }
.stat-label { font-size: 13px; color: #909399; margin-bottom: 4px; }
.stat-value { font-size: 32px; font-weight: 700; color: #303133; }
.stat-sub { font-size: 12px; color: #c0c4cc; }

.deadline-list { max-height: 300px; overflow-y: auto; }
.deadline-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 0;
  border-bottom: 1px solid #f0f0f0; font-size: 13px;
}
.deadline-row:last-child { border-bottom: none; }
.deadline-date { color: #606266; min-width: 60px; }
.deadline-company { flex: 1; color: #303133; }
.deadline-days { color: #e6a23c; font-weight: 500; white-space: nowrap; }
.overdue-row { background: #fef0f0; margin: 0 -12px; padding: 8px 12px; border-radius: 4px; }

.activity-list { max-height: 250px; overflow-y: auto; }
.activity-row { padding: 6px 0; font-size: 13px; color: #606266; border-bottom: 1px solid #f5f5f5; }
.activity-row:last-child { border-bottom: none; }
.activity-time { color: #c0c4cc; }
.activity-dot { margin: 0 6px; color: #dcdfe6; }
.activity-action { color: #409eff; }
.activity-company { color: #303133; }

.trend-chart { display: flex; justify-content: space-around; align-items: flex-end; height: 120px; padding: 16px 0 0; }
.trend-bar-group { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.trend-bar-wrapper { display: flex; gap: 3px; align-items: flex-end; height: 70px; }
.trend-bar { width: 22px; border-radius: 4px 4px 0 0; min-height: 4px; transition: height .3s; }
.trend-bar.filed { background: #409eff; }
.trend-bar.pending { background: #e6a23c; }
.trend-label { font-size: 11px; color: #909399; }
.trend-legend { display: flex; gap: 20px; justify-content: center; margin-top: 12px; font-size: 12px; color: #909399; }
.legend-box { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: middle; margin-right: 4px; }
.legend-box.filed { background: #409eff; }
.legend-box.pending { background: #e6a23c; }
</style>
