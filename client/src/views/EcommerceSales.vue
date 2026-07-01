<template>
  <div class="ecommerce-sales">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">电商销售录入</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="fetchSales"
          :show-lock-badge="true"
        />
        <el-tag v-if="isSaved" type="success">已保存</el-tag>
      </div>
    </el-card>

    <el-alert v-if="isPeriodLocked" title="该会计期间已锁定，数据为只读状态" type="warning" show-icon :closable="false" style="margin-bottom:16px" />
    <el-skeleton v-if="skeletonLoading" :rows="10" animated style="padding:16px" />
    <el-row v-if="selectedPeriodId" :gutter="16">
      <!-- 收入 -->
      <el-col :span="12">
        <el-card style="margin-bottom:16px">
          <template #header><h3 style="margin:0;color:#409eff">📊 收入</h3></template>
          <el-form label-width="140px" size="default">
            <el-form-item label="平台销售额（含VAT）">
              <el-input-number v-model="form.platform_sales" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="退款金额">
              <el-input-number v-model="form.platform_refunds" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="其他收入">
              <el-input-number v-model="form.other_income" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 电商费用 -->
        <el-card style="margin-bottom:16px">
          <template #header><h3 style="margin:0;color:#e6a23c">🛒 电商费用</h3></template>
          <el-form label-width="140px" size="default">
            <el-form-item label="平台佣金">
              <el-input-number v-model="form.platform_fees" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="广告费">
              <el-input-number v-model="form.advertising_fees" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="物流运费">
              <el-input-number v-model="form.shipping_fees" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 经营成本 -->
        <el-card style="margin-bottom:16px">
          <template #header><h3 style="margin:0;color:#f56c6c">🏢 经营成本</h3></template>
          <el-form label-width="140px" size="default">
            <el-form-item label="采购成本">
              <el-input-number v-model="form.cost_of_goods" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="房租">
              <el-input-number v-model="form.rental_fees" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="工资">
              <el-input-number v-model="form.salary_fees" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="仓储费">
              <el-input-number v-model="form.warehouse_fees" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
            <el-form-item label="其他费用">
              <el-input-number v-model="form.other_expenses" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 进口 -->
        <el-card style="margin-bottom:16px">
          <template #header><h3 style="margin:0;color:#909399">🚢 进口</h3></template>
          <el-form label-width="140px" size="default">
            <el-form-item label="进口VAT已缴">
              <el-input-number v-model="form.import_vat_paid" :min="0" :precision="2" controls-position="right" style="width:100%" @change="autoCalc" />
              <span style="font-size:12px;color:#999">计入进项抵扣</span>
            </el-form-item>
            <el-form-item label="进口关税已缴">
              <el-input-number v-model="form.import_duty_paid" :min="0" :precision="2" controls-position="right" style="width:100%" />
              <span style="font-size:12px;color:#999">计入成本</span>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <!-- 右侧：VAT自动计算结果 + 保存 -->
      <el-col :span="12">
        <el-card style="margin-bottom:16px;background:#f0f9eb">
          <template #header><h3 style="margin:0;color:#67c23a">💰 VAT 自动计算</h3></template>
          <el-descriptions :column="1" border size="default">
            <el-descriptions-item label="不含税销售额">
              <b>{{ netSalesExVat.toLocaleString() }}</b> THB
            </el-descriptions-item>
            <el-descriptions-item label="销项 VAT (7%)">
              <b style="color:#f56c6c">{{ vatSales.toLocaleString() }}</b> THB
            </el-descriptions-item>
            <el-descriptions-item label="可抵扣进项 VAT">
              <b style="color:#67c23a">{{ vatPurchases.toLocaleString() }}</b> THB
            </el-descriptions-item>
          </el-descriptions>

          <el-form label-width="140px" style="margin-top:12px">
            <el-form-item label="上月留抵">
              <el-input-number v-model="creditForward" :min="0" :precision="2" controls-position="right" style="width:180px" />
            </el-form-item>
          </el-form>

          <el-divider />
          <el-descriptions :column="2" border size="default">
            <el-descriptions-item label="应缴 VAT" v-if="netVat >= 0">
              <b style="color:#f56c6c;font-size:18px">{{ netVat.toLocaleString() }}</b> THB
            </el-descriptions-item>
            <el-descriptions-item label="留抵结转" v-if="netVat < 0">
              <b style="color:#67c23a;font-size:18px">{{ Math.abs(netVat).toLocaleString() }}</b> THB
            </el-descriptions-item>
          </el-descriptions>

          <div style="text-align:center;margin-top:20px">
            <el-button type="primary" size="large" :loading="saving" @click="saveSales">
              保存销售数据
            </el-button>
          </div>
        </el-card>

        <!-- 利润快览 -->
        <el-card v-if="isSaved">
          <template #header><h3 style="margin:0">📈 利润快览</h3></template>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="净销售收入（不含VAT）">{{ netSalesExVat.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="成本合计">{{ totalCosts.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="费用合计">{{ totalExpenses.toLocaleString() }}</el-descriptions-item>
            <el-descriptions-item label="净利润">
              <b :style="{color: predictedProfit >= 0 ? '#67c23a' : '#f56c6c', fontSize:'16px'}">
                {{ predictedProfit.toLocaleString() }}
              </b>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>

      <!-- 导入模板下载 -->
      <el-col :span="24" style="margin-top:16px">
        <el-card>
          <template #header><h3 style="margin:0">📥 导入模板下载</h3></template>
          <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
            <el-button @click="downloadTemplate('template-output')">下载销项导入模板</el-button>
            <el-button @click="downloadTemplate('template-input')">下载进项导入模板</el-button>
            <span style="color:#999;font-size:13px">
              从 Shopee/Lazada 后台导出销售数据 → 按模板整理 → 在 VAT明细 页面上传导入
            </span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-else description="请选择客户公司和会计期间" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCompanyStore } from '../stores/currentCompany'
