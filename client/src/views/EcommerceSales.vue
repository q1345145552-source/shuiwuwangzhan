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
        <el-tag v-if="form.collection_status === 'collected'" type="success">已回款</el-tag>
        <el-tag v-else-if="form.collection_status === 'partial'" type="warning">部分回款</el-tag>
        <el-tag v-else-if="form.collection_status === 'uncollected'" type="info">未回款</el-tag>
      </div>
    </el-card>

    <el-alert v-if="isPeriodLocked" title="该会计期间已锁定，数据为只读状态" type="warning" show-icon :closable="false" style="margin-bottom:16px" />
    <el-skeleton v-if="skeletonLoading" :rows="10" animated style="padding:16px" />

    <el-row v-if="selectedPeriodId" :gutter="16">
      <!-- ===== 左栏：录入区 ===== -->
      <el-col :span="14">
        <!-- 1. 平台信息 -->
        <el-card style="margin-bottom:16px">
          <template #header>
            <h3 style="margin:0;color:#409eff">🏪 平台信息</h3>
          </template>
          <el-form label-width="140px" size="default">
            <el-form-item label="平台">
              <el-select v-model="form.platform" placeholder="选择电商平台" style="width:100%" clearable>
                <el-option v-for="p in platforms" :key="p" :label="p" :value="p" />
              </el-select>
            </el-form-item>
            <el-form-item label="店铺名称">
              <el-input v-model="form.store_name" placeholder="如：蓝鲨泰国旗舰店" maxlength="200" />
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 2. 销售收入 -->
        <el-card style="margin-bottom:16px">
          <template #header>
            <h3 style="margin:0;color:#67c23a">💰 销售收入</h3>
          </template>
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px" title="💡 提示">
            <template #default>
              <p style="margin:0;font-size:13px;line-height:1.8">
                · <b>含税金额</b>：平台账单上的金额通常已包含 7% 增值税（VAT）。<br/>
                · <b>未税金额</b>：扣除 VAT 后的实际收入，用于计算利润表。<br/>
                · 销售额和退款均按同一方式处理：选"含税"则自动倒挤 VAT。
              </p>
            </template>
          </el-alert>
          <el-form label-width="140px" size="default" style="margin-top:12px">
            <el-form-item label="商品销售额">
              <el-input-number v-model="form.platform_sales" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="运费收入">
              <el-input-number v-model="form.shipping_income" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="优惠折扣">
              <el-input-number v-model="form.discounts" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="退款金额">
              <el-input-number v-model="form.platform_refunds" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="金额含 VAT">
              <el-switch v-model="form.is_vat_inclusive" active-text="含税" inactive-text="未税" />
              <span style="margin-left:8px;font-size:12px;color:#999">
                {{ form.is_vat_inclusive ? '输入金额已含7% VAT，系统自动计算未税' : '输入金额为未税，系统自动计算VAT' }}
              </span>
            </el-form-item>
            <el-form-item label="VAT 税率">
              <el-input-number v-model="form.vat_rate" :min="0" :max="1" :precision="4" :step="0.01" controls-position="right" style="width:160px" />
              <span style="margin-left:8px;font-size:12px;color:#999">默认 7%（0.07），一般无需修改</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 3. 平台费用 -->
        <el-card style="margin-bottom:16px">
          <template #header>
            <h3 style="margin:0;color:#e6a23c">🛒 平台费用</h3>
          </template>
          <el-form label-width="140px" size="default">
            <el-form-item label="平台手续费">
              <el-input-number v-model="form.platform_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="广告费">
              <el-input-number v-model="form.advertising_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="物流运费">
              <el-input-number v-model="form.shipping_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 4. 经营成本 -->
        <el-card style="margin-bottom:16px">
          <template #header>
            <h3 style="margin:0;color:#f56c6c">🏢 经营成本</h3>
          </template>
          <el-form label-width="140px" size="default">
            <el-form-item label="采购成本">
              <el-input-number v-model="form.cost_of_goods" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="房租">
              <el-input-number v-model="form.rental_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="工资">
              <el-input-number v-model="form.salary_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="仓储费">
              <el-input-number v-model="form.warehouse_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="其他费用">
              <el-input-number v-model="form.other_expenses" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 5. 进口 -->
        <el-card style="margin-bottom:16px">
          <template #header>
            <h3 style="margin:0;color:#909399">🚢 进口</h3>
          </template>
          <el-form label-width="140px" size="default">
            <el-form-item label="进口VAT已缴">
              <el-input-number v-model="form.import_vat_paid" :min="0" :precision="2" controls-position="right" style="width:100%" />
              <span style="font-size:12px;color:#999">计入进项抵扣</span>
            </el-form-item>
            <el-form-item label="进口关税已缴">
              <el-input-number v-model="form.import_duty_paid" :min="0" :precision="2" controls-position="right" style="width:100%" />
              <span style="font-size:12px;color:#999">计入成本</span>
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 6. 回款与开票 -->
        <el-card style="margin-bottom:16px">
          <template #header>
            <h3 style="margin:0;color:#a855f7">💳 回款与开票</h3>
          </template>
          <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px" title="💡 提示">
            <template #default>
              <p style="margin:0;font-size:13px;line-height:1.8">
                · <b>实际回款金额</b>：平台实际打到银行账户的金额（扣除平台手续费、退款等后）。<br/>
                · <b>回款状态</b>：Shopee/Lazada 通常 T+7~15 天回款，用于跟踪资金到账情况。<br/>
                · <b>Tax Invoice</b>：泰国税务局要求每笔销售开具税务发票，勾选后系统记录。
              </p>
            </template>
          </el-alert>
          <el-form label-width="140px" size="default" style="margin-top:12px">
            <el-form-item label="实际回款金额">
              <el-input-number v-model="form.actual_received" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
            <el-form-item label="回款状态">
              <el-select v-model="form.collection_status" style="width:100%">
                <el-option label="未回款 — 平台尚未结算" value="uncollected" />
                <el-option label="部分回款 — 已收到部分金额" value="partial" />
                <el-option label="已回款 — 全部到账" value="collected" />
              </el-select>
            </el-form-item>
            <el-form-item label="已开 Tax Invoice">
              <el-switch v-model="form.tax_invoice_issued" active-text="已开具" inactive-text="未开具" />
            </el-form-item>
            <el-form-item label="备注">
              <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="补充说明…" />
            </el-form-item>
          </el-form>
        </el-card>

        <!-- 保存按钮 -->
        <div style="text-align:center;padding:16px">
          <el-button type="primary" size="large" :loading="saving" @click="saveSales" :disabled="isPeriodLocked">
            保存数据
          </el-button>
          <el-button v-if="isSaved" size="large" @click="$router.push('/vat-report')">
            查看 VAT 申报 →
          </el-button>
        </div>
      </el-col>

      <!-- ===== 右栏：VAT 汇总 + 利润预览 ===== -->
      <el-col :span="10">
        <el-card style="margin-bottom:16px;background:#f0f9ff">
          <template #header>
            <h3 style="margin:0;color:#409eff">📈 VAT 对账汇总</h3>
          </template>
          <el-table :data="vatSummary" :show-header="false" size="small" style="width:100%">
            <el-table-column prop="label" width="160" />
            <el-table-column prop="value" align="right">
              <template #default="{ row }">
                <span :style="{ fontWeight: row.bold ? 'bold' : 'normal', color: row.color || '#333', fontSize: row.fontSize || '14px' }">
                  {{ row.value }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <el-card style="margin-bottom:16px;background:#fef9e7">
          <template #header>
            <h3 style="margin:0;color:#e6a23c">📊 利润预览</h3>
          </template>
          <el-table :data="profitSummary" :show-header="false" size="small" style="width:100%">
            <el-table-column prop="label" width="160" />
            <el-table-column prop="value" align="right">
              <template #default="{ row }">
                <span :style="{ fontWeight: row.bold ? 'bold' : 'normal', color: row.color || '#333', fontSize: row.fontSize || '14px' }">
                  {{ row.value }}
                </span>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 快捷提示 -->
        <el-card>
          <template #header><h4 style="margin:0">📝 录入指南</h4></template>
          <div style="font-size:13px;color:#666;line-height:2">
            <p><b>1.</b> 从 Shopee/Lazada Seller Center 导出月度账单</p>
            <p><b>2.</b> 将「订单收入」填入商品销售额</p>
            <p><b>3.</b> 将「退款」填入退款金额</p>
            <p><b>4.</b> 将「平台佣金+广告+物流」填入对应费用</p>
            <p><b>5.</b> 将银行实际到账填入实际回款</p>
            <p><b>6.</b> 检查右侧 VAT 对账数据</p>
            <p style="margin-top:8px;color:#999">
              如需逐笔明细，请前往 <el-link type="primary" @click="$router.push('/vat-details')">VAT 明细</el-link>
            </p>
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
const skeletonLoading = ref(false)

const platforms = ['Shopee', 'Lazada', 'TikTok', 'Temu', 'Other']

const emptyForm = () => ({
  platform: '', store_name: '',
  platform_sales: 0, shipping_income: 0, discounts: 0, platform_refunds: 0, other_income: 0,
  is_vat_inclusive: true, vat_rate: 0.07,
  platform_fees: 0, advertising_fees: 0, shipping_fees: 0,
  cost_of_goods: 0, rental_fees: 0, salary_fees: 0, warehouse_fees: 0, other_expenses: 0,
  import_vat_paid: 0, import_duty_paid: 0,
  actual_received: 0, collection_status: 'uncollected', tax_invoice_issued: false, notes: '',
})

const form = ref(emptyForm())

// VAT summary table
const vatSummary = computed(() => {
  const gross = form.value.platform_sales - form.value.platform_refunds
  const rate = form.value.vat_rate || 0.07
  const inclusive = form.value.is_vat_inclusive

  let netExVat, vatSales
  if (inclusive) {
    netExVat = Math.round(gross / (1 + rate) * 100) / 100
    vatSales = Math.round((gross - netExVat) * 100) / 100
  } else {
    vatSales = Math.round(gross * rate * 100) / 100
    netExVat = gross
  }

  const deductible = form.value.platform_fees + form.value.advertising_fees + form.value.shipping_fees + form.value.cost_of_goods
  const vatPurchases = Math.round((deductible / (1 + rate) * rate + form.value.import_vat_paid) * 100) / 100
  const netVat = Math.round((vatSales - vatPurchases - creditForward.value) * 100) / 100

  const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return [
    { label: '含税销售额', value: fmt(gross) },
    { label: '未税销售额', value: fmt(netExVat) },
    { label: '', value: '' },
    { label: '销项 VAT（应交）', value: fmt(vatSales), color: '#e6a23c' },
    { label: '进项 VAT（已付）', value: fmt(vatPurchases), color: '#67c23a' },
    { label: '上期留抵', value: fmt(creditForward.value) },
    { label: '', value: '' },
    { label: netVat >= 0 ? '本期应缴 VAT' : '本期留抵（可结转下期）', value: fmt(Math.abs(netVat)), bold: true, color: netVat >= 0 ? '#f56c6c' : '#67c23a', fontSize: '16px' },
  ]
})

// Profit preview
const profitSummary = computed(() => {
  const gross = form.value.platform_sales - form.value.platform_refunds
  const rate = form.value.vat_rate || 0.07
  const inclusive = form.value.is_vat_inclusive
  const netExVat = inclusive ? gross / (1 + rate) : gross
  const totalCosts = form.value.cost_of_goods + form.value.platform_fees + form.value.advertising_fees + form.value.shipping_fees
  const totalExpenses = form.value.rental_fees + form.value.salary_fees + form.value.warehouse_fees + form.value.other_expenses
  const profit = netExVat - totalCosts - totalExpenses

  const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return [
    { label: '净销售收入（未税）', value: fmt(netExVat) },
    { label: '电商费用合计', value: fmt(totalCosts) },
    { label: '经营成本合计', value: fmt(totalExpenses) },
    { label: '', value: '' },
    { label: '预测利润', value: fmt(profit), bold: true, color: profit >= 0 ? '#67c23a' : '#f56c6c', fontSize: '16px' },
    { label: '实际回款', value: fmt(form.value.actual_received), color: '#409eff' },
  ]
})

const isPeriodLocked = computed(() => {
  const p = periods.value.find(p => p.id === selectedPeriodId.value)
  return p?.status === 'locked'
})

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('加载公司失败', e) }
}
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const onCompanyChange = () => { selectedPeriodId.value = null; fetchPeriods() }

