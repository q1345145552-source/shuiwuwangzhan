<template>
  <div class="ecommerce-sales">
    <!-- 顶部选择器 -->
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold;font-size:18px">电商销售录入</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="fetchList"
          :show-lock-badge="true"
        />
        <el-tag v-if="isPeriodLocked" type="warning">期间已锁定（只读）</el-tag>
      </div>
    </el-card>

    <div v-if="selectedPeriodId">
      <!-- 订单列表 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h3 style="margin:0">📋 销售记录</h3>
            <el-button type="primary" @click="openDialog(null)" :disabled="isPeriodLocked">
              + 新增记录
            </el-button>
          </div>
        </template>

        <el-table :data="records" border stripe v-loading="loading" size="small" max-height="600">
          <el-table-column label="平台" width="80" prop="platform">
            <template #default="{row}">
              <el-tag size="small" v-if="row.platform">{{ row.platform }}</el-tag>
              <span v-else style="color:#ccc">-</span>
            </template>
          </el-table-column>
          <el-table-column label="店铺" min-width="120" prop="store_name" show-overflow-tooltip />
          <el-table-column label="订单日期" width="110" prop="order_date" />
          <el-table-column label="订单号" min-width="130" prop="order_no" show-overflow-tooltip />
          <el-table-column label="销售额" width="110" prop="platform_sales" align="right">
            <template #default="{row}">{{ fmt(row.platform_sales) }}</template>
          </el-table-column>
          <el-table-column label="退款" width="90" prop="platform_refunds" align="right">
            <template #default="{row}">{{ fmt(row.platform_refunds) }}</template>
          </el-table-column>
          <el-table-column label="销项VAT" width="100" prop="vat_sales_calculated" align="right">
            <template #default="{row}">{{ fmt(row.vat_sales_calculated) }}</template>
          </el-table-column>
          <el-table-column label="实际回款" width="110" prop="actual_received" align="right">
            <template #default="{row}">{{ fmt(row.actual_received) }}</template>
          </el-table-column>
          <el-table-column label="回款状态" width="90" prop="collection_status">
            <template #default="{row}">
              <el-tag size="small" v-if="row.collection_status==='collected'" type="success">已回款</el-tag>
              <el-tag size="small" v-else-if="row.collection_status==='partial'" type="warning">部分</el-tag>
              <el-tag size="small" v-else type="info">未回款</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="开票" width="60" prop="tax_invoice_issued">
            <template #default="{row}">
              <span v-if="row.tax_invoice_issued" style="color:#67c23a">✔</span>
              <span v-else style="color:#ccc">✘</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{row}">
              <el-button link type="primary" size="small" @click="openDialog(row)" :disabled="isPeriodLocked">编辑</el-button>
              <el-button link type="danger" size="small" @click="deleteRecord(row)" :disabled="isPeriodLocked">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 汇总行 -->
        <div style="margin-top:12px;padding:12px;background:#f5f7fa;border-radius:6px">
          <el-row :gutter="16" style="font-size:13px">
            <el-col :span="4">
              <div style="color:#909399">共 {{ records.length }} 条</div>
            </el-col>
            <el-col :span="3">
              <div>销售总额：<b>{{ fmt(totals.grossSales) }}</b></div>
            </el-col>
            <el-col :span="3">
              <div>未税合计：<b>{{ fmt(totals.netSales) }}</b></div>
            </el-col>
            <el-col :span="3">
              <div>销项VAT：<b style="color:#e6a23c">{{ fmt(totals.vatSales) }}</b></div>
            </el-col>
            <el-col :span="3">
              <div>手续费：<b>{{ fmt(totals.platformFees) }}</b></div>
            </el-col>
            <el-col :span="2">
              <div>广告费：<b>{{ fmt(totals.adFees) }}</b></div>
            </el-col>
            <el-col :span="3">
              <div>实际回款：<b style="color:#409eff">{{ fmt(totals.received) }}</b></div>
            </el-col>
            <el-col :span="3">
              <div>未回款：<b style="color:#f56c6c">{{ fmt(totals.uncollected) }}</b></div>
            </el-col>
          </el-row>
        </div>
      </el-card>

      <!-- 录入指南 -->
      <el-card>
        <template #header><h4 style="margin:0">📝 录入指南</h4></template>
        <div style="font-size:12px;color:#909399;line-height:2.2">
          <p>💡 <b>含税金额</b>：平台结算单上包含增值税的金额。<b>不含税金额</b>：扣除增值税后的实际收入。</p>
          <p>💡 <b>销项增值税</b>：你卖货时代收的增值税（7%），需要按时申报交给税务局。</p>
          <p>💡 <b>回款状态</b>：标记这笔钱到账了没有。<b>已回款</b> = 钱已到你泰国银行账户。</p>
          <p>📌 从 Shopee/Lazada Seller Center 导出订单报表 → 逐笔录入或参考汇总数填入 → 保存后自动计算 VAT。</p>
        </div>
      </el-card>
    </div>

    <el-empty v-else description="请选择客户公司和会计期间" />

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialogVisible" :title="dialogTitle" width="750px"
      :close-on-click-modal="false" destroy-on-close
    >
      <el-form :model="form" label-width="120px" size="default" style="max-height:60vh;overflow-y:auto;padding-right:8px">
        <el-divider content-position="left">🏪 平台信息</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="平台">
              <el-select v-model="form.platform" placeholder="选择平台" style="width:100%" clearable>
                <el-option v-for="p in platforms" :key="p" :label="p" :value="p" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="店铺名称">
              <el-input v-model="form.store_name" placeholder="如：蓝鲨泰国旗舰店" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="订单日期">
              <el-date-picker v-model="form.order_date" type="date" placeholder="选择日期" style="width:100%" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="订单号">
              <el-input v-model="form.order_no" placeholder="如：#123456789" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">💰 收入</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="销售额">
              <el-input-number v-model="form.platform_sales" :min="0" :precision="2" controls-position="right" style="width:100%" @change="calcVat" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="运费收入">
              <el-input-number v-model="form.shipping_income" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="优惠折扣">
              <el-input-number v-model="form.discounts" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="退款金额">
              <el-input-number v-model="form.platform_refunds" :min="0" :precision="2" controls-position="right" style="width:100%" @change="calcVat" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">🧾 增值税</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="金额类型">
              <el-radio-group v-model="form.is_vat_inclusive" @change="calcVat">
                <el-radio :value="true">含税金额</el-radio>
                <el-radio :value="false">未税金额</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="VAT 税率">
              <el-input-number v-model="form.vat_rate" :min="0" :max="1" :precision="4" :step="0.01" controls-position="right" style="width:140px" @change="calcVat" />
              <span style="font-size:12px;color:#999;margin-left:4px">默认 7%</span>
            </el-form-item>
          </el-col>
        </el-row>
        <!-- VAT 试算提示 -->
        <div style="background:#f0f9ff;padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px">
          <span v-if="form.is_vat_inclusive">
            含税 → 未税销售额 = {{ fmt(vatPreview.netExVat) }}，
            销项 VAT = {{ fmt(vatPreview.vatSales) }}
          </span>
          <span v-else>
            未税 → 销项 VAT = {{ fmt(vatPreview.vatSales) }}，
            含税总额 = {{ fmt(vatPreview.grossWithVat) }}
          </span>
        </div>

        <el-divider content-position="left">🛒 费用</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="平台手续费">
              <el-input-number v-model="form.platform_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="广告费">
              <el-input-number v-model="form.advertising_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="物流运费">
              <el-input-number v-model="form.shipping_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="采购成本">
              <el-input-number v-model="form.cost_of_goods" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="房租">
              <el-input-number v-model="form.rental_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="工资">
              <el-input-number v-model="form.salary_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="仓储费">
              <el-input-number v-model="form.warehouse_fees" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="其他费用">
              <el-input-number v-model="form.other_expenses" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">🚢 进口</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="进口VAT已缴">
              <el-input-number v-model="form.import_vat_paid" :min="0" :precision="2" controls-position="right" style="width:100%" />
              <span style="font-size:11px;color:#999">计入进项抵扣</span>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="进口关税已缴">
              <el-input-number v-model="form.import_duty_paid" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
        </el-row>

        <el-divider content-position="left">💳 回款与开票</el-divider>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="实际回款金额">
              <el-input-number v-model="form.actual_received" :min="0" :precision="2" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="回款状态">
              <el-select v-model="form.collection_status" style="width:100%">
                <el-option label="未回款" value="uncollected" />
                <el-option label="部分回款" value="partial" />
                <el-option label="已回款" value="collected" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="已开 Tax Invoice">
              <el-switch v-model="form.tax_invoice_issued" active-text="已开" inactive-text="未开" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="备注">
              <el-input v-model="form.notes" placeholder="补充说明…" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible=false">取消</el-button>
        <el-button type="primary" :loading="saveLoading" @click="saveRecord">保存</el-button>
      </template>
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