import { ElMessage } from 'element-plus'
import api from '../api'

const store = useCompanyStore()
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'

const companies = ref([])
const periods = ref([])
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const saving = ref(false)
const isSaved = ref(false)
const creditForward = ref(0)

const emptyForm = () => ({
  platform_sales: 0, platform_refunds: 0, other_income: 0,
  platform_fees: 0, advertising_fees: 0, shipping_fees: 0,
  cost_of_goods: 0, rental_fees: 0, salary_fees: 0,
  warehouse_fees: 0, other_expenses: 0,
  import_vat_paid: 0, import_duty_paid: 0,
})

const form = ref(emptyForm())

const netSales = computed(() => form.value.platform_sales - form.value.platform_refunds)
const netSalesExVat = computed(() => Math.round(netSales.value / 1.07 * 100) / 100)
const vatSales = computed(() => Math.round(netSalesExVat.value * 7) / 100)

const vatPurchases = computed(() => {
  const deductible = form.value.platform_fees + form.value.advertising_fees + form.value.shipping_fees + form.value.cost_of_goods
  return Math.round((deductible / 1.07 * 0.07 + form.value.import_vat_paid) * 100) / 100
})

const netVat = computed(() => Math.round((vatSales.value - vatPurchases.value - creditForward.value) * 100) / 100)

const totalCosts = computed(() =>
  Math.round((form.value.cost_of_goods + form.value.platform_fees + form.value.advertising_fees + form.value.shipping_fees) * 100) / 100
)
const totalExpenses = computed(() =>
  Math.round((form.value.rental_fees + form.value.salary_fees + form.value.warehouse_fees + form.value.other_expenses) * 100) / 100
)
const predictedProfit = computed(() =>
  Math.round((netSalesExVat.value - totalCosts.value - totalExpenses.value) * 100) / 100
)

const autoCalc = () => {} // reactive computed already handles it

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('EcommerceSales.vue: 请求失败', e) }
}
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const isPeriodLocked = computed(() => {
  const p = periods.value.find(p => p.id === selectedPeriodId.value)
  return p?.status === 'locked'
})

const onCompanyChange = () => { selectedPeriodId.value = null; fetchPeriods() }

const fetchSales = async () => {
  isSaved.value = false
  if (!selectedPeriodId.value) return
  try {
    const data = await api.get('/ecommerce/sales', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
    if (data) {
      Object.assign(form.value, {
        platform_sales: parseFloat(data.platform_sales) || 0,
        platform_refunds: parseFloat(data.platform_refunds) || 0,
        other_income: parseFloat(data.other_income) || 0,
        platform_fees: parseFloat(data.platform_fees) || 0,
        advertising_fees: parseFloat(data.advertising_fees) || 0,
        shipping_fees: parseFloat(data.shipping_fees) || 0,
        cost_of_goods: parseFloat(data.cost_of_goods) || 0,
        rental_fees: parseFloat(data.rental_fees) || 0,
        salary_fees: parseFloat(data.salary_fees) || 0,
        warehouse_fees: parseFloat(data.warehouse_fees) || 0,
        other_expenses: parseFloat(data.other_expenses) || 0,
        import_vat_paid: parseFloat(data.import_vat_paid) || 0,
        import_duty_paid: parseFloat(data.import_duty_paid) || 0,
      })
      isSaved.value = true
    } else {
      form.value = emptyForm()
    }
  } catch (e) { console.error('EcommerceSales.vue: 请求失败', e) }
}

const saveSales = async () => {
  saving.value = true
  try {
    await api.post('/ecommerce/sales', {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      ...form.value,
    })
    ElMessage.success('保存成功')
    isSaved.value = true

    // Auto-save VAT report
    await api.post('/vat-report', {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      sales_amount: netSalesExVat.value,
      vat_sales: vatSales.value,
      vat_purchases: vatPurchases.value,
      credit_forward: creditForward.value,
      vat_payable: netVat.value > 0 ? netVat.value : 0,
      vat_credit_carry: netVat.value < 0 ? Math.abs(netVat.value) : 0,
      status: 'draft',
    })
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  } finally { saving.value = false }
}

const downloadTemplate = (type) => {
  window.open(`/api/ecommerce/${type}`)
}

onMounted(fetchCompanies)
</script>
