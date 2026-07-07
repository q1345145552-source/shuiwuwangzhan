<template>
  <div class="vat-details">
    <!-- 筛选 -->
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">VAT 明细管理</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="onPeriodChange"
          :show-lock-badge="true"
        />
      </div>
    </el-card>

    <el-alert v-if="isPeriodLocked" title="该会计期间已锁定，数据为只读状态" type="warning" show-icon :closable="false" style="margin-bottom:16px" />
    <el-skeleton v-if="selectedPeriodId && skeletonLoading" :rows="8" animated style="padding:16px" />
    <template v-if="selectedPeriodId">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <!-- ========== 销项明细 ========== -->
        <el-tab-pane label="销项明细" name="output">

          <!-- 批量录入 -->
          <el-card style="margin-bottom:12px">
            <template #header>
              <div class="card-header">
                <h3>批量录入销项</h3>
                <div style="display:flex;gap:8px">
                  <el-upload :auto-upload="false" :show-file-list="false" :on-change="handleOutputCsv" accept=".csv">
                    <el-button size="small" :disabled="isPeriodLocked">CSV 导入</el-button>
                  </el-upload>
                  <el-button size="small" @click="addOutputRow">+ 行</el-button>
                </div>
              </div>
            </template>

            <el-table :data="outputRows" border size="small">
              <el-table-column label="#" width="40"><template #default="{ $index }">{{ $index+1 }}</template></el-table-column>
              <el-table-column label="日期" width="150">
                <template #default="{ row }"><el-date-picker v-model="row.invoice_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:130px" /></template>
              </el-table-column>
              <el-table-column label="客户名" width="130">
                <template #default="{ row }"><el-input v-model="row.customer_name" size="small" /></template>
              </el-table-column>
              <el-table-column label="客户税号" width="140">
                <template #default="{ row }"><el-input v-model="row.customer_tax_id" size="small" /></template>
              </el-table-column>
              <el-table-column label="说明" min-width="150">
                <template #default="{ row }"><el-input v-model="row.description" size="small" /></template>
              </el-table-column>
              <el-table-column label="不含税" width="130">
                <template #default="{ row }"><el-input-number v-model="row.amount_ex_vat" :min="0" :precision="2" size="small" controls-position="right" style="width:110px" /></template>
              </el-table-column>
              <el-table-column label="VAT(7%)" width="100">
                <template #default="{ row }">{{ ((row.amount_ex_vat||0)*0.07).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="含税" width="110">
                <template #default="{ row }">{{ ((row.amount_ex_vat||0)*1.07).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="50">
                <template #default="{ $index }"><el-button link type="danger" size="small" @click="outputRows.splice($index,1)">✕</el-button></template>
              </el-table-column>
            </el-table>
            <div style="margin-top:8px;text-align:right">
              <el-button type="primary" :loading="outSaving" @click="submitOutput">提交销项 ({{ outputRows.length }}条)</el-button>
            </div>
          </el-card>

          <!-- 销项列表 -->
          <el-card>
            <template #header>
              <div class="card-header">
                <h3>已录入销项（{{ outTotal }}条）</h3>
                <span>不含税: {{ outSummary.total_ex?.toLocaleString() }} | VAT: {{ outSummary.total_vat?.toLocaleString() }}</span>
              </div>
            </template>
            <el-table :data="outList" v-loading="outLoading" stripe size="small">
              <el-table-column label="日期" width="110"><template #default="{ row }">{{ row.invoice_date?.substring(0,10) }}</template></el-table-column>
              <el-table-column prop="customer_name" label="客户" min-width="130" />
              <el-table-column prop="description" label="说明" min-width="160" />
              <el-table-column label="不含税" width="120" align="right"><template #default="{ row }">{{ parseFloat(row.amount_ex_vat).toLocaleString() }}</template></el-table-column>
              <el-table-column label="VAT" width="100" align="right"><template #default="{ row }">{{ parseFloat(row.vat_amount).toLocaleString() }}</template></el-table-column>
              <el-table-column label="含税" width="120" align="right"><template #default="{ row }">{{ parseFloat(row.total_amount).toLocaleString() }}</template></el-table-column>
              <el-table-column label="操作" width="60"><template #default="{ row }"><el-button link type="danger" size="small" @click="delOutput(row)">删除</el-button></template></el-table-column>
            </el-table>
            <el-pagination v-if="outTotal>20" layout="prev,next" :total="outTotal" v-model:current-page="outPage" :page-size="20" @current-change="fetchOutput" small style="margin-top:8px;justify-content:flex-end" />
          </el-card>
        </el-tab-pane>

        <!-- ========== 进项明细 ========== -->
        <el-tab-pane label="进项明细" name="input">

          <!-- 批量录入 -->
          <el-card style="margin-bottom:12px">
            <template #header>
              <div class="card-header">
                <h3>批量录入进项</h3>
                <div style="display:flex;gap:8px">
                  <el-button size="small" @click="importVatVisible=true" :disabled="isPeriodLocked">进口 VAT</el-button>
                  <el-upload :auto-upload="false" :show-file-list="false" :on-change="handleInputCsv" accept=".csv">
                    <el-button size="small" :disabled="isPeriodLocked">CSV 导入</el-button>
                  </el-upload>
                  <el-button size="small" @click="addInputRow">+ 行</el-button>
                </div>
              </div>
            </template>

            <el-table :data="inputRows" border size="small">
              <el-table-column label="#" width="40"><template #default="{ $index }">{{ $index+1 }}</template></el-table-column>
              <el-table-column label="日期" width="150">
                <template #default="{ row }"><el-date-picker v-model="row.invoice_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:130px" /></template>
              </el-table-column>
              <el-table-column label="供应商" width="130">
                <template #default="{ row }"><el-input v-model="row.supplier_name" size="small" /></template>
              </el-table-column>
              <el-table-column label="类别" width="100">
                <template #default="{ row }">
                  <el-select v-model="row.category" size="small">
                    <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
                  </el-select>
                </template>
              </el-table-column>
              <el-table-column label="说明" min-width="130">
                <template #default="{ row }"><el-input v-model="row.description" size="small" /></template>
              </el-table-column>
              <el-table-column label="不含税" width="120">
                <template #default="{ row }"><el-input-number v-model="row.amount_ex_vat" :min="0" :precision="2" size="small" controls-position="right" style="width:100px" /></template>
              </el-table-column>
              <el-table-column label="VAT" width="90">
                <template #default="{ row }">{{ ((row.amount_ex_vat||0)*0.07).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="可抵扣" width="70">
                <template #default="{ row }"><el-switch v-model="row.deductible" size="small" /></template>
              </el-table-column>
              <el-table-column label="操作" width="50">
                <template #default="{ $index }"><el-button link type="danger" size="small" @click="inputRows.splice($index,1)">✕</el-button></template>
              </el-table-column>
            </el-table>
            <div style="margin-top:8px;text-align:right">
              <el-button type="primary" :loading="inSaving" @click="submitInput">提交进项 ({{ inputRows.length }}条)</el-button>
            </div>
          </el-card>

          <!-- 进项列表 -->
          <el-card>
            <template #header>
              <div class="card-header">
                <h3>已录入进项（{{ inTotal }}条）</h3>
                <div style="display:flex;gap:12px;align-items:center">
                  <el-select v-model="inCategory" size="small" style="width:120px" @change="fetchInput">
                    <el-option label="全部" value="all" />
                    <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
                  </el-select>
                  <span style="font-size:13px">可抵扣VAT: {{ inSummary.deductible_vat?.toLocaleString() }}</span>
                </div>
              </div>
            </template>
            <el-table :data="inList" v-loading="inLoading" stripe size="small">
              <el-table-column label="日期" width="110"><template #default="{ row }">{{ row.invoice_date?.substring(0,10) }}</template></el-table-column>
              <el-table-column prop="supplier_name" label="供应商" min-width="130" />
              <el-table-column label="类别" width="80">
                <template #default="{ row }"><el-tag size="small">{{ row.category }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="description" label="说明" min-width="150" />
              <el-table-column label="不含税" width="110" align="right"><template #default="{ row }">{{ parseFloat(row.amount_ex_vat).toLocaleString() }}</template></el-table-column>
              <el-table-column label="VAT" width="100" align="right"><template #default="{ row }">{{ parseFloat(row.vat_amount).toLocaleString() }}</template></el-table-column>
              <el-table-column label="可抵扣" width="80">
                <template #default="{ row }"><el-switch v-model="row.deductible" size="small" @change="toggleDeductible(row)" /></template>
              </el-table-column>
              <el-table-column label="操作" width="60"><template #default="{ row }"><el-button link type="danger" size="small" @click="delInput(row)">删除</el-button></template></el-table-column>
            </el-table>
            <el-pagination v-if="inTotal>20" layout="prev,next" :total="inTotal" v-model:current-page="inPage" :page-size="20" @current-change="fetchInput" small style="margin-top:8px;justify-content:flex-end" />
          </el-card>
        </el-tab-pane>
      </el-tabs>

      <!-- ========== 底部 VAT 对账区 ========== -->
      <el-card style="margin-top:16px;background:#fdf6ec">
        <template #header><h3 style="margin:0">VAT 对账汇总</h3></template>
        <el-descriptions :column="3" border size="default" v-loading="recLoading">
          <el-descriptions-item label="销项 VAT 合计（明细）">
            <b style="color:#f56c6c;font-size:18px">{{ reconciliation?.vat_output_total?.toLocaleString() }}</b> THB
          </el-descriptions-item>
          <el-descriptions-item label="进项 VAT 合计（可抵扣）">
            <b style="color:#67c23a;font-size:18px">{{ reconciliation?.vat_input_deductible?.toLocaleString() }}</b> THB
          </el-descriptions-item>
          <el-descriptions-item label="上月留抵">
            <el-input-number v-model="creditForward" :min="0" :precision="2" size="small" style="width:140px" @change="recalcR" />
          </el-descriptions-item>
        </el-descriptions>
        <el-divider />
        <div style="display:flex;justify-content:space-around;align-items:center">
          <div style="text-align:center">
            <div style="font-size:13px;color:#999">应缴 VAT</div>
            <div :style="{fontSize:'24px',fontWeight:'bold',color:payableVal>0?'#f56c6c':'#999'}">{{ payableVal.toLocaleString() }} THB</div>
          </div>
          <div style="text-align:center">
            <div style="font-size:13px;color:#999">留抵结转</div>
            <div :style="{fontSize:'24px',fontWeight:'bold',color:carryVal>0?'#67c23a':'#999'}">{{ carryVal.toLocaleString() }} THB</div>
          </div>
        </div>
      </el-card>
    </template>

    <el-empty v-else description="请选择客户公司和会计期间" />

    <!-- 进口VAT弹窗 -->
    <el-dialog v-model="importVatVisible" title="录入进口 VAT" width="550px">
      <el-form :model="importVat" label-width="120px">
        <el-form-item label="日期"><el-date-picker v-model="importVat.entry_date" type="date" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        <el-form-item label="报关单号"><el-input v-model="importVat.customs_doc_no" /></el-form-item>
        <el-form-item label="供应商"><el-input v-model="importVat.supplier_name" /></el-form-item>
        <el-form-item label="CIF 货值"><el-input-number v-model="importVat.cif_value" :min="0" :precision="2" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="进口关税"><el-input-number v-model="importVat.import_duty" :min="0" :precision="2" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="进口 VAT 已缴"><el-input-number v-model="importVat.import_vat_paid" :min="0" :precision="2" controls-position="right" style="width:100%" /></el-form-item>
        <el-form-item label="报关行"><el-input v-model="importVat.declarant" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="importVatVisible=false">取消</el-button>
        <el-button type="primary" :loading="importVatSaving" @click="submitImportVat">保存进口 VAT</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'
