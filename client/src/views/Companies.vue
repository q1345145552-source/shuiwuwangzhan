<template>
  <div class="page">
    <div class="page-header">
      <el-button type="primary" @click="openDialog()">+ 新增公司</el-button>
      <el-input v-model="search" placeholder="搜索公司名/税号" clearable style="width:250px;margin-left:12px" @input="onSearch" />
      <el-select v-model="filterPlatform" placeholder="平台筛选" clearable style="width:160px;margin-left:8px" @change="loadList">
        <el-option label="Shopee" value="Shopee" /><el-option label="Lazada" value="Lazada" /><el-option label="TikTok" value="TikTok" />
      </el-select>
    </div>

    <el-table :data="filteredList" border stripe v-loading="loading" @row-click="goDetail" style="cursor:pointer">
      <el-table-column prop="code" label="编号" width="100" />
      <el-table-column prop="name" label="公司名" width="180" />
      <el-table-column prop="tax_id" label="税号" width="140" />
      <el-table-column label="VAT" width="80">
        <template #default="{row}"><el-tag :type="row.vat_registered?'success':'info'" size="small">{{ row.vat_registered?'已注册':'未注册' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="contact_person" label="联系人" width="100" />
      <el-table-column prop="phone" label="电话" width="120" />
      <el-table-column label="平台" width="140">
        <template #default="{row}">
          <el-tag v-for="p in row.platforms" :key="p" size="small" style="margin:1px">{{ p }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="标签" width="140">
        <template #default="{row}">
          <el-tag v-for="t in row.tags" :key="t" size="small" type="warning" style="margin:1px">{{ t }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{row}">
          <el-button size="small" @click.stop="openDialog(row)">编辑</el-button>
          <el-button size="small" type="danger" @click.stop="deleteCompany(row)">删除</el-button>
          <el-button size="small" type="success" @click.stop="seedAccounts(row)">预置科目</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- Dialog -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="750px" destroy-on-close>
      <el-tabs v-model="activeTab">
        <el-tab-pane label="基本信息" name="basic">
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="公司编号" required><el-input v-model="form.code" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="公司名称" required><el-input v-model="form.name" /></el-form-item></el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="税号"><el-input v-model="form.tax_id" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="VAT号"><el-input v-model="form.vat_number" /></el-form-item></el-col>
          </el-row>
          <el-form-item label="VAT注册"><el-switch v-model="form.vat_registered" /></el-form-item>
          <el-form-item label="地址"><el-input v-model="form.address" type="textarea" :rows="2" /></el-form-item>
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="董事"><el-input v-model="form.director" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="会计起始日期"><el-date-picker v-model="form.accounting_start" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="联系人" name="contact">
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="联系人"><el-input v-model="form.contact_person" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item></el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="微信"><el-input v-model="form.wechat" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item></el-col>
          </el-row>
        </el-tab-pane>

        <el-tab-pane label="地址" name="address">
          <el-form-item label="泰文地址"><el-input v-model="form.address_th" type="textarea" :rows="2" /></el-form-item>
          <el-form-item label="英文地址"><el-input v-model="form.address_en" type="textarea" :rows="2" /></el-form-item>
        </el-tab-pane>

        <el-tab-pane label="业务信息" name="business">
          <el-form-item label="业务类型">
            <el-select v-model="form.business_type" style="width:200px">
              <el-option label="电商" value="电商" /><el-option label="服务" value="服务" />
              <el-option label="贸易" value="贸易" /><el-option label="其他" value="其他" />
            </el-select>
          </el-form-item>
          <el-form-item label="经营平台">
            <el-checkbox-group v-model="form.platforms">
              <el-checkbox value="Shopee" label="Shopee" />
              <el-checkbox value="Lazada" label="Lazada" />
              <el-checkbox value="TikTok" label="TikTok" />
            </el-checkbox-group>
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12"><el-form-item label="服务开始日"><el-date-picker v-model="form.service_start_date" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item label="月服务费(THB)"><el-input-number v-model="form.monthly_service_fee" :min="0" :precision="2" style="width:100%" /></el-form-item></el-col>
          </el-row>
          <el-form-item label="最近联系"><el-date-picker v-model="form.last_contact_date" type="date" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width:100%" /></el-form-item>
        </el-tab-pane>

        <el-tab-pane label="标签 & Logo" name="tags">
          <el-form-item label="标签（逗号分隔）">
            <el-input v-model="tagsStr" placeholder="VIP, 大客户, 月结" />
            <el-tag v-for="t in tagList" :key="t" size="small" type="warning" style="margin:2px" closable @close="removeTag(t)">{{ t }}</el-tag>
          </el-form-item>
          <el-form-item label="Logo URL"><el-input v-model="form.logo_url" placeholder="http://..." /></el-form-item>
        </el-tab-pane>

        <el-tab-pane label="备注" name="notes">
          <el-form-item label="备注"><el-input v-model="form.notes" type="textarea" :rows="4" /></el-form-item>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="saveCompany">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../api'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'

const router = useRouter()
const companies = ref([])
const loading = ref(false)
const search = ref('')
const filterPlatform = ref('')
const dialogVisible = ref(false)
const dialogTitle = ref('新增公司')
const saveLoading = ref(false)
const activeTab = ref('basic')
const tagsStr = ref('')

const empForm = () => ({
  id: null, code: '', name: '', tax_id: '', vat_number: '', vat_registered: false,
  address: '', director: '', contacts: '', accounting_start: '',
  contact_person: '', phone: '', wechat: '', email: '',
  address_th: '', address_en: '', business_type: '', platforms: [],
  logo_url: '', service_start_date: '', monthly_service_fee: null, last_contact_date: '', notes: ''
})
const form = reactive(empForm())

const tagList = computed(() => tagsStr.value ? tagsStr.value.split(',').map(s=>s.trim()).filter(Boolean) : [])
function removeTag(t) { tagsStr.value = tagList.value.filter(i=>i!==t).join(', ') }

const filteredList = computed(() => {
  let list = companies.value
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(c => (c.name||'').toLowerCase().includes(q) || (c.tax_id||'').toLowerCase().includes(q) || (c.code||'').toLowerCase().includes(q))
  }
  if (filterPlatform.value) {
    list = list.filter(c => c.platforms && c.platforms.includes(filterPlatform.value))
  }
  return list
})

async function loadList() {
  loading.value = true
  try { const d = await api.get('/companies'); companies.value = Array.isArray(d) ? d : [] } catch(e) { companies.value = [] }
  finally { loading.value = false }
}

function onSearch() {} // computed handles filtering

function goDetail(row) { router.push('/companies/' + row.id) }

function openDialog(row) {
  if (row) {
    dialogTitle.value = '编辑公司'
    Object.assign(form, {
      id: row.id, code: row.code||'', name: row.name||'', tax_id: row.tax_id||'',
      vat_number: row.vat_number||'', vat_registered: row.vat_registered||false,
      address: row.address||'', director: row.director||'', contacts: row.contacts||'',
      accounting_start: row.accounting_start||'',
      contact_person: row.contact_person||'', phone: row.phone||'', wechat: row.wechat||'', email: row.email||'',
      address_th: row.address_th||'', address_en: row.address_en||'',
      business_type: row.business_type||'', platforms: row.platforms||[],
      logo_url: row.logo_url||'', service_start_date: row.service_start_date||'',
      monthly_service_fee: parseFloat(row.monthly_service_fee)||null,
      last_contact_date: row.last_contact_date||'', notes: row.notes||''
    })
    tagsStr.value = (row.tags||[]).join(', ')
  } else {
    dialogTitle.value = '新增公司'
    Object.assign(form, empForm())
    tagsStr.value = ''
  }
  dialogVisible.value = true; activeTab.value = 'basic'
}

async function saveCompany() {
  saveLoading.value = true
  try {
    const data = { ...form, tags: tagList.value }
    if (form.id) {
      await api.put('/companies/' + form.id, data)
      ElMessage.success('公司已更新')
    } else {
      await api.post('/companies', data)
      ElMessage.success('公司已创建')
    }
    dialogVisible.value = false; loadList()
  } catch(e) { ElMessage.error(e.response?.data?.error || '保存失败') }
  finally { saveLoading.value = false }
}

async function deleteCompany(row) {
  try {
    await ElMessageBox.confirm(`确定删除 "${row.name}"？`, '确认删除', { type: 'warning' })
    await api.delete('/companies/' + row.id)
    ElMessage.success('已删除'); loadList()
  } catch(e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e?.response?.data?.error || '删除失败')
    }
  }
}

async function seedAccounts(row) {
  try { await api.post('/companies/'+row.id+'/seed-accounts'); ElMessage.success('科目已预置') }
  catch(e) { ElMessage.info('已有预置科目') }
}

onMounted(() => { loadList() })
</script>

<style scoped>
.page { padding: 8px; }
.page-header { display: flex; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px; }
</style>
