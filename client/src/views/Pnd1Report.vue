<template>
  <div class="page">
    <div class="page-header">
      <el-select v-model="companyId" placeholder="客户公司" @change="loadPeriods" style="width:220px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="periodId" placeholder="会计期间" @change="loadReport" style="width:200px;margin-left:12px" filterable>
        <el-option v-for="p in periods" :key="p.id" :label="p.year + '年' + p.month + '月'" :value="p.id" />
      </el-select>
      <el-button type="primary" @click="calculate" :loading="calcLoading" :disabled="!periodId" style="margin-left:12px">计算本月 PND.1</el-button>
      <el-button type="success" @click="saveReport" :loading="saveLoading" :disabled="!calcResult">保存申报</el-button>
      <el-button v-if="savedReport" type="warning" @click="markFiled" :disabled="savedReport.status !== 'draft'">
        {{ savedReport.status === 'filed' ? '✅ 已申报' : '标记已申报' }}
      </el-button>
    </div>

    <!-- 计算结果 -->
    <el-card v-if="calcResult" style="margin-bottom:16px">
      <template #header><span>📊 PND.1 工资预扣税计算</span></template>
      <el-table :data="calcResult.items" border stripe>
        <el-table-column prop="employee_code" label="编号" width="80" />
        <el-table-column prop="employee_name" label="姓名" width="150" />
        <el-table-column label="月薪" width="120"><template #default="{row}">{{ fmt(row.salary) }}</template></el-table-column>
        <el-table-column label="费用扣除" width="130"><template #default="{row}">{{ fmt(row.expense_deduction) }}</template></el-table-column>
        <el-table-column label="个人免税额" width="120"><template #default="{row}">{{ fmt(row.personal_allowance) }}</template></el-table-column>
        <el-table-column label="社保扣除" width="120"><template #default="{row}">{{ fmt(row.ss_deduction) }}</template></el-table-column>
        <el-table-column label="应税收入" width="140"><template #default="{row}">{{ fmt(row.taxable_income) }}</template></el-table-column>
        <el-table-column label="年税额" width="120"><template #default="{row}">{{ fmt(row.annual_tax) }}</template></el-table-column>
        <el-table-column label="月预扣税" width="130">
          <template #default="{row}"><b style="color:#e6a23c">{{ fmt(row.monthly_wht) }}</b></template>
        </el-table-column>
      </el-table>

      <div class="result-summary">
        <div>总月工资：<b>{{ fmt(calcResult.summary.total_salary) }} THB</b></div>
        <div>总预扣税额：<b style="color:#e6a23c">{{ fmt(calcResult.summary.total_wht) }} THB</b></div>
        <div>员工人数：{{ calcResult.summary.employee_count }} 人</div>
      </div>
    </el-card>

    <!-- 税率表参考 -->
    <el-card v-if="calcResult">
      <template #header><span>📋 泰国 PIT 累进税率表（参考）</span></template>
      <el-table :data="taxBrackets" size="small" border>
        <el-table-column label="应税收入区间 (THB/年)" width="220">
          <template #default="{row}">{{ row.range }}</template>
        </el-table-column>
        <el-table-column label="税率" width="100"><template #default="{row}">{{ row.rate }}</template></el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../api'
import { ElMessage } from 'element-plus'

const fmt = v => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const companyId = ref(null)
const companies = ref([])
const periods = ref([])
const periodId = ref(null)
const calcResult = ref(null)
const savedReport = ref(null)
const calcLoading = ref(false)
const saveLoading = ref(false)

const taxBrackets = [
  { range: '0 – 150,000', rate: '0%' },
  { range: '150,001 – 300,000', rate: '5%' },
  { range: '300,001 – 500,000', rate: '10%' },
  { range: '500,001 – 750,000', rate: '15%' },
  { range: '750,001 – 1,000,000', rate: '20%' },
  { range: '1,000,001 – 2,000,000', rate: '25%' },
  { range: '2,000,001 – 5,000,000', rate: '30%' },
  { range: '5,000,001 以上', rate: '35%' },
]

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = Array.isArray(data) ? data : []
  if (companies.value.length) { companyId.value = companies.value[0].id; loadPeriods() }
}

async function loadPeriods() {
  if (!companyId.value) return
  try {
    const data = await api.get('/periods', { params: { company_id: companyId.value } })
    periods.value = Array.isArray(data) ? data : []
    if (periods.value.length) { periodId.value = periods.value[0].id; loadReport() }
  } catch (e) { /* noop */ }
}

async function loadReport() {
  if (!periodId.value) return
  try {
    savedReport.value = await api.get('/pnd1/report', { params: { company_id: companyId.value, period_id: periodId.value } })
  } catch (e) { /*
 savedReport.value = null */ }
}

async function calculate() {
  calcLoading.value = true
  try {
    calcResult.value = await api.post('/pnd1/calculate', { company_id: companyId.value, period_id: periodId.value })
    if (!calcResult.value.items?.length) ElMessage.warning('没有在职员工')
    else ElMessage.success('计算完成')
  } catch (e) { ElMessage.error('计算失败') }
  finally { calcLoading.value = false }
}

async function saveReport() {
  saveLoading.value = true
  try {
    savedReport.value = await api.post('/pnd1/report', { company_id: companyId.value, period_id: periodId.value })
    ElMessage.success('PND.1 申报已保存')
  } catch (e) { ElMessage.error('保存失败') }
  finally { saveLoading.value = false }
}

async function markFiled() {
  try {
    savedReport.value = await api.put('/pnd1/report/' + savedReport.value.id + '/status', { status: 'filed' })
    ElMessage.success('已标记为已申报')
  } catch (e) { ElMessage.error('操作失败') }
}

onMounted(() => { loadCompanies() })
</script>

<style scoped>
.page { padding: 8px; }
.page-header { display: flex; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
.result-summary { margin-top: 12px; padding: 12px 16px; background: #fdf6ec; border-radius: 8px; display: flex; gap: 24px; flex-wrap: wrap; }
.result-summary b { font-size: 16px; }
</style>