import { useCompanyStore } from '../stores/currentCompany'
import { downloadFile, openPdf } from '../api/download'

const store = useCompanyStore()
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'

const companies = ref([]), periods = ref([])
const selectedCompanyId = ref(null), selectedPeriodId = ref(null)
const activeTab = ref('output')
const creditForward = ref(0)

// Output
const outputRows = ref([]), outList = ref([]), outPage = ref(1), outTotal = ref(0)
const outLoading = ref(false), outSaving = ref(false), outSummary = ref({})

// Input
const inputRows = ref([]), inList = ref([]), inPage = ref(1), inTotal = ref(0), inCategory = ref('all')
const inLoading = ref(false), inSaving = ref(false), inSummary = ref({})

// Reconciliation
const reconciliation = ref(null), recLoading = ref(false)

// Import VAT
const importVatVisible = ref(false), importVatSaving = ref(false)
const importVat = ref({ entry_date:'', customs_doc_no:'', supplier_name:'', cif_value:0, import_duty:0, import_vat_paid:0, declarant:'' })

const categories = ['purchase','import','service','advertising','transport','rental','utility','other']

const emptyOutput = () => ({ invoice_date:'', customer_name:'', customer_tax_id:'', description:'', amount_ex_vat:0 })
const emptyInput = () => ({ invoice_date:'', supplier_name:'', category:'purchase', description:'', amount_ex_vat:0, deductible:true })

