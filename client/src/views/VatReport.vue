<template>
  <div class="vat-report">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">VAT 申报</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="fetchReport"
        />
        <el-button type="primary" :disabled="!report" @click="saveReport" :loading="saving">保存</el-button>
        <el-button :disabled="!report" :loading="exportLoading" @click="exportVat">导出 PDF</el-button>
        <el-button size="small" :disabled="!report" @click="exportXlsx">📥 Excel</el-button>
        <el-tag v-if="savedStatus" size="small">{{ savedStatus }}</el-tag>
      </div>
    </el-card>

    <el-skeleton v-if="loading" :rows="6" animated style="padding:16px" />
    <el-card v-if="report" v-loading="loading">
      <template #header>
        <div style="text-align:center">
          <h2 style="margin:0">P.P.30 增值税申报简表</h2>
          <p style="margin:4px 0 0;color:#999">{{ report.period.year }}年{{ report.period.month }}月</p>
          <el-tag v-if="report.from_details" type="success" size="small" style="margin-top:4px">数据来源：VAT明细表</el-tag>
          <el-tag v-else type="warning" size="small" style="margin-top:4px">数据来源：电商销售估算（请在VAT明细页录入精确数据）</el-tag>
        </div>
      </template>

      <table class="vat-table">
        <thead><tr><th>项目</th><th style="text-align:right">金额 (THB)</th></tr></thead>
        <tbody>
          <tr class="section-header"><td colspan="2">销项税计算</td></tr>
          <tr>
            <td class="indent">不含税销售收入</td>
            <td class="num">
              <el-input-number v-model="report.sales_amount" :min="0" :precision="2" controls-position="right" size="small" style="width:180px" @change="recalc" />
            </td>
          </tr>
          <tr>
            <td class="indent">VAT 销项税 (7%)</td>
            <td class="num">
              <el-input-number v-model="report.vat_sales" :min="0" :precision="2" controls-position="right" size="small" style="width:180px" @change="recalc" />
            </td>
          </tr>

          <tr class="section-header"><td colspan="2">进项税计算</td></tr>
          <tr>
            <td class="indent">VAT 进项税</td>
            <td class="num">
              <el-input-number v-model="report.vat_purchases" :min="0" :precision="2" controls-position="right" size="small" style="width:180px" @change="recalc" />
            </td>
          </tr>

          <tr class="section-header"><td colspan="2">留抵</td></tr>
          <tr>
            <td class="indent">上月留抵</td>
            <td class="num">
              <el-input-number v-model="report.credit_forward" :min="0" :precision="2" controls-position="right" size="small" style="width:180px" @change="recalc" />
            </td>
          </tr>

          <tr class="result">
            <td>应缴 VAT</td>
            <td class="num" :style="{ color: report.vat_payable > 0 ? '#f56c6c' : '#999' }">{{ report.vat_payable.toLocaleString() }}</td>
          </tr>
          <tr class="result">
            <td>留抵结转</td>
            <td class="num" :style="{ color: report.vat_credit_carry > 0 ? '#67c23a' : '#999' }">{{ report.vat_credit_carry.toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>
    </el-card>

    <el-empty v-else description="请选择客户公司和会计期间" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import { useCompanyStore } from '../stores/currentCompany'
import { downloadFile, openPdf } from '../api/download'

const store = useCompanyStore()
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'
import { ElMessage as ElMsg } from 'element-plus'

const companies = ref([])
const periods = ref([])
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const report = ref(null)
const savedStatus = ref('')
const loading = ref(false)
const saving = ref(false)

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('VatReport.vue: 请求失败', e) }
}
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const onCompanyChange = () => { selectedPeriodId.value = null; report.value = null; fetchPeriods() }

const fetchReport = async () => {
  if (!selectedPeriodId.value) return
  loading.value = true
  try {
    report.value = await api.get('/vat-report', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
    savedStatus.value = report.value.saved ? '已保存' : ''
    // Auto-fill credit_forward from saved record
    if (report.value.saved && report.value.saved.credit_forward > 0) {
      report.value.credit_forward = parseFloat(report.value.saved.credit_forward) || 0
    }
  } catch (e) { ElMessage.error('加载失败') } finally { loading.value = false }
}

const recalc = () => {
  const r = report.value
  const net = r.vat_sales - r.vat_purchases - r.credit_forward
  r.vat_payable = net > 0 ? Math.round(net * 100) / 100 : 0
  r.vat_credit_carry = net < 0 ? Math.round(Math.abs(net) * 100) / 100 : 0
}

const saveReport = async () => {
  saving.value = true
  try {
    const r = report.value
    await api.post('/vat-report', {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      ...r,
      status: 'draft',
    })
    savedStatus.value = '已保存'
    ElMessage.success('保存成功')
  } catch (e) { ElMessage.error('保存失败') } finally { saving.value = false }
}

const exportLoading = ref(false)
const exportVat = async () => {
  if (!selectedPeriodId.value) return
  exportLoading.value = true
  try {
    const res = await api.get('/export/vat-report', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
    window.open(res.url, '_blank')
    ElMessage.success('VAT 申报 PDF 已生成')
  } catch (e) { ElMessage.error('导出失败') } finally { exportLoading.value = false }
}

onMounted(fetchCompanies)

function exportXlsx() { const cid=selectedCompanyId.value, pid=selectedPeriodId.value; if(!pid||!cid) return; downloadFile('/api/export/vat-report/xlsx','vat_report.xlsx',{company_id:cid,period_id:pid}) }
</script>

<style scoped>
.vat-table { width:100%; border-collapse:collapse; font-size:15px }
.vat-table th { background:#f5f7fa; padding:10px 16px; border-bottom:2px solid #e4e7ed; text-align:left }
.vat-table td { padding:8px 16px; border-bottom:1px solid #ebeef5 }
.vat-table .section-header td { background:#fdf6ec; font-weight:bold; padding:8px 16px }
.vat-table .indent { padding-left:36px }
.vat-table .num { text-align:right }
.vat-table .result td { font-weight:bold; font-size:16px; padding:12px 16px; border-top:2px solid #409eff; border-bottom:2px solid #409eff }
</style>
