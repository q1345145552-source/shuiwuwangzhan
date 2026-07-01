<template>
  <div class="bank-transactions">
    <!-- 筛选 -->
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">银行流水</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="onPeriodChange"
          :show-lock-badge="true"
        />
      </div>
    </el-card>

    <el-row v-if="selectedPeriodId" :gutter="16">
      <!-- 上半：录入区 -->
      <el-col :span="24">
        <el-card style="margin-bottom:16px">
          <template #header>
            <div class="card-header">
              <h3>录入银行流水</h3>
              <div style="display:flex;gap:8px">
                <el-button size="small" @click="downloadTemplate">下载 CSV 模板</el-button>
                <el-upload :auto-upload="false" :show-file-list="false" :on-change="handleCsvUpload" accept=".csv">
                  <el-button size="small" type="warning">CSV 导入</el-button>
                </el-upload>
              </div>
            </div>
          </template>

          <el-form :inline="true" :model="addForm" size="small">
            <el-form-item label="银行账户">
              <el-input v-model="addForm.bank_account" placeholder="SCB-xxx" style="width:160px" />
            </el-form-item>
            <el-form-item label="日期">
              <el-date-picker v-model="addForm.transaction_date" type="date" value-format="YYYY-MM-DD" style="width:150px" />
            </el-form-item>
            <el-form-item label="类型">
              <el-select v-model="addForm.type" style="width:100px">
                <el-option label="收入" value="income" />
                <el-option label="支出" value="expense" />
              </el-select>
            </el-form-item>
            <el-form-item label="泰铢">
              <el-input-number v-model="addForm.amount_thb" :min="0" :precision="2" style="width:140px" />
            </el-form-item>
            <el-form-item label="人民币">
              <el-input-number v-model="addForm.amount_cny" :min="0" :precision="2" style="width:140px" />
            </el-form-item>
            <el-form-item label="摘要">
              <el-input v-model="addForm.description" style="width:200px" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="saving" @click="addSingle">新增</el-button>
            </el-form-item>
          </el-form>

          <el-alert v-if="importResult" :title="importResult" type="success" show-icon closable @close="importResult=''" style="margin-top:8px" />
        </el-card>
      </el-col>

      <!-- 下半：流水列表 -->
      <el-col :span="24">
        <el-card>
          <template #header>
            <div class="card-header">
              <h3>流水列表（{{ bankRows.length }} 条）</h3>
              <el-tag v-if="unmatchedCount > 0" type="warning" size="small">{{ unmatchedCount }} 条未匹配</el-tag>
            </div>
          </template>

          <el-table :data="bankRows" v-loading="loading" stripe size="small">
            <el-table-column label="日期" width="120">
              <template #default="{ row }">{{ row.transaction_date ? row.transaction_date.substring(0,10) : '' }}</template>
            </el-table-column>
            <el-table-column prop="bank_account" label="账户" width="140" />
            <el-table-column label="类型" width="80">
              <template #default="{ row }">
                <el-tag :type="row.type === 'income' ? 'success' : 'danger'" size="small">
                  {{ row.type === 'income' ? '收入' : '支出' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="泰铢" width="130" align="right">
              <template #default="{ row }">{{ parseFloat(row.amount_thb).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="人民币" width="130" align="right">
              <template #default="{ row }">{{ parseFloat(row.amount_cny).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column prop="description" label="摘要" min-width="180" />
            <el-table-column label="匹配" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.matched_entry_id" type="success" size="small">已匹配</el-tag>
                <el-button v-else link type="primary" size="small" @click="openMatchDialog(row)">匹配分录</el-button>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="60">
              <template #default="{ row }">
                <el-button link type="danger" size="small" @click="deleteRow(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-else description="请选择客户公司和会计期间" />

    <!-- 匹配分录对话框 -->
    <el-dialog v-model="matchVisible" title="匹配会计分录" width="700px">
      <p>选择与以下流水匹配的分录：</p>
      <p style="color:#999">流水：{{ matchTarget?.description }} | 金额：{{ parseFloat(matchTarget?.amount_thb || 0).toLocaleString() }} THB</p>

      <el-table :data="journalEntries" stripe size="small" max-height="400" @row-click="doMatch" style="cursor:pointer">
        <el-table-column label="日期" width="120">
          <template #default="{ row }">{{ row.entry_date ? row.entry_date.substring(0,10) : '' }}</template>
        </el-table-column>
        <el-table-column prop="account_code" label="科目" width="100" />
        <el-table-column prop="account_name" label="科目名" min-width="150" />
        <el-table-column label="借方" width="110" align="right">
          <template #default="{ row }">{{ parseFloat(row.debit_amount) > 0 ? parseFloat(row.debit_amount).toLocaleString() : '' }}</template>
        </el-table-column>
        <el-table-column label="贷方" width="110" align="right">
          <template #default="{ row }">{{ parseFloat(row.credit_amount) > 0 ? parseFloat(row.credit_amount).toLocaleString() : '' }}</template>
        </el-table-column>
        <el-table-column prop="description" label="摘要" min-width="150" />
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCompanyStore } from '../stores/currentCompany'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const store = useCompanyStore()
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'

const companies = ref([])
const periods = ref([])
const bankRows = ref([])
const journalEntries = ref([])
const loading = ref(false)
const saving = ref(false)
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const importResult = ref('')
const matchVisible = ref(false)
const matchTarget = ref(null)

const addForm = ref({
  bank_account: '', transaction_date: '', type: 'income',
  amount_thb: 0, amount_cny: 0, description: '',
})

const unmatchedCount = computed(() => bankRows.value.filter(r => !r.matched_entry_id).length)

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('BankTransactions.vue: 请求失败', e) }
}
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const isPeriodLocked = computed(() => {
  const p = periods.value.find(p => p.id === selectedPeriodId.value)
  return p?.status === 'locked'
})