const fetchSales = async () => {
  isSaved.value = false
  if (!selectedPeriodId.value) return
  skeletonLoading.value = true
  try {
    const data = await api.get('/ecommerce/sales', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
    if (data) {
      Object.assign(form.value, {
        platform: data.platform || '',
        store_name: data.store_name || '',
        platform_sales: parseFloat(data.platform_sales) || 0,
        shipping_income: parseFloat(data.shipping_income) || 0,
        discounts: parseFloat(data.discounts) || 0,
        platform_refunds: parseFloat(data.platform_refunds) || 0,
        other_income: parseFloat(data.other_income) || 0,
        is_vat_inclusive: data.is_vat_inclusive !== false,
        vat_rate: parseFloat(data.vat_rate) || 0.07,
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
        actual_received: parseFloat(data.actual_received) || 0,
        collection_status: data.collection_status || 'uncollected',
        tax_invoice_issued: data.tax_invoice_issued === true,
        notes: data.notes || '',
      })
      isSaved.value = true
    } else {
      form.value = emptyForm()
    }
  } catch (e) { console.error('加载销售数据失败', e) }
  finally { skeletonLoading.value = false }
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
    const gross = form.value.platform_sales - form.value.platform_refunds
    const inclusive = form.value.is_vat_inclusive
    const rate = form.value.vat_rate || 0.07
    const netExVat = inclusive ? gross / (1 + rate) : gross
    const vatSales = inclusive ? gross - netExVat : gross * rate

    const deductible = form.value.platform_fees + form.value.advertising_fees + form.value.shipping_fees + form.value.cost_of_goods
    const vatPurchases = deductible / (1 + rate) * rate + form.value.import_vat_paid
    const netVat = vatSales - vatPurchases - creditForward.value

    await api.post('/vat-report', {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      sales_amount: Math.round(netExVat * 100) / 100,
      vat_sales: Math.round(vatSales * 100) / 100,
      vat_purchases: Math.round(vatPurchases * 100) / 100,
      credit_forward: creditForward.value,
      vat_payable: netVat > 0 ? Math.round(netVat * 100) / 100 : 0,
      vat_credit_carry: netVat < 0 ? Math.round(Math.abs(netVat) * 100) / 100 : 0,
      status: 'draft',
    })
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  } finally { saving.value = false }
}

onMounted(fetchCompanies)
</script>
