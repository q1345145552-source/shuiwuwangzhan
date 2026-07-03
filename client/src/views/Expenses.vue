<template>
  <div class="expenses">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">费用管理</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="onPeriodChange"
        />
      </div>
    </el-card>

    <el-alert v-if="isPeriodLocked" title="该会计期间已锁定，数据为只读状态" type="warning" show-icon :closable="false" style="margin-bottom:16px" />
    <el-skeleton v-if="selectedPeriodId && skeletonLoading" :rows="8" animated style="padding:16px" />
    <template v-if="selectedPeriodId">
      <el-tabs v-model="activeTab">
        <!-- Tab 1: 费用录入 -->
        <el-tab-pane label="费用录入" name="entry">
          <el-card style="margin-bottom:12px">
            <template #header>
              <div class="card-header">
                <h3>批量录入费用
        <el-button size="small" style="margin-left:8px" @click="exportXlsx">📥 Excel</el-button></h3>
                <div style="display:flex;gap:8px">
                  <el-button size="small" @click="importFromInvoice" :disabled="!selectedPeriodId">从进项发票导入</el-button>
                  <el-button size="small" @click="addRow">+ 添加行</el-button>
                </div>
              </div>
            </template>

            <div style="overflow-x:auto">
              <el-table :data="entryRows" border size="small" style="min-width:1400px">
                <el-table-column label="#" width="35"><template #default="{ $index }">{{ $index+1 }}</template></el-table-column>
                <el-table-column label="日期" width="140">
                  <template #default="{ row }"><el-date-picker v-model="row.expense_date" type="date" value-format="YYYY-MM-DD" size="small" style="width:120px" /></template>
                </el-table-column>
                <el-table-column label="类别" width="110">
                  <template #default="{ row }">
                    <el-select v-model="row.category" size="small">
                      <el-option v-for="c in expenseCategories" :key="c" :label="c" :value="c" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="收款方" width="120">
                  <template #default="{ row }"><el-input v-model="row.payee_name" size="small" /></template>
                </el-table-column>
                <el-table-column label="金额(不含税)" width="120">
                  <template #default="{ row }"><el-input-number v-model="row.amount" :min="0" :precision="2" size="small" controls-position="right" style="width:100px" @change="recalcRow(row)" /></template>
                </el-table-column>
                <el-table-column label="VAT" width="80">
                  <template #default="{ row }"><el-switch v-model="row.has_vat" size="small" @change="recalcRow(row)" /></template>
                </el-table-column>
                <el-table-column label="VAT金额" width="95">
                  <template #default="{ row }">
                    <el-input-number v-if="row.has_vat" v-model="row.vat_amount" :min="0" :precision="2" size="small" controls-position="right" style="width:80px" @change="recalcRow(row)" />
                    <span v-else style="color:#999">--</span>
                  </template>
                </el-table-column>
                <el-table-column label="含税" width="95">
                  <template #default="{ row }">{{ row.total_amount?.toFixed(2) || '0.00' }}</template>
                </el-table-column>
                <el-table-column label="WHT" width="70">
                  <template #default="{ row }"><el-switch v-model="row.has_wht" size="small" @change="recalcRow(row)" /></template>
                </el-table-column>
                <el-table-column label="WHT%" width="65">
                  <template #default="{ row }">
                    <el-input-number v-if="row.has_wht" v-model="row.wht_rate" :min="0" :max="15" :precision="2" size="small" style="width:55px" @change="recalcRow(row)" />
                  </template>
                </el-table-column>
                <el-table-column label="WHT金额" width="90">
                  <template #default="{ row }">{{ row.wht_amount?.toFixed(2) || '0.00' }}</template>
                </el-table-column>
                <el-table-column label="摘要" width="120">
                  <template #default="{ row }"><el-input v-model="row.notes" size="small" /></template>
                </el-table-column>
                <el-table-column label="操作" width="45">
                  <template #default="{ $index }"><el-button link type="danger" size="small" @click="entryRows.splice($index,1)">✕</el-button></template>
                </el-table-column>
              </el-table>
            </div>
            <div style="margin-top:8px;text-align:right">
              <el-button type="primary" :loading="saving" @click="submitEntry">提交费用</el-button>
            </div>
          </el-card>

          <!-- 从进项发票导入弹窗 -->
          <el-dialog v-model="invoiceDialogVisible" title="从进项发票导入费用" width="700px">
            <el-table :data="inputInvoices" @selection-change="val => selectedInputs = val.map(v=>v.id)" stripe size="small" max-height="400">
              <el-table-column type="selection" width="45" />
              <el-table-column label="日期" width="110"><template #default="{r}">{{ r.invoice_date?.substring(0,10) }}</template></el-table-column>
              <el-table-column prop="supplier_name" label="供应商" min-width="130" />
              <el-table-column label="类别" width="80"><template #default="{r}"><el-tag size="small">{{ r.category }}</el-tag></template></el-table-column>
              <el-table-column label="不含税" width="100" align="right"><template #default="{r}">{{ parseFloat(r.amount_ex_vat).toLocaleString() }}</template></el-table-column>
              <el-table-column label="VAT" width="80" align="right"><template #default="{r}">{{ parseFloat(r.vat_amount).toLocaleString() }}</template></el-table-column>
            </el-table>
            <template #footer>
              <el-button @click="invoiceDialogVisible=false">取消</el-button>
              <el-button type="primary" :loading="importing" @click="doImport">导入选中 ({{ selectedInputs.length }})</el-button>
            </template>
          </el-dialog>
        </el-tab-pane>

        <!-- Tab 2: 费用列表 -->
        <el-tab-pane label="费用列表" name="list">
          <el-card v-loading="listLoading">
            <template #header>
              <div class="card-header">
                <h3>费用明细</h3>
                <span>合计: {{ listTotal.toLocaleString() }} THB | WHT: {{ listWhtTotal.toLocaleString() }} THB</span>
              </div>
            </template>

            <el-collapse v-model="expandedCategories">
              <el-collapse-item v-for="cat in groupedExpenses" :key="cat.category" :name="cat.category">
                <template #title>
                  <span style="font-weight:bold">{{ cat.category }}</span>
                  <el-tag size="small" style="margin-left:8px">{{ cat.items.length }} 条</el-tag>
                  <span style="margin-left:12px;color:#409eff">合计: {{ cat.total.toLocaleString() }} THB</span>
                </template>

                <el-table :data="cat.items" stripe size="small">
                  <el-table-column label="日期" width="110"><template #default="{r}">{{ r.expense_date?.substring(0,10) }}</template></el-table-column>
                  <el-table-column prop="payee_name" label="收款方" min-width="120" />
                  <el-table-column prop="description" label="说明" min-width="140" />
                  <el-table-column label="金额" width="110" align="right"><template #default="{r}">{{ parseFloat(r.amount).toLocaleString() }}</template></el-table-column>
                  <el-table-column label="VAT" width="80" align="right"><template #default="{r}">{{ parseFloat(r.vat_amount||0).toLocaleString() }}</template></el-table-column>
                  <el-table-column label="WHT" width="90" align="right">
                    <template #default="{r}">{{ r.has_wht ? parseFloat(r.wht_amount).toLocaleString() : '-' }}</template>
                  </el-table-column>
                  <el-table-column label="WHT凭证" width="120">
                    <template #default="{r}">
                      <el-input v-if="r.has_wht" v-model="r.wht_certificate_no" size="small" placeholder="凭证号" @blur="updateWhtInfo(r)" />
                    </template>
                  </el-table-column>
                  <el-table-column label="CIT抵扣" width="80">
                    <template #default="{r}">
                      <el-switch v-if="r.has_wht" v-model="r.wht_deducted_for_cit" size="small" @change="updateWhtInfo(r)" />
                    </template>
                  </el-table-column>
                  <el-table-column label="操作" width="50">
                    <template #default="{r}"><el-button link type="danger" size="small" @click="delExpense(r)">删除</el-button></template>
                  </el-table-column>
                </el-table>
              </el-collapse-item>
            </el-collapse>
            <el-empty v-if="groupedExpenses.length===0" description="暂无费用记录" />
          </el-card>

          <!-- WHT 抵免汇总 -->
          <el-card style="margin-top:16px;background:#fdf6ec" v-if="selectedCompanyId">
            <template #header><h3 style="margin:0">WHT 抵免汇总（全年）</h3></template>
            <el-row :gutter="16" v-loading="whtLoading">
              <el-col :span="8"><el-statistic title="全年WHT合计" :value="whtSummary?.total_wht || 0" prefix="฿" /></el-col>
              <el-col :span="8"><el-statistic title="已抵扣" :value="whtSummary?.deducted || 0" prefix="฿" /></el-col>
              <el-col :span="8"><el-statistic title="待抵扣" :value="whtSummary?.pending || 0" prefix="฿" /></el-col>
            </el-row>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </template>

    <el-empty v-else description="请选择客户公司和会计期间" />
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
const activeTab = ref('entry')
const saving = ref(false), listLoading = ref(false), importing = ref(false), whtLoading = ref(false)

