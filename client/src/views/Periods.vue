<template>
  <div class="periods">
    <el-card>
      <template #header>
        <div class="card-header">
          <h2>会计期间管理</h2>
          <div style="display:flex;gap:12px;align-items:center">
            <el-select v-model="selectedCompanyId" placeholder="选择客户公司" @change="onCompanyChange" clearable style="width:260px">
              <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-button type="primary" :disabled="!selectedCompanyId" @click="openCreateDialog">
              <el-icon><Plus /></el-icon> 新增期间
            </el-button>
          </div>
        </div>
      </template>

      <el-table v-if="selectedCompanyId" :data="periods" v-loading="loading" stripe :row-class-name="rowClassName">
        <el-table-column label="年份" width="100">
          <template #default="{ row }">{{ row.year }}年</template>
        </el-table-column>
        <el-table-column label="月份" width="100">
          <template #default="{ row }">{{ row.month }}月</template>
        </el-table-column>
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="notes" label="备注" min-width="200" />
        <el-table-column label="操作" width="400">
          <template #default="{ row }">
            <el-button link type="primary" size="small"
              :disabled="row.status === 'filed'"
              @click="advanceStatus(row)">
              {{ row.status === 'draft' ? '确认' : '归档' }}
            </el-button>
            <el-button link type="warning" size="small"
              :disabled="row.status !== 'filed'"
              @click="setStatus(row, 'confirmed')">回退确认</el-button>
            <el-button link type="danger" size="small"
              :disabled="row.status === 'draft'"
              v-if="row.status !== 'locked'"
              @click="lockPeriod(row)">🔒 锁定</el-button>
            <el-button link type="success" size="small"
              v-if="row.status === 'locked'"
              @click="unlockPeriod(row)">🔓 解锁</el-button>
            <el-button link type="danger" size="small"
              :disabled="row.status !== 'draft' || row.status === 'locked'"
              @click="confirmDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="请选择客户公司" />
    </el-card>

    <!-- 新增对话框 -->
    <el-dialog v-model="dialogVisible" title="新增会计期间" width="400px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item label="年份" prop="year">
          <el-input-number v-model="form.year" :min="2020" :max="2030" style="width:100%" />
        </el-form-item>
        <el-form-item label="月份" prop="month">
          <el-select v-model="form.month" placeholder="选择月份" style="width:100%">
            <el-option v-for="m in 12" :key="m" :label="m + '月'" :value="m" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'

const companies = ref([])
const selectedCompanyId = ref(null)
const periods = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref(null)
const form = ref({ year: new Date().getFullYear(), month: 1 })
const rules = {
  year: [{ required: true, message: '请选择年份', trigger: 'blur' }],
  month: [{ required: true, message: '请选择月份', trigger: 'change' }],
}

const statusType = (s) => ({ draft: 'info', confirmed: 'warning', filed: 'success', locked: 'danger' }[s] || '')
const statusLabel = (s) => ({ draft: '草稿', confirmed: '已确认', filed: '已归档', locked: '🔒 已锁定' }[s] || s)

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('Periods.vue: fetchCompanies失败', e) }
}

const fetchPeriods = async () => {
  loading.value = true
  try {
    periods.value = await api.get('/periods', { params: { company_id: selectedCompanyId.value } })
  } catch { ElMessage.error('加载失败') } finally { loading.value = false }
}

const onCompanyChange = () => fetchPeriods()

const openCreateDialog = () => {
  form.value = { year: new Date().getFullYear(), month: 1 }
  dialogVisible.value = true
}

const resetForm = () => formRef.value?.resetFields()

const submitForm = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return
  saving.value = true
  try {
    await api.post('/periods', { company_id: selectedCompanyId.value, ...form.value })
    ElMessage.success('创建成功')
    dialogVisible.value = false
    fetchPeriods()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '创建失败')
  } finally { saving.value = false }
}

const advanceStatus = async (row) => {
  const next = row.status === 'draft' ? 'confirmed' : 'filed'
  try {
    await api.put(`/periods/${row.id}/status`, { status: next })
    ElMessage.success(`状态已更新为：${statusLabel(next)}`)
    fetchPeriods()
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
}

const setStatus = async (row, status) => {
  try {
    await api.put(`/periods/${row.id}/status`, { status })
    ElMessage.success(`状态已更新为：${statusLabel(status)}`)
    fetchPeriods()
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
}

const confirmDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除 ${row.year}年${row.month}月 的会计期间吗？`, '确认删除', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
    })
    await api.delete(`/periods/${row.id}`)
    ElMessage.success('删除成功')
    fetchPeriods()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '删除失败')
  }
}


const rowClassName = ({ row }) => row.status === 'locked' ? 'locked-row' : ''

const lockPeriod = async (row) => {
  try {
    await api.put(`/periods/${row.id}/lock`)
    ElMessage.success('期间已锁定')
    fetchPeriods()
  } catch (e) { ElMessage.error(e.response?.data?.error || '锁定失败') }
}

const unlockPeriod = async (row) => {
  try {
    await api.put(`/periods/${row.id}/unlock`)
    ElMessage.success('期间已解锁')
    fetchPeriods()
  } catch (e) { ElMessage.error(e.response?.data?.error || '解锁失败') }
}

onMounted(fetchCompanies)

</script>

<style scoped>
.card-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.card-header h2 { margin: 0; font-size: 18px; }
.locked-row { background-color: #fef0f0 !important; }
</style>
