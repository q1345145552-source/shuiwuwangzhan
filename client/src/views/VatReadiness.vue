<template>
  <div class="vat-readiness">
    <!-- 顶部工具栏 -->
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold;font-size:16px">VAT 报税准备中心</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="fetchReadiness"
        />
        <el-button :loading="loading" @click="fetchReadiness">刷新检查</el-button>
      </div>
    </el-card>

    <el-skeleton v-if="loading" :rows="6" animated style="padding:16px" />

    <template v-if="data">
      <!-- 准备度总览 -->
      <el-row :gutter="16" style="margin-bottom:16px">
        <el-col :span="8">
          <el-card :style="{borderColor: statusColor, borderWidth:'2px'}">
            <div style="text-align:center">
              <div style="font-size:13px;color:#909399;margin-bottom:8px">报税准备度</div>
              <el-progress type="dashboard" :percentage="data.readiness" :color="progressColor" :stroke-width="14" :width="160">
                <template #default="{ percentage }">
                  <span :style="{fontSize:'28px',fontWeight:'bold',color:statusColor}">{{ percentage }}%</span>
                </template>
              </el-progress>
              <div style="margin-top:8px">
                <el-tag :type="filingTagType" size="large">{{ data.filing_status_label }}</el-tag>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="16">
          <el-card>
            <template #header><span style="font-weight:bold">检查统计</span></template>
            <el-row :gutter="12">
              <el-col :span="6">
                <div style="text-align:center">
                  <div style="font-size:28px;font-weight:bold;color:#67c23a">{{ data.summary.passed }}</div>
                  <div style="font-size:12px;color:#909399">已完成</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div style="text-align:center">
                  <div style="font-size:28px;font-weight:bold;color:#e6a23c">{{ data.summary.warned }}</div>
                  <div style="font-size:12px;color:#909399">建议检查</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div style="text-align:center">
                  <div style="font-size:28px;font-weight:bold;color:#f56c6c">{{ data.summary.failed }}</div>
                  <div style="font-size:12px;color:#909399">未完成</div>
                </div>
              </el-col>
              <el-col :span="6">
                <div style="text-align:center">
                  <div style="font-size:28px;font-weight:bold;color:#303133">{{ data.summary.total }}</div>
                  <div style="font-size:12px;color:#909399">总检查项</div>
                </div>
              </el-col>
            </el-row>
          </el-card>
        </el-col>
      </el-row>

      <!-- 检查列表 -->
      <el-card style="margin-bottom:16px">
        <template #header><span style="font-weight:bold">检查清单</span></template>
        <div v-for="item in data.checks" :key="item.id" class="check-row" :class="'status-' + item.status">
          <div class="check-icon">
            <el-icon v-if="item.status === 'pass'" color="#67c23a" :size="20"><CircleCheckFilled /></el-icon>
            <el-icon v-else-if="item.status === 'warn'" color="#e6a23c" :size="20"><WarningFilled /></el-icon>
            <el-icon v-else color="#f56c6c" :size="20"><CircleCloseFilled /></el-icon>
          </div>
          <div class="check-body">
            <div class="check-label">
              {{ item.label }}
              <el-tag v-if="item.status === 'pass'" type="success" size="small" effect="plain">已完成</el-tag>
              <el-tag v-else-if="item.status === 'warn'" type="warning" size="small" effect="plain">建议检查</el-tag>
              <el-tag v-else type="danger" size="small" effect="plain">未完成</el-tag>
            </div>
            <div class="check-msg">{{ item.message }}</div>
          </div>
          <div class="check-score">
            {{ item.score }}/{{ item.max }}
          </div>
          <div class="check-action">
            <el-button v-if="item.action_link && item.status !== 'pass'" size="small" type="primary" @click="goTo(item.action_link)">
              去处理
            </el-button>
          </div>
        </div>
      </el-card>

      <!-- 检查摘要 -->
      <el-card>
        <template #header><span style="font-weight:bold">检查摘要</span></template>
        <el-alert
          :type="data.filing_status === 'ready' ? 'success' : data.filing_status === 'review' ? 'warning' : 'error'"
          :closable="false"
          show-icon
        >
          <template #title>
            <span>本月 VAT 检查：已完成 {{ data.summary.passed }}/{{ data.summary.total }} 项。</span>
            <span v-if="data.summary.pending.length > 0">
              仍需完成：{{ data.summary.pending.join('、') }}。
            </span>
            <span v-if="data.filing_status === 'ready'">
              所有检查通过，建议前往 VAT 申报页面生成申报数据。
              <el-button size="small" type="success" style="margin-left:8px" @click="goTo('/vat-report')">去申报</el-button>
            </span>
          </template>
        </el-alert>
      </el-card>
    </template>

    <el-empty v-else-if="!loading" description="请选择客户公司和会计期间，点击刷新检查" />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled, WarningFilled, CircleCloseFilled } from '@element-plus/icons-vue'
import api from '../api'
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'

const router = useRouter()
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const data = ref(null)
const loading = ref(false)

const statusColor = computed(() => {
  if (!data.value) return '#e4e7ed'
  if (data.value.filing_status === 'ready') return '#67c23a'
  if (data.value.filing_status === 'review') return '#e6a23c'
  return '#f56c6c'
})

const progressColor = computed(() => {
  if (!data.value) return '#e4e7ed'
  const s = data.value.readiness
  if (s >= 90) return '#67c23a'
  if (s >= 60) return '#e6a23c'
  return '#f56c6c'
})

const filingTagType = computed(() => {
  if (!data.value) return 'info'
  if (data.value.filing_status === 'ready') return 'success'
  if (data.value.filing_status === 'review') return 'warning'
  return 'danger'
})

const fetchReadiness = async () => {
  if (!selectedCompanyId.value || !selectedPeriodId.value) {
    ElMessage.warning('请选择客户公司和会计期间')
    return
  }
  loading.value = true
  try {
    data.value = await api.get('/vat-report/readiness', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch (e) {
    ElMessage.error('检查失败: ' + (e.response?.data?.error || e.message))
  } finally { loading.value = false }
}

const onCompanyChange = () => { selectedPeriodId.value = null; data.value = null }

function goTo(path) {
  if (path) router.push(path)
}
</script>

<style scoped>
.check-row {
  display: flex;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #ebeef5;
  gap: 12px;
}
.check-row:last-child { border-bottom: none; }
.check-row.status-pass { background: #f0f9eb; border-radius: 4px; padding: 12px 8px; }
.check-row.status-fail { background: #fef0f0; border-radius: 4px; padding: 12px 8px; }
.check-icon { width: 28px; flex-shrink: 0; }
.check-body { flex: 1; min-width: 0; }
.check-label { font-weight: 500; margin-bottom: 2px; display: flex; align-items: center; gap: 8px; }
.check-msg { font-size: 13px; color: #909399; }
.check-score { width: 60px; text-align: center; font-size: 14px; font-weight: bold; color: #606266; }
.check-action { width: 80px; flex-shrink: 0; }
</style>