const expenseCategories = ['purchase','rental','salary','advertising','shipping','utility','warehouse','professional','other']

const entryRows = ref(Array.from({length:5}, () => ({ expense_date:'', category:'purchase', payee_name:'', amount:0, has_vat:false, vat_amount:0, total_amount:0, has_wht:false, wht_rate:3, wht_amount:0, notes:'' })))

const expenseList = ref([])
const inputInvoices = ref([]), selectedInputs = ref([]), invoiceDialogVisible = ref(false)
const whtSummary = ref(null)

const groupedExpenses = computed(() => {
  const map = {}
  for (const e of expenseList.value) {
    const cat = e.category || 'other'
    if (!map[cat]) map[cat] = { category: cat, items: [], total: 0 }
    map[cat].items.push(e)
    map[cat].total += parseFloat(e.amount || 0)
  }
  return Object.values(map).sort((a,b) => a.category.localeCompare(b.category))
})
const expandedCategories = computed(() => groupedExpenses.value.map(g => g.category))
const listTotal = computed(() => expenseList.value.reduce((s,e) => s + parseFloat(e.amount||0), 0))
const listWhtTotal = computed(() => expenseList.value.filter(e=>e.has_wht).reduce((s,e) => s + parseFloat(e.wht_amount||0), 0))

