<template>
  <div class="page">
    <div class="page-header">
      <el-select v-model="companyId" placeholder="客户公司" @change="loadAll" style="width:220px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <!-- ========== Tab 1: 员工管理 ========== -->
      <el-tab-pane label="👥 员工管理" name="employees">
        <el-button type="primary" @click="openEmpDialog()" style="margin-bottom:12px">+ 新增员工</el-button>
        <el-table :data="employees" border stripe v-loading="empLoading">
          <el-table-column prop="employee_code" label="编号" width="100" />
          <el-table-column prop="full_name" label="姓名" width="150" />
          <el-table-column prop="nationality" label="国籍" width="80" />
          <el-table-column prop="position" label="职位" width="130" />
          <el-table-column label="月薪 (THB)" width="130">
            <template #default="{ row }">{{ fmt(row.salary) }}</template>
          </el-table-column>
          <el-table-column label="社保基数" width="110">
            <template #default="{ row }">{{ fmt(row.social_security_base) }}</template>
          </el-table-column>
          <el-table-column label="入职日期" width="110" prop="start_date" />
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'info'" size="small">{{ row.is_active ? '在职' : '离职' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="220" fixed="right">
            <template #default="{ row }">
              <el-button size="small" @click="openEmpDialog(row)">编辑</el-button>
              <el-button v-if="row.is_active" size="small" type="warning" @click="resignEmployee(row)">离职</el-button>
              <el-button size="small" type="danger" @click="deleteEmployee(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- ========== Tab 2: 社保缴纳 ========== -->
      <el-tab-pane label="🏥 社保缴纳" name="ss">
        <el-row style="margin-bottom:12px;align-items:center" :gutter="12">
          <el-col :span="8">
            <el-select v-model="ssPeriodId" placeholder="选择会计期间" filterable style="width:100%">
              <el-option v-for="p in periods" :key="p.id" :label="p.year + '年' + p.month + '月'" :value="p.id" />
            </el-select>
          </el-col>
          <el-col :span="4">
            <el-button type="primary" @click="calcSocialSecurity" :loading="ssCalcLoading" :disabled="!ssPeriodId">计算本月社保</el-button>
          </el-col>
        </el-row>

        <el-table :data="ssRecords" border stripe v-loading="ssLoading">
          <el-table-column prop="employee_name" label="员工" width="150" />
          <el-table-column label="月薪" width="120"><template #default="{row}">{{ fmt(row.salary) }}</template></el-table-column>
          <el-table-column label="社保基数" width="110"><template #default="{row}">{{ fmt(row.ss_base) }}</template></el-table-column>
          <el-table-column label="雇主 5%" width="120"><template #default="{row}">{{ fmt(row.employer_contribution) }}</template></el-table-column>
          <el-table-column label="员工 5%" width="120"><template #default="{row}">{{ fmt(row.employee_contribution) }}</template></el-table-column>
          <el-table-column label="合计 10%" width="120"><template #default="{row}">{{ fmt(row.total_contribution) }}</template></el-table-column>
          <el-table-column label="已缴纳" width="120">
            <template #default="{row}">
              <el-tag :type="row.paid ? 'success' : 'warning'" size="small">{{ row.paid ? '✅ ' + row.paid_date : '待缴' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{row}">
              <el-button v-if="!row.paid" size="small" type="primary" @click="markSsPaid(row)">标记已缴</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="ssSummary" class="ss-summary">
          <span>雇主合计：<b>{{ fmt(ssSummary.employer) }} THB</b></span>
          <span>员工合计：<b>{{ fmt(ssSummary.employee) }} THB</b></span>
          <span>总计：<b style="color:#409eff">{{ fmt(ssSummary.total) }} THB</b></span>
          <span>人数：{{ ssSummary.count }}</span>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 员工表单弹窗 -->
    <el-dialog v-model="empDialogVisible" :title="empDialogTitle" width="550px">
      <el-form :model="empForm" label-width="110px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="员工编号" required><el-input v-model="empForm.employee_code" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="姓名" required><el-input v-model="empForm.full_name" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="国籍"><el-input v-model="empForm.nationality" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="身份证/护照号"><el-input v-model="empForm.id_card_no" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="职位"><el-input v-model="empForm.position" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="月薪 (THB)" required><el-input-number v-model="empForm.salary" :min="0" :precision="2" style="width:100%" /></el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="社保基数"><el-input-number v-model="empForm.social_security_base" :min="0" :precision="2" style="width:100%" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="入职日期" required>
              <el-date-picker v-model="empForm.start_date" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="empForm.notes" type="textarea" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="empDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="empSaveLoading" @click="saveEmployee">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const fmt = v => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const companyId = ref(null)
const companies = ref([])
const activeTab = ref('employees')

// -- Employee tab --
const employees = ref([])
const empLoading = ref(false)
const empDialogVisible = ref(false)
const empDialogTitle = ref('新增员工')
const empSaveLoading = ref(false)
const empForm = reactive({ id: null, company_id: null, employee_code: '', full_name: '', nationality: 'ไทย', id_card_no: '', position: '', salary: 0, social_security_base: null, start_date: '', notes: '' })

// -- SS tab --
const periods = ref([])
const ssPeriodId = ref(null)
const ssRecords = ref([])
const ssSummary = ref(null)
const ssLoading = ref(false)
const ssCalcLoading = ref(false)

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = Array.isArray(data) ? data : []
  if (companies.value.length) { companyId.value = companies.value[0].id; loadAll() }
}

async function loadAll() {
  if (!companyId.value) return
  await Promise.all([loadEmployees(), loadPeriods()])
  if (ssPeriodId.value) loadSsRecords()
}

async function loadEmployees() {
  empLoading.value = true
  try { const data = await api.get('/employees', { params: { company_id: companyId.value } }); employees.value = Array.isArray(data) ? data : [] }
  catch (e) { /* noop */ } finally { empLoading.value = false }
}

async function loadPeriods() {
  try { const data = await api.get('/periods', { params: { company_id: companyId.value } }); periods.value = Array.isArray(data) ? data : []; if (periods.value.length) ssPeriodId.value = periods.value[0].id }
  catch (e) { /* noop */ }
}

async function loadSsRecords() {
  if (!ssPeriodId.value) return
  ssLoading.value = true
  try {
    const data = await api.get('/social-security/records', { params: { company_id: companyId.value, period_id: ssPeriodId.value } })
    ssRecords.value = Array.isArray(data) ? data : []
    // compute summary from records
    let er = 0, ee = 0
    ssRecords.value.forEach(r => { er += parseFloat(r.employer_contribution) || 0; ee += parseFloat(r.employee_contribution) || 0 })
    ssSummary.value = { employer: er, employee: ee, total: er + ee, count: ssRecords.value.length }
  } catch (e) { /* noop */ } finally { ssLoading.value = false }
}

// Employee CRUD
function openEmpDialog(row) {
  if (row) {
    empDialogTitle.value = '编辑员工'
    Object.assign(empForm, { id: row.id, employee_code: row.employee_code, full_name: row.full_name,
      nationality: row.nationality || 'ไทย', id_card_no: row.id_card_no, position: row.position,
      salary: parseFloat(row.salary), social_security_base: parseFloat(row.social_security_base) || null,
      start_date: row.start_date, notes: row.notes, company_id: companyId.value })
  } else {
    empDialogTitle.value = '新增员工'
    Object.assign(empForm, { id: null, company_id: companyId.value, employee_code: '', full_name: '',
      nationality: 'ไทย', id_card_no: '', position: '', salary: 0, social_security_base: null,
      start_date: '', notes: '' })
  }
  empDialogVisible.value = true
}

async function saveEmployee() {
  empSaveLoading.value = true
  try {
    if (empForm.id) {
      await api.put('/employees/' + empForm.id, empForm)
      ElMessage.success('员工已更新')
    } else {
      await api.post('/employees', { ...empForm, company_id: companyId.value })
      ElMessage.success('员工已添加')
    }
    empDialogVisible.value = false
    loadEmployees()
  } catch (e) { ElMessage.error(e.response?.data?.error || '保存失败') }
  finally { empSaveLoading.value = false }
}

async function resignEmployee(row) {
  try {
    await ElMessageBox.confirm(`确定将 "${row.full_name}" 标记为离职？`, '确认', { type: 'warning' })
    await api.post('/employees/' + row.id + '/resign', { end_date: new Date().toISOString().slice(0, 10) })
    ElMessage.success('已标记离职')
    loadEmployees()
  } catch (e) { /* cancelled */ }
}

async function deleteEmployee(row) {
  try {
    await ElMessageBox.confirm(`确定删除员工 "${row.full_name}"？此操作不可恢复。`, '确认删除', { type: 'warning' })
    await api.delete('/employees/' + row.id)
    ElMessage.success('已删除')
    loadEmployees()
  } catch (e) { /* cancelled */ }
}

// SS
async function calcSocialSecurity() {
  ssCalcLoading.value = true
  try {
    const data = await api.post('/social-security/calculate', { company_id: companyId.value, period_id: ssPeriodId.value })
    ssRecords.value = data.items || []
    ssSummary.value = data.summary
    ElMessage.success('社保计算完成')
  } catch (e) { ElMessage.error('计算失败') }
  finally { ssCalcLoading.value = false }
}

async function markSsPaid(row) {
  try {
    const { value: paidDate } = await ElMessageBox.prompt('请输入缴纳日期', '标记已缴纳', { inputValue: new Date().toISOString().slice(0, 10), inputType: 'date' })
    await api.put('/social-security/records/' + row.id + '/paid', { paid_date: paidDate })
    ElMessage.success('已标记')
    loadSsRecords()
  } catch (e) { /* cancelled */ }
}

function onTabChange(tab) {
  if (tab === 'ss') loadSsRecords()
}

onMounted(() => { loadCompanies() })
</script>

<style scoped>
.page { padding: 8px; }
.page-header { margin-bottom: 16px; }
.ss-summary { margin-top: 12px; padding: 12px 16px; background: #f0f9eb; border-radius: 8px; display: flex; gap: 24px; flex-wrap: wrap; }
.ss-summary b { font-size: 16px; }
</style>
