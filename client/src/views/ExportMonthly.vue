<template>
  <div class="export-monthly">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">月度报表导出</span>
        <el-select v-model="selectedCompanyId" placeholder="选择客户公司" @change="onCompanyChange" style="width:220px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="selectedPeriodId" placeholder="选择会计期间" :disabled="!selectedCompanyId" style="width:220px">
          <el-option v-for="p in periods" :key="p.id" :label="p.year + '年' + p.month + '月'" :value="p.id" />
        </el-select>
      </div>
    </el-card>

    <el-card v-if="selectedPeriodId">
      <template #header><h3 style="margin:0">可用报表</h3></template>
      <el-table :data="reportItems" stripe>
        <el-table-column prop="label" label="报表名称" width="200" />
        <el-table-column prop="desc" label="说明" min-width="300" />
        <el-table-column label="操作" width="140">
          <template #default="{ row }">
            <el-button type="primary" size="small" :loading="row.loading" @click="downloadReport(row)">下载 PDF</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div style="text-align:center;margin-top:24px">
        <el-button type="success" size="large" :loading="packageLoading" @click="downloadAll">
          一键导出月度全套报表 (ZIP)
        </el-button>
        <el-button size="small" :loading="packageLoading" @click="exportAllXlsx">📥 全量 Excel</el-button>
      </div>
    </el-card>

    <el-empty v-else description="请选择客户公司和会计期间" />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import { useCompanyStore } from '../stores/currentCompany'
import { downloadFile } from '../api/download'
const store = useCompanyStore()

const companies = ref([])
const periods = ref([])
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const packageLoading = ref(false)

const reportItems = ref([
  { key: 'profit-loss', label: '利润表', desc: '月度营收、成本、费用与净利润' },
  { key: 'vat-report', label: 'VAT 申报表', desc: 'P.P.30 增值税申报简表' },
  { key: 'ecommerce-sales/xlsx', label: '电商销售明细', desc: '本期所有订单的销售、扣费、回款明细（Excel）' },
])

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('ExportMonthly.vue: 请求失败', e) }
}
const fetchPeriods = async () => { periods.value = await api.get('/periods', { params: { company_id: selectedCompanyId.value } }) }
const onCompanyChange = () => { selectedPeriodId.value = null; fetchPeriods() }

const downloadReport = async (item) => {
  item.loading = true
  try {
    const params = { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    if (item.key.endsWith('/xlsx')) {
      await downloadFile(`/api/export/${item.key}`, `${item.key.replace('/','_')}.xlsx`, params)
      ElMessage.success(`${item.label} 已导出`)
    } else {
      const res = await api.get(`/export/${item.key}`, { params })
      window.open(res.url, '_blank')
      ElMessage.success(`${item.label} 已生成`)
    }
  } catch { ElMessage.error('导出失败') } finally { item.loading = false }
}

const downloadAll = async () => {
  packageLoading.value = true
  try {
    const res = await api.get('/export/monthly-package', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value },
    })
    window.open(res.url, '_blank')
    ElMessage.success(`全套报表 ZIP 已生成，包含 ${res.files?.length || 0} 个文件`)
  } catch (e) { ElMessage.error('导出失败') } finally { packageLoading.value = false }
}

onMounted(fetchCompanies)

function exportAllXlsx() { const cid=selectedCompanyId.value, pid=selectedPeriodId.value; if(!pid||!cid) return; downloadFile('/api/export/all/xlsx','full_export.xlsx',{company_id:cid,period_id:pid}) }
</script>

<style scoped>
h3 { margin: 0; }
</style>