const payableVal = computed(() => {
  if (!reconciliation.value) return 0
  const out = reconciliation.value.vat_output_total || 0
  const inp = reconciliation.value.vat_input_deductible || 0
  const cf = creditForward.value || 0
  const net = out - inp - cf
  return net > 0 ? net : 0
})
const carryVal = computed(() => {
  if (!reconciliation.value) return 0
  const out = reconciliation.value.vat_output_total || 0
  const inp = reconciliation.value.vat_input_deductible || 0
  const cf = creditForward.value || 0
  const net = out - inp - cf
  return net < 0 ? Math.abs(Math.round(net*100)/100) : 0
})

// Data fetching
const fetchCompanies = async () => { try { const c = await api.get('/companies'); companies.value = Array.isArray(c) ? c : [] } catch (e) { console.error('获取公司列表失败:', e); } }
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const isPeriodLocked = computed(() => {
  const p = periods.value.find(p => p.id === selectedPeriodId.value)
  return p?.status === 'locked'
})

const onCompanyChange = () => { selectedPeriodId.value = null; fetchPeriods() }

const fetchOutput = async () => {
  outLoading.value = true
  try {
    const r = await api.get('/vat-details/output', { params: { company_id:selectedCompanyId.value, period_id:selectedPeriodId.value, page:outPage.value, limit:20 } })
    outList.value = r.rows; outTotal.value = r.total
  } catch (e) { console.error("获取销项列表失败:", e); } finally { outLoading.value = false }
}
const fetchInput = async () => {
  inLoading.value = true
  try {
    const r = await api.get('/vat-details/input', { params: { company_id:selectedCompanyId.value, period_id:selectedPeriodId.value, category:inCategory.value, page:inPage.value, limit:20 } })
    inList.value = r.rows; inTotal.value = r.total
  } catch (e) { console.error("获取进项列表失败:", e); } finally { inLoading.value = false }
}
const fetchSummaries = async () => {
  try {
    const [o,i] = await Promise.all([
      api.get('/vat-details/output/summary',{params:{company_id:selectedCompanyId.value,period_id:selectedPeriodId.value}}),
      api.get('/vat-details/input/summary',{params:{company_id:selectedCompanyId.value,period_id:selectedPeriodId.value}})
    ])
    outSummary.value = o; inSummary.value = i
  } catch (e) { console.error("获取汇总数据失败:", e); }
}
const fetchReconciliation = async () => {
  recLoading.value = true
  try {
    reconciliation.value = await api.get('/vat-details/reconciliation',{params:{company_id:selectedCompanyId.value,period_id:selectedPeriodId.value}})
  } catch (e) { console.error("获取汇总数据失败:", e); } finally { recLoading.value = false }
}

