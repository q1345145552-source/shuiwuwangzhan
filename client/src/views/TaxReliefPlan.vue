<template>
  <div class="page">
    <div class="page-header">
      
      <el-select v-model="companyId" placeholder="选择客户公司" @change="loadExData" style="width:240px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
    </div>

    <!-- Step 1: 填写历史销售数据 -->
    <el-card style="margin-bottom:20px">
      <template #header><span>📊 Step 1 — 历史销售数据</span></template>
      <el-row :gutter="16" style="margin-bottom:12px">
        <el-col :span="6">
          <el-form-item label="起始月份">
            <el-date-picker v-model="startMonth" type="month" format="YYYY-MM" value-format="YYYY-MM" placeholder="选择起始月" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="结束月份">
            <el-date-picker v-model="endMonth" type="month" format="YYYY-MM" value-format="YYYY-MM" placeholder="选择结束月" />
          </el-form-item>
        </el-col>
        <el-col :span="4">
          <el-form-item label="">
            <el-button type="primary" @click="generateMonths" :disabled="!startMonth || !endMonth">生成月份表格</el-button>
          </el-form-item>
        </el-col>
        <el-col :span="4">
          <el-button @click="loadExData" :disabled="!companyId">从合规检测导入</el-button>
        </el-col>
      </el-row>

      <el-table :data="monthlySales" border>
        <el-table-column prop="month" label="月份" width="120" />
        <el-table-column label="含税销售额 (THB)" width="200">
          <template #default="{ row, $index }">
            <el-input-number v-model="monthlySales[$index].sales_incl_vat" :min="0" :precision="2" controls-position="right" style="width:180px" />
          </template>
        </el-table-column>
        <el-table-column label="退款金额 (THB)" width="200">
          <template #default="{ row, $index }">
            <el-input-number v-model="monthlySales[$index].refunds" :min="0" :precision="2" controls-position="right" style="width:180px" />
          </template>
        </el-table-column>
        <el-table-column label="净销售额 (THB)" width="180">
          <template #default="{ row }">
            {{ fmt(r(row.sales_incl_vat) - r(row.refunds)) }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Step 2: 进项发票 -->
    <el-card style="margin-bottom:20px">
      <template #header><span>📋 Step 2 — 进项发票情况</span></template>
      <el-form :model="inputInfo" label-width="220px">
        <el-form-item label="是否有进项发票可抵扣">
          <el-switch v-model="inputInfo.has_input_invoices" />
        </el-form-item>
        <el-form-item v-if="inputInfo.has_input_invoices" label="估算可抵扣进项VAT总额">
          <el-input-number v-model="inputInfo.estimated_input_vat" :min="0" :precision="2" style="width:220px" /> THB
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Step 3: 生成方案 -->
    <el-card style="margin-bottom:20px">
      <template #header><span>📝 Step 3 — 生成补税方案</span></template>
      <el-button type="primary" size="large" @click="generatePlan" :loading="planLoading" :disabled="!monthlySales.length">
        生成补税方案
      </el-button>
    </el-card>

    <!-- 方案结果 -->
    <template v-if="planResult">
      <!-- 总额估算 -->
      <el-card style="margin-bottom:20px">
        <template #header><span>📊 总额估算</span></template>
        <el-row :gutter="16">
          <el-col :span="12">
            <div class="result-box">
              <h3 style="color:#67c23a">✅ 主动补税方案（Section 22）<br><small style="color:#909399">推荐</small></h3>
              <div class="big-num green">{{ fmt(planResult.summary.total_liability_optimistic) }} THB</div>
              <div class="breakdown">
                <div>应补 VAT 本金：{{ fmt(planResult.summary.total_vat_owed) }} THB</div>
                <div>滞纳金：{{ fmt(planResult.summary.total_penalty) }} THB</div>
                <div style="color:#67c23a">罚款可申请减免</div>
              </div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="result-box">
              <h3 style="color:#f56c6c">⚠️ 被稽查方案（Section 36）<br><small style="color:#909399">最坏情况</small></h3>
              <div class="big-num red">{{ fmt(planResult.summary.total_liability_pessimistic) }} THB</div>
              <div class="breakdown">
                <div>应补 VAT 本金：{{ fmt(planResult.summary.total_vat_owed) }} THB</div>
                <div>滞纳金：{{ fmt(planResult.summary.total_penalty) }} THB</div>
                <div style="color:#f56c6c">罚款（2倍）：{{ fmt(planResult.summary.total_vat_owed * 2) }} THB</div>
              </div>
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- 逐月明细 -->
      <el-card style="margin-bottom:20px">
        <template #header><span>📋 逐月明细</span></template>
        <el-table :data="planResult.monthly_breakdown" border>
          <el-table-column prop="month" label="月份" width="100" />
          <el-table-column label="不含税销售额" width="160">
            <template #default="{ row }">{{ fmt(row.sales_ex_vat) }}</template>
          </el-table-column>
          <el-table-column label="销项VAT" width="130">
            <template #default="{ row }">{{ fmt(row.vat_due) }}</template>
          </el-table-column>
          <el-table-column label="进项抵扣" width="120">
            <template #default="{ row }">{{ fmt(row.input_vat_deducted) }}</template>
          </el-table-column>
          <el-table-column label="应补VAT" width="130">
            <template #default="{ row }">
              <span :style="{ color: row.net_vat_due > 0 ? '#f56c6c' : '#67c23a' }">{{ fmt(row.net_vat_due) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="逾期天数" width="100">
            <template #default="{ row }">{{ row.overdue_days }}</template>
          </el-table-column>
          <el-table-column label="滞纳金" width="130">
            <template #default="{ row }">{{ fmt(row.penalty) }}</template>
          </el-table-column>
          <el-table-column label="截止日" width="120" prop="due_date" />
        </el-table>
      </el-card>

      <!-- 行动步骤 -->
      <el-card style="margin-bottom:20px">
        <template #header><span>📋 行动步骤</span></template>
        <el-steps direction="vertical" :active="0">
          <el-step v-for="(step, i) in planResult.action_plan.steps" :key="i"
                   :title="step" :description="i === 0 ? '第' + (i + 1) + '天' : ''" />
        </el-steps>
      </el-card>

      <!-- 分期建议 -->
      <el-card style="margin-bottom:20px">
        <template #header><span>💳 分期建议</span></template>
        <p style="font-size:16px">{{ planResult.action_plan.installment }}</p>
      </el-card>

      <!-- 时间表 -->
      <el-card>
        <template #header><span>📅 建议时间表</span></template>
        <el-timeline>
          <el-timeline-item timestamp="第1-3天" placement="top">准备材料（平台销售报告、银行流水、进项发票）</el-timeline-item>
          <el-timeline-item timestamp="第4-7天" placement="top">联系税务局，提交 Section 22 主动补税申请</el-timeline-item>
          <el-timeline-item timestamp="第8-30天" placement="top" color="#67c23a">完成补缴 {{ fmt(planResult.summary.total_liability_optimistic) }} THB</el-timeline-item>
        </el-timeline>
      </el-card>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../api'
import { ElMessage } from 'element-plus'



const companyId = ref(null)
const companies = ref([])
const startMonth = ref('')
const endMonth = ref('')
const monthlySales = ref([])
const inputInfo = ref({ has_input_invoices: false, estimated_input_vat: 0 })
const planResult = ref(null)
const planLoading = ref(false)

const r = v => parseFloat(v) || 0
const fmt = v => r(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = data
  if (data.length) { companyId.value = data[0].id; loadExData() }
}

function generateMonths() {
  if (!startMonth.value || !endMonth.value) return
  const [sy, sm] = startMonth.value.split('-').map(Number)
  const [ey, em] = endMonth.value.split('-').map(Number)
  const items = []
  let y = sy, m = sm
  while (y < ey || (y === ey && m <= em)) {
    const month = y + '-' + String(m).padStart(2, '0')
    items.push({ month, sales_incl_vat: 0, refunds: 0 })
    m++; if (m > 12) { m = 1; y++ }
  }
  monthlySales.value = items
}

async function loadExData() {
  if (!companyId.value) return
  try {
    const data = await api.get('/vat-compliance', { params: { company_id: companyId.value } })
    // vat_compliance 里可能有 monthly data
    if (!data.length) return
    // 如果已有合规检测数据，尝试读取
  } catch (e) { /* noop */ }
}

async function generatePlan() {
  planLoading.value = true
  try {
    const data = await api.post('/compliance/tax-relief-plan', {
      company_id: companyId.value,
      start_month: startMonth.value,
      end_month: endMonth.value,
      monthly_sales: monthlySales.value,
      has_input_invoices: inputInfo.value.has_input_invoices,
      estimated_input_vat: inputInfo.value.estimated_input_vat
    })
    planResult.value = data
    ElMessage.success('方案已生成')
  } catch (e) {
    ElMessage.error('生成失败: ' + (e.response?.data?.error || e.message))
  } finally { planLoading.value = false }
}

onMounted(() => {
  loadCompanies()
  // 默认起止月份
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  startMonth.value = y + '-' + String(Math.max(1, m - 6)).padStart(2, '0')
  endMonth.value = y + '-' + String(m - 1).padStart(2, '0')
})
</script>

<style scoped>
.page { padding: 8px; }
.page-header { display:flex; align-items:center; margin-bottom:20px; gap:8px; }
.page-header h2 { margin:0 16px 0 0; }
.result-box { padding:20px; border-radius:8px; background:#fafafa; text-align:center; }
.result-box h3 { margin:0 0 12px; }
.big-num { font-size:32px; font-weight:bold; margin:8px 0; }
.big-num.green { color:#67c23a; }
.big-num.red { color:#f56c6c; }
.breakdown { color:#606266; line-height:1.8; font-size:14px; }
</style>