const onCompanyChange = () => { selectedPeriodId.value = null; bankRows.value = []; fetchPeriods() }
const onPeriodChange = () => { fetchBank(); fetchJournal() }

const fetchBank = async () => {
  loading.value = true
  try {
    bankRows.value = await api.get('/bank', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch { ElMessage.error('加载失败') } finally { loading.value = false }
}

const fetchJournal = async () => {
  try {
    journalEntries.value = await api.get('/journal', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch { journalEntries.value = [] }
}

const addSingle = async () => {
  if (!addForm.value.transaction_date) { ElMessage.error('请选择日期'); return }
  saving.value = true
  try {
    await api.post('/bank', {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      ...addForm.value,
    })
    ElMessage.success('新增成功')
    addForm.value = { bank_account: '', transaction_date: '', type: 'income', amount_thb: 0, amount_cny: 0, description: '' }
    fetchBank()
  } catch (e) { ElMessage.error(e.response?.data?.error || '新增失败') } finally { saving.value = false }
}

const handleCsvUpload = async (uploadFile) => {
  const formData = new FormData()
  formData.append('file', uploadFile.raw)
  formData.append('company_id', selectedCompanyId.value)
  formData.append('period_id', selectedPeriodId.value)

  try {
    const res = await api.post('/bank/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    importResult.value = res.message
    fetchBank()
  } catch (e) { ElMessage.error(e.response?.data?.error || '导入失败') }
}

const downloadTemplate = () => { window.open('/api/bank/template') }

const deleteRow = async (row) => {
  try {
    await ElMessageBox.confirm('确定删除该条流水吗？', '确认', { type: 'warning' })
    await api.delete(`/bank/${row.id}`)
    ElMessage.success('删除成功')
    fetchBank()
  } catch (e) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

const openMatchDialog = (row) => {
  matchTarget.value = row
  matchVisible.value = true
}

const doMatch = async (entry) => {
  try {
    await api.put(`/bank/${matchTarget.value.id}/match`, { matched_entry_id: entry.id })
    ElMessage.success('匹配成功')
    matchVisible.value = false
    fetchBank()
  } catch (e) { ElMessage.error('匹配失败') }
}

onMounted(fetchCompanies)
</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; }
.card-header h3 { margin: 0; font-size: 16px; }
</style>
