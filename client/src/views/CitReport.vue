<template>
  <div class="cit-report">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">CIT 年度申报</span>
        <el-select v-model="selectedCompanyId" placeholder="选择客户公司" @change="onCompanyChange" style="width:220px">
          <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
        </el-select>
        <el-select v-model="selectedYear" placeholder="选择年度" @change="fetchAnnualData" :disabled="!selectedCompanyId" style="width:120px">
          <el-option v-for="y in years" :key="y" :label="String(y)" :value="y" />
        </el-select>
      </div>
    </el-card>

    <template v-if="selectedCompanyId && selectedYear">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <!-- Tab 1: PND.50 年度申报 -->
        <el-tab-pane label="年度申报 PND.50" name="annual">
          <el-card v-if="annualData" v-loading="annLoading" style="margin-bottom:16px">
            <template #header><h3 style="margin:0">年度数据汇总 {{ selectedYear }}</h3></template>

            <el-row :gutter="24">
              <el-col :span="12">
                <el-descriptions title="收入" :column="1" border size="small">
                  <el-descriptions-item label="平台销售收入（不含税）">{{ annualData.platform_revenue?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="其他收入">{{ annualData.other_revenue?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="总收入">
                    <b>{{ annualData.total_revenue?.toLocaleString() }}</b>
                  </el-descriptions-item>
                </el-descriptions>
              </el-col>
              <el-col :span="12">
                <el-descriptions title="费用" :column="1" border size="small">
                  <el-descriptions-item label="采购成本">{{ annualData.cost_of_goods?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="平台佣金">{{ annualData.platform_fees?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="广告费">{{ annualData.advertising_fees?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="物流费">{{ annualData.shipping_fees?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="房租">{{ annualData.rental_fees?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="工资">{{ annualData.salary_fees?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="仓储费">{{ annualData.warehouse_fees?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="其他费用">{{ annualData.other_expenses?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="进口关税">{{ annualData.import_duty?.toLocaleString() }}</el-descriptions-item>
                  <el-descriptions-item label="费用合计">
                    <b>{{ annualData.total_expenses?.toLocaleString() }}</b>
                  </el-descriptions-item>
                </el-descriptions>
              </el-col>
            </el-row>
          </el-card>

          <!-- 税额计算 -->
          <el-card v-if="annualData" style="margin-bottom:16px;background:#f5f7fa">
            <template #header><h3 style="margin:0">税额计算</h3></template>

            <el-form label-width="160px" size="default">
              <el-form-item label="净利润">
                <el-input-number v-model="calcProfit" :precision="2" controls-position="right" style="width:250px" @change="runCalc" />
                <span style="margin-left:8px;color:#999">(自动取数: {{ annualData.net_profit?.toLocaleString() }})</span>
              </el-form-item>
              <el-form-item label="适用税率">
                <span style="font-size:18px;font-weight:bold;color:#409eff">{{ taxRateDisplay }}</span>
                <span style="margin-left:12px;font-size:13px;color:#999">(中小企业优惠: 0-30万=0%, 30-300万=15%, 300万+=20%)</span>
              </el-form-item>
              <el-form-item label="应纳税额">
                <b style="font-size:20px;color:#f56c6c">{{ taxResult?.tax_amount?.toLocaleString() || 0 }}</b> THB
              </el-form-item>

              <el-divider />

              <el-form-item label="WHT 抵免额">
                <el-input-number v-model="whtCredit" :min="0" :precision="2" controls-position="right" style="width:250px" />
                <el-button size="small" style="margin-left:8px" @click="fetchWhtAndFill">从费用汇总</el-button>
              </el-form-item>
              <el-form-item label="已缴半年预付">
                <span>{{ halfPaid.toLocaleString() }} THB</span>
              </el-form-item>
              <el-divider />

              <el-form-item label="应补税额" v-if="finalTax >= 0">
                <b style="font-size:24px;color:#f56c6c">{{ finalTax.toLocaleString() }}</b> THB
              </el-form-item>
              <el-form-item label="应退税额" v-else>
                <b style="font-size:24px;color:#67c23a">{{ Math.abs(finalTax).toLocaleString() }}</b> THB
              </el-form-item>
            </el-form>

            <div style="text-align:center;margin-top:16px;display:flex;gap:12px;justify-content:center">
              <el-button type="primary" :loading="reportSaving" @click="saveReport">保存草稿</el-button>
              <el-button type="success" :disabled="!savedReport || savedReport.status==='filed'" @click="fileReport">标记已申报</el-button>
            </div>
          </el-card>
        </el-tab-pane>

        <!-- Tab 2: PND.51 半年预付 -->
        <el-tab-pane label="半年预付 PND.51" name="half">
          <el-card>
            <template #header><h3 style="margin:0">半年预付税 {{ selectedYear }}</h3></template>

            <el-form label-width="160px" size="default">
              <el-form-item label="上半年收入">
                <el-input-number v-model="halfForm.half_year_revenue" :min="0" :precision="2" controls-position="right" style="width:250px" @change="recalcHalf" />
              </el-form-item>
              <el-form-item label="上半年费用">
                <el-input-number v-model="halfForm.half_year_expenses" :min="0" :precision="2" controls-position="right" style="width:250px" @change="recalcHalf" />
              </el-form-item>
              <el-form-item label="预估利润">
                <b>{{ halfEstProfit.toLocaleString() }} THB</b>
              </el-form-item>
              <el-form-item label="预估税额 (50%)">
                <span style="font-size:20px;font-weight:bold;color:#e6a23c">{{ halfEstTax.toLocaleString() }} THB</span>
              </el-form-item>
              <el-form-item label="实缴金额">
                <el-input-number v-model="halfForm.paid_amount" :min="0" :precision="2" controls-position="right" style="width:250px" />
              </el-form-item>
              <el-form-item label="缴纳日期">
                <el-date-picker v-model="halfForm.paid_date" type="date" value-format="YYYY-MM-DD" style="width:250px" />
              </el-form-item>
            </el-form>
            <div style="text-align:center;margin-top:12px">
              <el-button type="primary" :loading="halfSaving" @click="saveHalfYear">保存半年预付</el-button>
            </div>
          </el-card>
        </el-tab-pane>
      </el-tabs>
    </template>

    <el-empty v-else description="请选择客户公司和会计年度" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api'

const companies = ref([])
const selectedCompanyId = ref(null), selectedYear = ref(null)
const activeTab = ref('annual')
const annLoading = ref(false), reportSaving = ref(false), halfSaving = ref(false)

const now = new Date()
const years = ref(Array.from({length:5}, (_,i) => now.getFullYear() - i))

const annualData = ref(null)
const savedReport = ref(null)
const calcProfit = ref(0)
const whtCredit = ref(0)
const halfPaid = ref(0)
const taxResult = ref(null)

const halfForm = ref({ half_year_revenue: 0, half_year_expenses: 0, paid_amount: 0, paid_date: '' })

const taxRateDisplay = computed(() => {
  const p = calcProfit.value || 0
  if (p <= 300000) return '0% (免税额)'
  if (p <= 3000000) return '15%'
  return '20%'
})

const finalTax = computed(() => {
  const tax = taxResult.value?.tax_amount || 0
  return Math.round((tax - whtCredit.value - halfPaid.value) * 100) / 100
})

const halfEstProfit = computed(() => {
  return Math.round((halfForm.value.half_year_revenue - halfForm.value.half_year_expenses) * 100) / 100
})
const halfEstTax = computed(() => {
  const p = halfEstProfit.value
  if (p <= 0) return 0
  let tax = 0
  if (p <= 300000) tax = 0
  else if (p <= 3000000) tax = Math.round((p - 300000) * 0.15 * 100) / 100
  else tax = Math.round(((3000000 - 300000) * 0.15 + (p - 3000000) * 0.20) * 100) / 100
  // 50% of estimated annual
  return Math.round(tax * 0.5 * 100) / 100
})

const fetchCompanies = async () => { try { companies.value = await api.get('/companies') } catch (e) { console.error('CitReport.vue: 请求失败', e) } }
const onCompanyChange = () => { selectedYear.value = null }

const fetchAnnualData = async () => {
  annLoading.value = true
  try {
    annualData.value = await api.get('/cit/annual-data',{params:{company_id:selectedCompanyId.value,year:selectedYear.value}})
    calcProfit.value = annualData.value.net_profit || 0
    runCalc()
    // Get saved report
    savedReport.value = await api.get('/cit/report',{params:{company_id:selectedCompanyId.value,year:selectedYear.value}})
    if (savedReport.value) {
      whtCredit.value = parseFloat(savedReport.value.wht_credit) || 0
    }
  } catch { annualData.value = null } finally { annLoading.value = false }
}

const runCalc = async () => {
  try {
    taxResult.value = await api.post('/cit/calculate-tax', {
      company_id: selectedCompanyId.value, net_profit: calcProfit.value, tax_rate: 'auto', wht_credit: 0
    })
  } catch { taxResult.value = null }
}

const fetchWhtAndFill = async () => {
  try {
    const r = await api.get('/expenses/wht-summary',{params:{company_id:selectedCompanyId.value,year:selectedYear.value}})
    whtCredit.value = r.total_wht || 0
    ElMessage.success(`WHT抵免额: ${whtCredit.value.toLocaleString()}`)
  } catch { ElMessage.error('获取失败') }
}

const saveReport = async () => {
  reportSaving.value = true
  try {
    await api.post('/cit/report', {
      company_id: selectedCompanyId.value, year: selectedYear.value,
      ...annualData.value,
      net_profit: calcProfit.value,
      tax_base: calcProfit.value,
      tax_rate: parseFloat(taxRateDisplay.value) || 0,
      tax_amount: taxResult.value?.tax_amount || 0,
      wht_credit: whtCredit.value,
      half_year_paid: halfPaid.value,
      tax_payable: finalTax.value,
      status: 'draft',
    })
    ElMessage.success('草稿已保存')
    savedReport.value = { status: 'draft' }
  } catch (e) { ElMessage.error(e.response?.data?.error||'保存失败') } finally { reportSaving.value = false }
}

const fileReport = async () => {
  try {
    await ElMessageBox.confirm('确认标记为已申报？','确认',{type:'warning'})
    await api.put(`/cit/report/${savedReport.value.id}/status`,{status:'filed'})
    ElMessage.success('已标记为已申报')
    savedReport.value.status = 'filed'
  } catch(e) { if(e!=='cancel') ElMessage.error('操作失败') }
}

const onTabChange = async (tab) => {
  if (tab==='half') {
    try {
      const r = await api.get('/cit/half-year',{params:{company_id:selectedCompanyId.value,year:selectedYear.value}})
      if (r) {
        halfForm.value = { half_year_revenue: parseFloat(r.half_year_revenue)||0, half_year_expenses: parseFloat(r.half_year_expenses)||0, paid_amount: parseFloat(r.paid_amount)||0, paid_date: r.paid_date?.substring(0,10)||'' }
        halfPaid.value = parseFloat(r.paid_amount) || 0
      }
    } catch (e) { console.error('CitReport.vue: 请求失败', e) }
  }
}

const recalcHalf = () => {}
const saveHalfYear = async () => {
  halfSaving.value = true
  try {
    const r = await api.post('/cit/half-year', {
      company_id: selectedCompanyId.value, year: selectedYear.value,
      ...halfForm.value,
      estimated_profit: halfEstProfit.value,
      estimated_tax: halfEstTax.value,
      status: 'draft',
    })
    halfPaid.value = parseFloat(r.paid_amount) || 0
    ElMessage.success('保存成功')
  } catch(e) { ElMessage.error('保存失败') } finally { halfSaving.value = false }
}

onMounted(fetchCompanies)
</script>

<style scoped>
h3 { margin: 0; }
</style>