const onPeriodChange = () => {
  outputRows.value = Array.from({length:5}, emptyOutput)
  inputRows.value = Array.from({length:5}, emptyInput)
  fetchOutput(); fetchInput(); fetchSummaries(); fetchReconciliation()
}
const onTabChange = (t) => { if (t==='output') fetchOutput(); else fetchInput() }

// Output actions
const addOutputRow = () => outputRows.value.push(emptyOutput())
const submitOutput = async () => {
  const valid = outputRows.value.filter(r => r.invoice_date && r.amount_ex_vat > 0)
  if (valid.length===0) { ElMessage.error('无有效数据'); return }
  outSaving.value = true
  try {
    await api.post('/vat-details/output/batch', { company_id:selectedCompanyId.value, period_id:selectedPeriodId.value, entries:valid })
    ElMessage.success(`录入${valid.length}条`)
    outputRows.value = Array.from({length:5}, emptyOutput)
    fetchOutput(); fetchSummaries(); fetchReconciliation()
  } catch(e) { ElMessage.error(e.response?.data?.error||'失败') } finally { outSaving.value = false }
}
const delOutput = async (r) => {
  try { await ElMessageBox.confirm('删除该条销项？','确认',{type:'warning'}); await api.delete(`/vat-details/output/${r.id}`); fetchOutput(); fetchSummaries(); fetchReconciliation() }
  catch(e) { if(e!=='cancel') ElMessage.error('删除失败') }
}

