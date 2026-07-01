<template>
  <div class="accounts">
    <el-card>
      <template #header>
        <div class="card-header">
          <h2>科目管理</h2>
          <div style="display:flex;gap:12px;align-items:center">
            <el-select v-model="selectedCompanyId" placeholder="请选择客户公司" @change="onCompanyChange" clearable style="width:260px">
              <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
            </el-select>
            <el-button type="primary" :disabled="!selectedCompanyId" @click="openCreateDialog">
              <el-icon><Plus /></el-icon> 新增科目
            </el-button>
          </div>
        </div>
      </template>

      <el-table v-if="selectedCompanyId" :data="accounts" v-loading="loading" stripe>
        <el-table-column label="科目编码" width="200">
          <template #default="{ row }">
            <el-tag :type="categoryTagType(row.category)" size="small" style="margin-right:6px">
              {{ row.category }}
            </el-tag>
            {{ row.code }} {{ row.name }}
          </template>
        </el-table-column>
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.is_system ? '' : 'warning'">
              {{ row.is_system ? '系统预置' : '自定义' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openEditDialog(row)">编辑</el-button>
            <el-button link type="danger" size="small" :disabled="row.is_system" @click="confirmDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-else description="请先选择客户公司" />
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog v-model="dialogVisible" :title="isEdit ? '编辑科目' : '新增科目'" width="500px" @close="resetForm">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="科目编码" prop="code">
          <el-input v-model="form.code" placeholder="如 7006" />
        </el-form-item>
        <el-form-item label="科目名称" prop="name">
          <el-input v-model="form.name" placeholder="科目名称" />
        </el-form-item>
        <el-form-item label="分类" prop="category">
          <el-select v-model="form.category" placeholder="选择分类" style="width:100%">
            <el-option label="资产" value="资产" />
            <el-option label="负债" value="负债" />
            <el-option label="权益" value="权益" />
            <el-option label="收入" value="收入" />
            <el-option label="成本" value="成本" />
            <el-option label="费用" value="费用" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
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
const accounts = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEdit = ref(false)
const saving = ref(false)
const formRef = ref(null)
const editId = ref(null)

const form = ref({ code: '', name: '', category: '' })
const rules = {
  code: [{ required: true, message: '请输入科目编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入科目名称', trigger: 'blur' }],
  category: [{ required: true, message: '请选择分类', trigger: 'change' }],
}

const categoryTagType = (cat) => {
  const map = { '资产':'success', '负债':'warning', '权益':'', '收入':'success', '成本':'danger', '费用':'info' }
  return map[cat] || ''
}

const fetchCompanies = async () => {
  try {
    companies.value = await api.get('/companies')
  } catch (e) {
    ElMessage.error('加载公司列表失败')
  }
}

const fetchAccounts = async () => {
  loading.value = true
  try {
    accounts.value = await api.get('/accounts', { params: { company_id: selectedCompanyId.value } })
  } catch (e) {
    ElMessage.error('加载科目列表失败')
  } finally {
    loading.value = false
  }
}

const onCompanyChange = () => {
  fetchAccounts()
}

const openCreateDialog = () => {
  isEdit.value = false
  editId.value = null
  dialogVisible.value = true
}

const openEditDialog = (row) => {
  isEdit.value = true
  editId.value = row.id
  form.value = { code: row.code, name: row.name, category: row.category }
  dialogVisible.value = true
}

const resetForm = () => {
  formRef.value?.resetFields()
  form.value = { code: '', name: '', category: '' }
}

const submitForm = async () => {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  saving.value = true
  try {
    if (isEdit.value) {
      await api.put(`/accounts/${editId.value}`, form.value)
      ElMessage.success('更新成功')
    } else {
      await api.post('/accounts', { ...form.value, company_id: selectedCompanyId.value })
      ElMessage.success('新增成功')
    }
    dialogVisible.value = false
    fetchAccounts()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    saving.value = false
  }
}

const confirmDelete = async (row) => {
  try {
    await ElMessageBox.confirm(`确定删除科目「${row.code} ${row.name}」吗？`, '确认删除', {
      confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning'
    })
    await api.delete(`/accounts/${row.id}`)
    ElMessage.success('删除成功')
    fetchAccounts()
  } catch (e) {
    if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '删除失败')
  }
}

onMounted(fetchCompanies)
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.card-header h2 { margin: 0; font-size: 18px; }
</style>