const recalcRow = (row) => {
  const vat = row.has_vat ? (row.vat_amount || Math.round(row.amount*7)/100) : 0
  row.vat_amount = row.has_vat ? vat : 0
  row.total_amount = Math.round((row.amount + vat)*100)/100
  row.wht_amount = row.has_wht ? Math.round(row.amount * (row.wht_rate||0))/100 : 0
}

const fetchCompanies = async () => { try { companies.value = await api.get('/companies') } catch (e) { console.error('Expenses.vue: 请求失败', e) } }
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const isPeriodLocked = computed(() => {
  const p = periods.value.find(p => p.id === selectedPeriodId.value)
  return p?.status === 'locked'
})

const onCompanyChange = () => { selectedPeriodId.value = null; fetchPeriods() }

const fetchExpenses = async () => {
  listLoading.value = true
  try { expenseList.value = await api.get('/expenses',{params:{company_id:selectedCompanyId.value,period_id:selectedPeriodId.value}}) } catch { expenseList.value=[] }
  finally { listLoading.value = false }
}
const fetchWhtSummary = async () => {
  whtLoading.value = true
  try {
    const year = new Date().getFullYear()
    whtSummary.value = await api.get('/expenses/wht-summary',{params:{company_id:selectedCompanyId.value,year}})
  } catch { whtSummary.value = null } finally { whtLoading.value = false }
}

const onPeriodChange = () => { fetchExpenses(); fetchWhtSummary() }

const addRow = () => entryRows.value.push({ expense_date:'', category:'purchase', payee_name:'', amount:0, has_vat:false, vat_amount:0, total_amount:0, has_wht:false, wht_rate:3, wht_amount:0, notes:'' })
const submitEntry = async () => {
  const valid = entryRows.value.filter(r => r.expense_date && r.category && r.amount > 0)
  if (valid.length===0) { ElMessage.error('无有效数据'); return }
  saving.value = true
  try {
    await api.post('/expenses/batch',{company_id:selectedCompanyId.value,period_id:selectedPeriodId.value,entries:valid})
    ElMessage.success(`录入${valid.length}条`)
    entryRows.value = Array.from({length:5}, ()=>({ expense_date:'', category:'purchase', payee_name:'', amount:0, has_vat:false, vat_amount:0, total_amount:0, has_wht:false, wht_rate:3, wht_amount:0, notes:'' }))
    fetchExpenses(); fetchWhtSummary()
  } catch(e) { ElMessage.error(e.response?.data?.error||'失败') } finally { saving.value = false }
}

const importFromInvoice = async () => {
  try {
    inputInvoices.value = await api.get('/vat-details/input',{params:{company_id:selectedCompanyId.value,period_id:selectedPeriodId.value,limit:100}})
    invoiceDialogVisible.value = true
  } catch { ElMessage.error('加载进项失败') }
}
const doImport = async () => {
  if (selectedInputs.value.length===0) { ElMessage.error('请选择至少一条'); return }
  importing.value = true
  try {
    const r = await api.post('/expenses/from-invoice',{company_id:selectedCompanyId.value,period_id:selectedPeriodId.value,input_detail_ids:selectedInputs.value})
    ElMessage.success(r.message)
    invoiceDialogVisible.value = false; fetchExpenses()
  } catch(e) { ElMessage.error(e.response?.data?.error||'失败') } finally { importing.value = false }
}

const updateWhtInfo = async (r) => {
  try {
    await api.put(`/expenses/${r.id}/wht-info`, {
      has_wht: r.has_wht, wht_rate: r.wht_rate, wht_amount: r.wht_amount,
      wht_certificate_no: r.wht_certificate_no, wht_deducted_for_cit: r.wht_deducted_for_cit
    })
    fetchWhtSummary()
  } catch { ElMessage.error('更新失败') }
}

const delExpense = async (r) => {
  try { await ElMessageBox.confirm('删除该费用？','确认',{type:'warning'}); await api.delete(`/expenses/${r.id}`); ElMessage.success('已删除'); fetchExpenses(); fetchWhtSummary() }
  catch(e) { if(e!=='cancel') ElMessage.error('删除失败') }
}

watch(activeTab, (t) => { if (t==='list') fetchExpenses() })

onMounted(fetchCompanies)

function exportXlsx() { const cid=companyId.value, pid=periodId?.value||ssPeriodId?.value; if(!pid||!cid) return; downloadFile('/api/export/expenses/xlsx','expenses.xlsx',{company_id:cid,period_id:pid}) }
</script>

<style scoped>
.card-header { display:flex; justify-content:space-between; align-items:center }
.card-header h3 { margin:0; font-size:16px }
</style>