const platforms = ['Shopee', 'Lazada', 'TikTok', 'Temu', 'Other']
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const records = ref([])
const loading = ref(false)

const isPeriodLocked = computed(() => {
  const p = store.periods?.find(p => p.id === selectedPeriodId.value)
  return p?.status === 'locked'
})

const emptyForm = () => ({
  platform: '', store_name: '', order_date: '', order_no: '',
  platform_sales: 0, shipping_income: 0, discounts: 0, platform_refunds: 0, other_income: 0,
  is_vat_inclusive: true, vat_rate: 0.07,
  platform_fees: 0, advertising_fees: 0, shipping_fees: 0, cost_of_goods: 0,
  rental_fees: 0, salary_fees: 0, warehouse_fees: 0, other_expenses: 0,
  import_vat_paid: 0, import_duty_paid: 0,
  actual_received: 0, collection_status: 'uncollected', tax_invoice_issued: false, notes: '',
})

const form = ref(emptyForm())
const dialogVisible = ref(false)
const dialogTitle = ref('新增记录')
const saveLoading = ref(false)
const editingId = ref(null)

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// VAT preview in dialog
const vatPreview = computed(() => {
  const gross = form.value.platform_sales - form.value.platform_refunds
  const rate = form.value.vat_rate || 0.07
  if (form.value.is_vat_inclusive) {
    const netExVat = Math.round(gross / (1 + rate) * 100) / 100
    return { netExVat, vatSales: Math.round((gross - netExVat) * 100) / 100, grossWithVat: gross }
  }
  const vatSales = Math.round(gross * rate * 100) / 100
  return { netExVat: gross, vatSales, grossWithVat: gross + vatSales }
})

