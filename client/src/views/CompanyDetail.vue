<template>
  <div class="company-detail">
    <el-page-header @back="$router.push('/companies')" title="返回列表">
      <template #content>
        <span class="page-title">{{ company.name || '加载中...' }}</span>
      </template>
    </el-page-header>

    <el-card style="margin-top:16px" v-loading="loading">
      <template #header><h3>基本信息</h3></template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="公司编号">{{ company.code }}</el-descriptions-item>
        <el-descriptions-item label="公司名称">{{ company.name }}</el-descriptions-item>
        <el-descriptions-item label="税号">{{ company.tax_id || '-' }}</el-descriptions-item>
        <el-descriptions-item label="VAT号">{{ company.vat_number || '-' }}</el-descriptions-item>
        <el-descriptions-item label="VAT状态">
          <el-tag :type="company.vat_registered ? 'success' : 'info'" size="small">
            {{ company.vat_registered ? '已注册' : '未注册' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="负责人">{{ company.director || '-' }}</el-descriptions-item>
        <el-descriptions-item label="地址" :span="2">{{ company.address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="联系方式" :span="2">{{ company.contacts || '-' }}</el-descriptions-item>
        <el-descriptions-item label="会计起始日">{{ company.accounting_start ? company.accounting_start.substring(0,10) : '-' }}</el-descriptions-item>
        <el-descriptions-item label="备注">{{ company.notes || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card style="margin-top:16px">
      <template #header><h3>快捷操作</h3></template>
      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <el-button type="primary" @click="$router.push(`/ecommerce-sales?company_id=${companyId}`)">录入销售数据</el-button>
        <el-button @click="$router.push(`/profit-loss?company_id=${companyId}`)">查看利润表</el-button>
        <el-button type="warning" @click="$router.push(`/vat-compliance?company_id=${companyId}`)">VAT合规检测</el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api'

const route = useRoute()
const companyId = route.params.id
const company = ref({})
const loading = ref(false)

const fetchCompany = async () => {
  loading.value = true
  try { company.value = await api.get(`/companies/${companyId}`) } catch { ElMessage.error('加载失败') }
  finally { loading.value = false }
}

onMounted(fetchCompany)
</script>

<style scoped>
.page-title { font-size: 18px; font-weight: bold; }
h3 { margin: 0; font-size: 16px; }
</style>
