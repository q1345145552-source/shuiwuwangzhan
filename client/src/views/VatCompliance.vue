<template>
  <div class="vat-compliance">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">VAT 合规检测</span>
        <el-select v-model="selectedCompanyId" placeholder="选择客户公司" @change="onCompanyChange" style="width:220px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <span style="margin-left:12px">VAT注册:</span>
        <el-switch v-model="vatRegistered" active-text="已注册" inactive-text="未注册" />
      </div>
    </el-card>

    <template v-if="selectedCompanyId">
      <!-- 历史销售额录入 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <div class="card-header">
            <h3>历史月销售额</h3>
            <el-button size="small" @click="addMonthRow"><el-icon><Plus /></el-icon> 添加月份</el-button>
          </div>
        </template>

        <el-table :data="monthlySales" border size="small">
          <el-table-column label="月份" width="180">
            <template #default="{ row }">
              <el-date-picker v-model="row.month" type="month" value-format="YYYY-MM" placeholder="选择月份" size="small" style="width:160px" />
            </template>
          </el-table-column>
          <el-table-column label="含税销售额" width="180">
            <template #default="{ row }">
              <el-input-number v-model="row.platform_sales" :min="0" :precision="2" controls-position="right" size="small" style="width:160px" />
            </template>
          </el-table-column>
          <el-table-column label="退款" width="150">
            <template #default="{ row }">
              <el-input-number v-model="row.platform_refunds" :min="0" :precision="2" controls-position="right" size="small" style="width:130px" />
            </template>
          </el-table-column>
          <el-table-column label="实际净收入" width="160" align="right">
            <template #default="{ row }">
              {{ ((row.platform_sales || 0) - (row.platform_refunds || 0)).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="60">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="monthlySales.splice($index,1)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div style="text-align:center;margin-top:16px">
          <el-button type="primary" size="large" :loading="checking" :disabled="monthlySales.length === 0" @click="runCheck">
            执行合规检测
          </el-button>
        </div>
      </el-card>

      <!-- 检测结果 -->
      <el-card v-if="result" style="background:#fdf6ec">
        <template #header><h3 style="margin:0;color:#e6a23c">🔍 检测结果</h3></template>

        <el-descriptions :column="2" border size="default">
          <el-descriptions-item label="VAT注册状态">
            <el-tag :type="result.vat_registered ? 'success' : 'danger'" size="default">
              {{ result.vat_registered ? '✅ 已注册' : '❌ 未注册' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="年化收入">
            <b>{{ parseFloat(result.annualized_revenue).toLocaleString() }}</b> THB
            <el-tag :type="result.exceeds_threshold ? 'danger' : 'success'" size="small" style="margin-left:8px">
              {{ result.exceeds_threshold ? '超过180万' : '未超180万' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="逾期月数">
            <b style="color:#f56c6c">{{ result.months_overdue }}</b> 个月
          </el-descriptions-item>
          <el-descriptions-item label="估算应补 VAT">
            <b style="color:#f56c6c">{{ parseFloat(result.estimated_vat_owed).toLocaleString() }}</b> THB
          </el-descriptions-item>
          <el-descriptions-item label="估算附加税（滞纳金）">
            <b style="color:#f56c6c">{{ parseFloat(result.estimated_surcharge).toLocaleString() }}</b> THB
          </el-descriptions-item>
          <el-descriptions-item label="估算罚款（1倍）">
            <b style="color:#f56c6c">{{ parseFloat(result.estimated_fine).toLocaleString() }}</b> THB
          </el-descriptions-item>
        </el-descriptions>

        <el-divider />
        <div style="text-align:center;margin:12px 0">
          <span style="font-size:14px">总估算税务敞口：</span>
          <span style="font-size:24px;font-weight:bold;color:#f56c6c">
            {{ parseFloat(result.total_estimated_liability).toLocaleString() }} THB
          </span>
        </div>

        <el-alert v-if="!result.vat_registered && result.exceeds_threshold" type="warning" :closable="false" show-icon style="margin-top:12px">
          建议立即注册 VAT 并主动补税，可减少罚款金额。
        </el-alert>
        <el-alert v-else-if="result.vat_registered && result.exceeds_threshold" type="info" :closable="false" show-icon>
          已注册 VAT，请确保按时申报。
        </el-alert>
      </el-card>

      <!-- 历史检测记录 -->
      <el-card style="margin-top:16px">
        <template #header><h3 style="margin:0">历史检测记录</h3></template>
        <el-table :data="history" stripe size="small">
          <el-table-column label="检测日期" width="120">
            <template #default="{ row }">{{ row.check_date ? row.check_date.substring(0,10) : '' }}</template>
          </el-table-column>
          <el-table-column label="VAT状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.vat_registered ? 'success' : 'danger'" size="small">{{ row.vat_registered ? '已注册' : '未注册' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="年化收入" width="140" align="right">
            <template #default="{ row }">{{ parseFloat(row.annualized_revenue).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="逾期月数" width="90" align="center">
            <template #default="{ row }">{{ row.months_overdue }}</template>
          </el-table-column>
          <el-table-column label="总税务敞口" min-width="160" align="right">
            <template #default="{ row }">
              <b style="color:#f56c6c">{{ parseFloat(row.total_estimated_liability).toLocaleString() }}</b>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="history.length === 0" description="暂无历史记录" />
      </el-card>
    </template>

    <el-empty v-else description="请选择客户公司" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'

const store = useCompanyStore()
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'

const companies = ref([])
const selectedCompanyId = ref(null)
const vatRegistered = ref(false)
const monthlySales = ref([])
const result = ref(null)
const history = ref([])
const checking = ref(false)

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('VatCompliance.vue: 请求失败', e) }
}

const fetchHistory = async () => {
  try {
    history.value = await api.get('/ecommerce/compliance', { params: { company_id: selectedCompanyId.value } })
  } catch { history.value = [] }
}

const onCompanyChange = () => {
  result.value = null
  fetchHistory()
  // Pre-fill with last 12 months
  monthlySales.value = []
  const now = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
    monthlySales.value.push({ month: ym, platform_sales: 0, platform_refunds: 0 })
  }
}

const addMonthRow = () => {
  monthlySales.value.push({ month: '', platform_sales: 0, platform_refunds: 0 })
}

const runCheck = async () => {
  // Validate
  const valid = monthlySales.value.filter(m => m.month && m.platform_sales > 0)
  if (valid.length === 0) { ElMessage.error('请至少填写一个月的销售额'); return }

  checking.value = true
  try {
    result.value = await api.post('/ecommerce/compliance', {
      company_id: selectedCompanyId.value,
      vat_registered: vatRegistered.value,
      monthly_sales: valid,
    })
    ElMessage.success('检测完成')
    fetchHistory()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '检测失败')
  } finally { checking.value = false }
}

onMounted(fetchCompanies)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header h3 { margin: 0; font-size: 16px; }
</style>
