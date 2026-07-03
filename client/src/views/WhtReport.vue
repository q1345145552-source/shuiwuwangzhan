<template>
  <div class="wht-report">
    <!-- 筛选 -->
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">预扣税申报</span>
        <el-select v-model="selectedCompanyId" placeholder="选择客户公司" @change="onCompanyChange" style="width:220px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="selectedPeriodId" placeholder="选择会计期间" @change="onPeriodChange" :disabled="!selectedCompanyId" style="width:220px">
          <el-option v-for="p in periods" :key="p.id" :label="p.year + '年' + p.month + '月'" :value="p.id" />
        </el-select>
      </div>
    </el-card>

    <template v-if="selectedPeriodId">
      <!-- 区域一：税率速查 + 计算器 -->
      <el-row :gutter="16" style="margin-bottom:16px">
        <el-col :span="14">
          <el-card>
            <template #header><h3 style="margin:0">预扣税率表</h3></template>
            <el-table :data="rateTable" size="small" stripe>
              <el-table-column prop="name" label="付款类型" width="120" />
              <el-table-column prop="payment_type" label="编码" width="120" />
              <el-table-column label="国内法人 (PND.53)" width="160">
                <template #default="{ row }">
                  <el-tag type="warning" size="small">{{ row.pnd53_rate != null ? row.pnd53_rate + '%' : '见PND.1' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="境外公司 (PND.54)" width="160">
                <template #default="{ row }">
                  <el-tag type="danger" size="small">{{ row.pnd54_rate != null ? row.pnd54_rate + '%' : '见PND.1' }}</el-tag>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <el-col :span="10">
          <el-card>
            <template #header><h3 style="margin:0">快速计算器</h3></template>
            <el-form label-width="90px" size="small">
              <el-form-item label="付款类型">
                <el-select v-model="calcForm.payment_type" style="width:100%">
                  <el-option v-for="r in rateTable" :key="r.payment_type" :label="r.name" :value="r.payment_type" />
                </el-select>
              </el-form-item>
              <el-form-item label="付款金额">
                <el-input-number v-model="calcForm.payment_amount" :min="0" :precision="2" style="width:100%" controls-position="right" />
              </el-form-item>
              <el-form-item label="收款方">
                <el-radio-group v-model="calcForm.payee_type">
                  <el-radio value="domestic">国内法人</el-radio>
                  <el-radio value="foreign">境外公司</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>

            <el-descriptions v-if="calcResult" :column="1" border size="small" style="margin-top:12px">
              <el-descriptions-item label="类型">{{ calcResult.name }}</el-descriptions-item>
              <el-descriptions-item label="税率">{{ calcResult.rate }}%</el-descriptions-item>
              <el-descriptions-item label="预扣税额">
                <span style="color:#f56c6c;font-weight:bold">{{ calcResult.wht_amount.toFixed(2) }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="实付金额">{{ calcResult.net_payment.toFixed(2) }}</el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>
      </el-row>

      <!-- 区域二：录入明细 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <div class="card-header">
            <h3>录入预扣税明细</h3>
            <div style="display:flex;gap:8px;align-items:center">
              <span>申报类型：</span>
              <el-select v-model="reportType" style="width:120px" size="small">
                <el-option label="PND.53" value="pnd53" />
                <el-option label="PND.54" value="pnd54" />
              </el-select>
              <el-button size="small" @click="addDetailRow"><el-icon><Plus /></el-icon> 添加行</el-button>
            </div>
          </div>
        </template>

        <el-table :data="detailRows" border size="small">
          <el-table-column label="#" width="40"><template #default="{ $index }">{{ $index + 1 }}</template></el-table-column>
          <el-table-column label="付款日期" width="150">
            <template #default="{ row }">
              <el-date-picker v-model="row.payment_date" type="date" value-format="YYYY-MM-DD" placeholder="日期" size="small" style="width:130px" />
            </template>
          </el-table-column>
          <el-table-column label="收款方" min-width="140">
            <template #default="{ row }">
              <el-input v-model="row.payee_name" size="small" placeholder="名称" />
            </template>
          </el-table-column>
          <el-table-column label="收款方税号" width="150">
            <template #default="{ row }">
              <el-input v-model="row.payee_tax_id" size="small" placeholder="税号" />
            </template>
          </el-table-column>
          <el-table-column label="付款类型" width="120">
            <template #default="{ row }">
              <el-select v-model="row.payment_type" size="small" @change="onPaymentTypeChange(row)">
                <el-option v-for="r in rateTable" :key="r.payment_type" :label="r.name" :value="r.payment_type" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="金额" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.payment_amount" :min="0" :precision="2" size="small" controls-position="right" style="width:100px" @change="calcWht(row)" />
            </template>
          </el-table-column>
          <el-table-column label="税率%" width="70">
            <template #default="{ row }">{{ row.wht_rate }}</template>
          </el-table-column>
          <el-table-column label="预扣税额" width="120">
            <template #default="{ row }">{{ row.wht_amount ? parseFloat(row.wht_amount).toFixed(2) : '0.00' }}</template>
          </el-table-column>
          <el-table-column label="摘要" min-width="140">
            <template #default="{ row }">
              <el-input v-model="row.description" size="small" placeholder="摘要" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="60">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="removeDetailRow($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center">
          <div style="font-size:14px">
            付款总额：<b>{{ totalPayment.toLocaleString() }}</b> THB &nbsp;|&nbsp;
            预扣税总额：<b style="color:#f56c6c">{{ totalWht.toFixed(2) }}</b> THB &nbsp;|&nbsp;
            共 <b>{{ detailRows.length }}</b> 笔
          </div>
          <el-button type="primary" size="large" :loading="saving" :disabled="detailRows.length === 0 || !canSave" @click="saveReport">
            保存申报
          </el-button>
        </div>
      </el-card>

      <!-- 区域三：申报历史 -->
      <el-card>
        <template #header><h3 style="margin:0">申报历史</h3></template>
        <el-table :data="reports" v-loading="loadingReports" stripe size="small">
          <el-table-column label="类型" width="90">
            <template #default="{ row }">
              <el-tag :type="row.report_type === 'pnd53' ? 'warning' : 'danger'" size="small">{{ row.report_type.toUpperCase() }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="付款总额" width="140" align="right">
            <template #default="{ row }">{{ parseFloat(row.total_payment).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="预扣税总额" width="140" align="right">
            <template #default="{ row }">{{ parseFloat(row.total_wht).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column label="明细" width="70" align="center">
            <template #default="{ row }">{{ row.detail_count || row.entry_count }}</template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.status === 'filed' ? 'success' : 'info'" size="small">
                {{ row.status === 'filed' ? '已申报' : '草稿' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="220">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="viewDetail(row)">查看明细</el-button>
              <el-button link type="warning" size="small" @click="downloadBatch(row)">批量下载</el-button>
              <el-button link type="success" size="small" :disabled="row.status === 'filed'" @click="fileReport(row)">标记已申报</el-button>
              <el-button link type="danger" size="small" :disabled="row.status !== 'draft'" @click="deleteReport(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-if="!loadingReports && reports.length === 0" description="暂无申报记录" />
      </el-card>
    </template>

    <el-empty v-else description="请选择客户公司和会计期间" />

    <!-- 明细弹窗 -->
    <el-dialog v-model="detailVisible" title="申报明细" width="800px">
      <el-table :data="viewingDetails" stripe size="small">
        <el-table-column label="日期" width="110">
          <template #default="{ row }">{{ row.payment_date ? row.payment_date.substring(0,10) : '' }}</template>
        </el-table-column>
        <el-table-column prop="payee_name" label="收款方" min-width="140" />
        <el-table-column prop="payment_type" label="类型" width="100" />
        <el-table-column label="金额" width="110" align="right">
          <template #default="{ row }">{{ parseFloat(row.payment_amount).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="税率" width="60">
          <template #default="{ row }">{{ row.wht_rate }}%</template>
        </el-table-column>
        <el-table-column label="预扣税" width="110" align="right">
          <template #default="{ row }">{{ parseFloat(row.wht_amount).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="downloadCert(row)">50 Tavi</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
const store = useCompanyStore()

import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'
import { useCompanyStore } from '../stores/currentCompany'

const companies = ref([])
const periods = ref([])
const rateTable = ref([])
const reports = ref([])
const detailRows = ref([])
const viewingDetails = ref([])
const loadingReports = ref(false)
const saving = ref(false)
const detailVisible = ref(false)
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const reportType = ref('pnd53')

const calcForm = ref({ payment_type: 'service', payment_amount: 10000, payee_type: 'domestic' })
const calcResult = ref(null)

const totalPayment = computed(() => detailRows.value.reduce((s, r) => s + (parseFloat(r.payment_amount) || 0), 0))
const totalWht = computed(() => detailRows.value.reduce((s, r) => s + (parseFloat(r.wht_amount) || 0), 0))
const canSave = computed(() => detailRows.value.every(r => r.payment_date && r.payee_name && r.payment_type && parseFloat(r.payment_amount) > 0 && parseFloat(r.wht_rate) > 0))

const emptyDetail = () => ({ payment_date: '', payee_name: '', payee_tax_id: '', payment_type: 'service', payment_amount: 0, wht_rate: 3, wht_amount: 0, description: '' })

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('WhtReport.vue: 请求失败', e) }
}
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const fetchRates = async () => {
  try { rateTable.value = await api.get('/wht/rates') } catch (e) { console.error('WhtReport.vue: 请求失败', e) }
}
const fetchReports = async () => {
  loadingReports.value = true
  try {
    reports.value = await api.get('/wht/reports', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch { reports.value = [] } finally { loadingReports.value = false }
}

const onCompanyChange = () => { selectedPeriodId.value = null; reports.value = []; fetchPeriods() }
const onPeriodChange = () => { fetchReports() }

const onPaymentTypeChange = (row) => {
  const rt = rateTable.value.find(r => r.payment_type === row.payment_type)
  if (!rt) return
  row.wht_rate = reportType.value === 'pnd53' ? rt.pnd53_rate : rt.pnd54_rate
  calcWht(row)
}

const calcWht = (row) => {
  row.wht_amount = Math.round((parseFloat(row.payment_amount) || 0) * (parseFloat(row.wht_rate) || 0)) / 100
}

const addDetailRow = () => detailRows.value.push(emptyDetail())
const removeDetailRow = (i) => { if (detailRows.value.length > 1) detailRows.value.splice(i, 1) }

// Calculator
watch([() => calcForm.value.payment_type, () => calcForm.value.payment_amount, () => calcForm.value.payee_type], () => {
  const rt = rateTable.value.find(r => r.payment_type === calcForm.value.payment_type)
  if (!rt) { calcResult.value = null; return }
  const rate = calcForm.value.payee_type === 'domestic' ? rt.pnd53_rate : rt.pnd54_rate
  if (rate == null) { calcResult.value = null; return }
  const wht = Math.round(calcForm.value.payment_amount * rate) / 100
  calcResult.value = {
    name: rt.name,
    rate,
    wht_amount: wht,
    net_payment: calcForm.value.payment_amount - wht,
  }
})

const saveReport = async () => {
  if (!canSave.value) { ElMessage.error('请完善所有明细'); return }
  saving.value = true
  try {
    await api.post('/wht/reports', {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      report_type: reportType.value,
      details: detailRows.value,
    })
    ElMessage.success('申报保存成功')
    detailRows.value = [emptyDetail()]
    fetchReports()
  } catch (e) { ElMessage.error(e.response?.data?.error || '保存失败') } finally { saving.value = false }
}

const viewDetail = async (row) => {
  try {
    const res = await api.get(`/wht/reports/${row.id}`)
    viewingDetails.value = res.details
    detailVisible.value = true
  } catch { ElMessage.error('加载失败') }
}

const downloadCert = async (detail) => {
  try {
    const res = await api.get(`/wht/50-tavi/${detail.id}`)
    window.open(res.url, '_blank')
  } catch { ElMessage.error('生成失败') }
}

const downloadBatch = async (row) => {
  try {
    const res = await api.get('/wht/50-tavi-batch', { params: { report_id: row.id } })
    window.open(res.url, '_blank')
  } catch { ElMessage.error('批量生成失败') }
}

const fileReport = async (row) => {
  try {
    await ElMessageBox.confirm(`确定将 ${row.report_type.toUpperCase()} 申报标记为已申报吗？`, '确认', { type: 'warning' })
    await api.put(`/wht/reports/${row.id}/status`, { status: 'filed' })
    ElMessage.success('已标记为已申报')
    fetchReports()
  } catch (e) { if (e !== 'cancel') ElMessage.error('操作失败') }
}

const deleteReport = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该申报吗？', '确认', { type: 'warning' })
    await api.delete(`/wht/reports/${row.id}`)
    ElMessage.success('删除成功')
    fetchReports()
  } catch (e) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(() => { fetchCompanies(); fetchRates(); detailRows.value.push(emptyDetail()) })
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header h3 { margin: 0; font-size: 16px; }
</style>