const calcVat = () => {} // reactive via computed already

// Totals across all records
const totals = computed(() => {
  let grossSales = 0, netSales = 0, vatSales = 0, platformFees = 0, adFees = 0, received = 0, uncollected = 0
  for (const r of records.value) {
    const gross = parseFloat(r.platform_sales || 0) - parseFloat(r.platform_refunds || 0)
    grossSales += gross
    const rate = parseFloat(r.vat_rate) || 0.07
    if (r.is_vat_inclusive !== false) {
      vatSales += parseFloat(r.vat_sales_calculated || 0)
      netSales += gross / (1 + rate)
    } else {
      vatSales += parseFloat(r.vat_sales_calculated || 0)
      netSales += gross
    }
    platformFees += parseFloat(r.platform_fees || 0)
    adFees += parseFloat(r.advertising_fees || 0)
    received += parseFloat(r.actual_received || 0)
    if (r.collection_status === 'uncollected') {
      uncollected += parseFloat(r.platform_sales || 0) - parseFloat(r.platform_refunds || 0) + parseFloat(r.shipping_income || 0) - parseFloat(r.platform_fees || 0) - parseFloat(r.advertising_fees || 0) - parseFloat(r.shipping_fees || 0) - parseFloat(r.discounts || 0)
    }
  }
  return {
    grossSales: Math.round(grossSales * 100) / 100,
    netSales: Math.round(netSales * 100) / 100,
    vatSales: Math.round(vatSales * 100) / 100,
    platformFees: Math.round(platformFees * 100) / 100,
    adFees: Math.round(adFees * 100) / 100,
    received: Math.round(received * 100) / 100,
    uncollected: Math.round(Math.max(0, uncollected) * 100) / 100,
  }
})

const onCompanyChange = () => { selectedPeriodId.value = null; store.loadPeriods(selectedCompanyId.value) }

const fetchList = async () => {
  records.value = []
  if (!selectedPeriodId.value) return
  loading.value = true
  try {
    const data = await api.get('/ecommerce/sales', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
    records.value = Array.isArray(data) ? data : (data ? [data] : [])
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const openDialog = (row) => {
  if (row) {
    dialogTitle.value = '编辑记录'
    editingId.value = row.id
    form.value = {
      platform: row.platform || '',
      store_name: row.store_name || '',
      order_date: row.order_date || '',
      order_no: row.order_no || '',
      platform_sales: parseFloat(row.platform_sales) || 0,
      shipping_income: parseFloat(row.shipping_income) || 0,
      discounts: parseFloat(row.discounts) || 0,
      platform_refunds: parseFloat(row.platform_refunds) || 0,
      other_income: parseFloat(row.other_income) || 0,
      is_vat_inclusive: row.is_vat_inclusive !== false,
      vat_rate: parseFloat(row.vat_rate) || 0.07,
      platform_fees: parseFloat(row.platform_fees) || 0,
      advertising_fees: parseFloat(row.advertising_fees) || 0,
      shipping_fees: parseFloat(row.shipping_fees) || 0,
      cost_of_goods: parseFloat(row.cost_of_goods) || 0,
      rental_fees: parseFloat(row.rental_fees) || 0,
      salary_fees: parseFloat(row.salary_fees) || 0,
      warehouse_fees: parseFloat(row.warehouse_fees) || 0,
      other_expenses: parseFloat(row.other_expenses) || 0,
      import_vat_paid: parseFloat(row.import_vat_paid) || 0,
      import_duty_paid: parseFloat(row.import_duty_paid) || 0,
      actual_received: parseFloat(row.actual_received) || 0,
      collection_status: row.collection_status || 'uncollected',
      tax_invoice_issued: row.tax_invoice_issued === true,
      notes: row.notes || '',
    }
  } else {
    dialogTitle.value = '新增记录'
    editingId.value = null
    form.value = emptyForm()
  }
  dialogVisible.value = true
}

const saveRecord = async () => {
  saveLoading.value = true
  try {
    const payload = {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      ...form.value,
    }
    if (editingId.value) {
      await api.put('/ecommerce/sales/' + editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await api.post('/ecommerce/sales', payload)
      ElMessage.success('已保存')
    }
    dialogVisible.value = false
    fetchList()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  } finally { saveLoading.value = false }
}

const deleteRecord = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该销售记录？', '删除', { type: 'warning' })
    await api.delete('/ecommerce/sales/' + row.id)
    ElMessage.success('已删除')
    fetchList()
  } catch (e) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(() => store.loadCompanies?.())
</script>
