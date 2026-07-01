<template>
  <div class="invoice-gen">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">发票生成</span>
        <el-select v-model="selectedCompanyId" placeholder="选择客户公司" @change="onCompanyChange" style="width:220px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="selectedPeriodId" placeholder="选择会计期间" :disabled="!selectedCompanyId" style="width:220px">
          <el-option v-for="p in periods" :key="p.id" :label="p.year + '年' + p.month + '月'" :value="p.id" />
        </el-select>
      </div>
    </el-card>

    <el-row v-if="selectedPeriodId" :gutter="16">
      <!-- 左侧：填写区 -->
      <el-col :span="14">
        <el-card>
          <template #header><h3 style="margin:0">发票信息</h3></template>

          <el-form label-width="100px">
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item label="发票类型">
                  <el-select v-model="form.type" style="width:100%">
                    <el-option label="Tax Invoice" value="tax_invoice" />
                    <el-option label="Receipt" value="receipt" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="客户名称">
                  <el-input v-model="form.customer_name" placeholder="客户名称" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="客户税号">
              <el-input v-model="form.customer_tax_id" placeholder="客户税号（选填）" style="width:280px" />
            </el-form-item>

            <el-divider />

            <!-- 明细 -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-weight:bold">服务明细</span>
              <el-button size="small" @click="addItem"><el-icon><Plus /></el-icon> 添加行</el-button>
            </div>

            <el-table :data="form.items" border size="small">
              <el-table-column label="项目名称" min-width="180">
                <template #default="{ row }">
                  <el-input v-model="row.name" size="small" placeholder="如: 出库服务" />
                </template>
              </el-table-column>
              <el-table-column label="数量" width="100">
                <template #default="{ row }">
                  <el-input-number v-model="row.qty" :min="1" size="small" controls-position="right" @change="calcItem(row)" />
                </template>
              </el-table-column>
              <el-table-column label="单价" width="120">
                <template #default="{ row }">
                  <el-input-number v-model="row.price" :min="0" :precision="2" size="small" controls-position="right" @change="calcItem(row)" />
                </template>
              </el-table-column>
              <el-table-column label="金额" width="130">
                <template #default="{ row }">{{ (row.amount || 0).toFixed(2) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="60">
                <template #default="{ $index }">
                  <el-button link type="danger" size="small" @click="removeItem($index)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>

            <div style="text-align:right;margin-top:12px;font-size:15px;line-height:2">
              <div>不含税金额：<b>{{ totalExVat.toFixed(2) }}</b> THB</div>
              <div>VAT 7%：<b>{{ vatAmount.toFixed(2) }}</b> THB</div>
              <div style="font-size:18px;color:#409eff">含税总额：<b>{{ totalIncVat.toFixed(2) }}</b> THB</div>
            </div>

            <div style="text-align:center;margin-top:16px">
              <el-button type="primary" size="large" :loading="generating" :disabled="!canGenerate" @click="generate">
                生成发票 PDF
              </el-button>
            </div>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：历史 -->
      <el-col :span="10">
        <el-card>
          <template #header>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h3 style="margin:0">发票历史</h3>
              <el-button size="small" @click="fetchInvoices">刷新</el-button>
            </div>
          </template>

          <el-table :data="invoices" stripe size="small">
            <el-table-column prop="invoice_no" label="发票号" width="150" />
            <el-table-column label="类型" width="90">
              <template #default="{ row }">{{ row.type === 'tax_invoice' ? 'Tax Inv' : 'Receipt' }}</template>
            </el-table-column>
            <el-table-column prop="customer_name" label="客户" min-width="120" />
            <el-table-column label="金额" width="100">
              <template #default="{ row }">{{ parseFloat(row.total_inc_vat).toLocaleString() }}</template>
            </el-table-column>
            <el-table-column label="操作" width="80">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click="download(row)">查看</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="invoices.length === 0" description="暂无发票" />
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-else description="请先选择客户公司和会计期间" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import api from '../api'

const companies = ref([])
const periods = ref([])
const invoices = ref([])
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const generating = ref(false)

const form = ref({
  type: 'tax_invoice',
  customer_name: '',
  customer_tax_id: '',
  lang: 'zh',
  items: [{ name: '', qty: 1, price: 0, amount: 0 }],
})

const totalExVat = computed(() => form.value.items.reduce((s, i) => s + (parseFloat(i.amount) || parseFloat(i.qty) * parseFloat(i.price) || 0), 0))
const vatAmount = computed(() => Math.round(totalExVat.value * 7) / 100)
const totalIncVat = computed(() => totalExVat.value + vatAmount.value)
const canGenerate = computed(() => form.value.customer_name && totalExVat.value > 0)

const calcItem = (row) => { row.amount = parseFloat((parseFloat(row.qty) || 0) * (parseFloat(row.price) || 0)).toFixed(2) }

const addItem = () => { form.value.items.push({ name: '', qty: 1, price: 0, amount: 0 }) }
const removeItem = (i) => { if (form.value.items.length > 1) form.value.items.splice(i, 1) }

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('InvoiceGen.vue: 请求失败', e) }
}
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const fetchInvoices = async () => {
  try {
    invoices.value = await api.get('/invoices', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch { invoices.value = [] }
}

const onCompanyChange = () => { selectedPeriodId.value = null; fetchPeriods() }

watch(selectedPeriodId, () => { if (selectedPeriodId.value) fetchInvoices() })

const generate = async () => {
  generating.value = true
  try {
    const res = await api.post('/invoice-generate', { lang: form.value.lang,
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      ...form.value,
    })
    ElMessage.success('发票生成成功')
    window.open(res.url, '_blank')
    fetchInvoices()
    // 重置表单
    form.value = { type: 'tax_invoice', customer_name: '', customer_tax_id: '',
  lang: 'zh', items: [{ name: '', qty: 1, price: 0, amount: 0 }] }
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '生成失败')
  } finally { generating.value = false }
}

const download = (row) => {
  const no = row.invoice_no
  window.open(`/invoices/${no}.pdf`, '_blank')
}

onMounted(fetchCompanies)
</script>

<style scoped>
h3 { margin: 0; font-size: 16px; }
</style>