// Input actions
const addInputRow = () => inputRows.value.push(emptyInput())
const submitInput = async () => {
  const valid = inputRows.value.filter(r => r.invoice_date && r.supplier_name && r.amount_ex_vat > 0)
  if (valid.length===0) { ElMessage.error('无有效数据'); return }
  inSaving.value = true
  try {
    await api.post('/vat-details/input/batch', { company_id:selectedCompanyId.value, period_id:selectedPeriodId.value, entries:valid })
    ElMessage.success(`录入${valid.length}条`)
    inputRows.value = Array.from({length:5}, emptyInput)
    fetchInput(); fetchSummaries(); fetchReconciliation()
  } catch(e) { ElMessage.error(e.response?.data?.error||'失败') } finally { inSaving.value = false }
}
const delInput = async (r) => {
  try { await ElMessageBox.confirm('删除该条进项？','确认',{type:'warning'}); await api.delete(`/vat-details/input/${r.id}`); fetchInput(); fetchSummaries(); fetchReconciliation() }
  catch(e) { if(e!=='cancel') ElMessage.error('删除失败') }
}
const toggleDeductible = async (r) => {
  try { await api.put(`/vat-details/input/${r.id}/deductible`, { deductible: r.deductible }); fetchSummaries(); fetchReconciliation() }
  catch(e) { ElMessage.error('更新失败'); r.deductible = !r.deductible }
}

// CSV uploads
const handleOutputCsv = async (uf) => {
  const fd = new FormData(); fd.append('file', uf.raw); fd.append('company_id', selectedCompanyId.value); fd.append('period_id', selectedPeriodId.value)
  try { const r = await api.post('/vat-details/output/import-csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); ElMessage.success(r.message); fetchOutput(); fetchSummaries(); fetchReconciliation() }
  catch(e) { ElMessage.error(e.response?.data?.error||'导入失败') }
}
const handleInputCsv = async (uf) => {
  const fd = new FormData(); fd.append('file', uf.raw); fd.append('company_id', selectedCompanyId.value); fd.append('period_id', selectedPeriodId.value)
  try { const r = await api.post('/vat-details/input/import-csv', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); ElMessage.success(r.message); fetchInput(); fetchSummaries(); fetchReconciliation() }
  catch(e) { ElMessage.error(e.response?.data?.error||'导入失败') }
}

// Import VAT
const submitImportVat = async () => {
  if (!importVat.value.entry_date || !importVat.value.supplier_name || !importVat.value.import_vat_paid) { ElMessage.error('请填写必填项'); return }
  importVatSaving.value = true
  try {
    await api.post('/vat-details/input/import-entry', { company_id:selectedCompanyId.value, period_id:selectedPeriodId.value, ...importVat.value })
    ElMessage.success('进口VAT已录入')
    importVatVisible.value = false
    importVat.value = { entry_date:'', customs_doc_no:'', supplier_name:'', cif_value:0, import_duty:0, import_vat_paid:0, declarant:'' }
    fetchInput(); fetchSummaries(); fetchReconciliation()
  } catch(e) { ElMessage.error('失败') } finally { importVatSaving.value = false }
}

const recalcR = () => fetchReconciliation()

onMounted(() => { fetchCompanies() })

function exportXlsx() { const cid=selectedCompanyId.value, pid=selectedPeriodId.value; if(!pid||!cid) return; downloadFile('/api/export/vat-details/xlsx','vat_details.xlsx',{company_id:cid,period_id:pid}) }
</script>

<style scoped>
.card-header { display:flex; justify-content:space-between; align-items:center }
.card-header h3 { margin:0; font-size:16px }
</style>
