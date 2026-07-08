<template>
  <div class="ecommerce-sales">
    <!-- 顶部：公司 + 期间选择 -->
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
      <!-- 录入表单 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-weight:bold">{{ editingId ? '编辑记录' : '新增记录' }}</span>
            <el-button v-if="editingId" size="small" @click="resetForm">取消编辑</el-button>
          </div>
        </template>

        <!-- 第一行：平台 + 店铺 + 日期 + 订单号 + 含税/未税 -->
        <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px">
          <div style="width:100px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">平台</div>
            <el-select v-model="form.platform" placeholder="选择" style="width:100px" size="default" clearable>
              <el-option v-for="p in platforms" :key="p" :label="p" :value="p" />
            </el-select>
          </div>
          <div style="width:140px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">店铺名称</div>
            <el-input v-model="form.store_name" placeholder="店铺名" size="default" />
          </div>
          <div style="width:130px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">订单日期</div>
            <el-date-picker v-model="form.order_date" type="date" placeholder="日期" style="width:130px" value-format="YYYY-MM-DD" />
          </div>
          <div style="width:130px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">订单号</div>
            <el-input v-model="form.order_no" placeholder="#订单号" size="default" />
          </div>
          <div style="width:170px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">VAT 方式</div>
            <el-radio-group v-model="form.is_vat_inclusive" size="small">
              <el-radio-button :value="true">含税</el-radio-button>
              <el-radio-button :value="false">未税</el-radio-button>
            </el-radio-group>
          </div>
        </div>

        <!-- 第二行：销售额 + 运费 + 折扣 + 退款 + VAT税率 + 试算 -->
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
          <div style="width:130px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">销售额</div>
            <el-input-number v-model="form.platform_sales" :min="0" :precision="2" controls-position="right" style="width:130px" />
          </div>
          <div style="width:100px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">运费收入</div>
            <el-input-number v-model="form.shipping_income" :min="0" :precision="2" controls-position="right" style="width:100px" />
          </div>
          <div style="width:90px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">折扣</div>
            <el-input-number v-model="form.discounts" :min="0" :precision="2" controls-position="right" style="width:90px" />
          </div>
          <div style="width:100px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">退款</div>
            <el-input-number v-model="form.platform_refunds" :min="0" :precision="2" controls-position="right" style="width:100px" />
          </div>
          <div style="width:90px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">VAT 税率</div>
            <el-input-number v-model="form.vat_rate" :min="0" :max="1" :precision="4" :step="0.01" controls-position="right" style="width:90px" size="small" />
          </div>
          <div style="background:#f5f7fa;padding:6px 12px;border-radius:4px;font-size:12px;text-align:center">
            <span style="color:#909399">未税 {{ fmt(vatPreview.netExVat) }}</span>
            <span style="color:#e6a23c;font-weight:bold;margin-left:8px">VAT {{ fmt(vatPreview.vatSales) }}</span>
          </div>
        </div>

        <!-- 第三行：手续费 + 广告 + 物流 + 采购 + 回款 + 回款状态 -->
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
          <div style="width:110px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">平台手续费</div>
            <el-input-number v-model="form.platform_fees" :min="0" :precision="2" controls-position="right" style="width:110px" />
          </div>
          <div style="width:90px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">广告费</div>
            <el-input-number v-model="form.advertising_fees" :min="0" :precision="2" controls-position="right" style="width:90px" />
          </div>
          <div style="width:90px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">物流费</div>
            <el-input-number v-model="form.shipping_fees" :min="0" :precision="2" controls-position="right" style="width:90px" />
          </div>
          <div style="width:110px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">采购成本</div>
            <el-input-number v-model="form.cost_of_goods" :min="0" :precision="2" controls-position="right" style="width:110px" />
          </div>
          <div style="width:130px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">实际回款</div>
            <el-input-number v-model="form.actual_received" :min="0" :precision="2" controls-position="right" style="width:130px" />
          </div>
          <div style="width:100px">
            <div style="font-size:12px;color:#666;margin-bottom:4px">回款状态</div>
            <el-select v-model="form.collection_status" style="width:100px" size="default">
              <el-option label="未回款" value="uncollected" />
              <el-option label="部分回款" value="partial" />
              <el-option label="已回款" value="collected" />
            </el-select>
          </div>
        </div>

        <!-- 第四行：开票 + 备注 + 按钮 -->
        <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
          <div>
            <span style="font-size:12px;color:#666;margin-right:4px">已开 Tax Invoice</span>
            <el-switch v-model="form.tax_invoice_issued" size="small" />
          </div>
          <div style="flex:1;min-width:200px">
            <el-input v-model="form.notes" placeholder="备注…" size="small" />
          </div>
          <div style="display:flex;gap:8px">
            <el-button type="primary" :loading="saveLoading" @click="saveRecord" :disabled="isPeriodLocked">
              {{ editingId ? '更新' : '保存' }}
            </el-button>
            <el-button @click="resetForm" :disabled="isPeriodLocked">清空</el-button>
          </div>
        </div>
      </el-card>

      <!-- 记录列表 -->
      <el-card style="margin-bottom:16px">
        <template #header>
          <span style="font-weight:bold">销售记录</span>
        </template>

        <el-table :data="records" border stripe v-loading="loading" size="small" max-height="500">
          <el-table-column label="平台" width="70" prop="platform">
            <template #default="{row}"><el-tag size="small" v-if="row.platform">{{ row.platform }}</el-tag></template>
          </el-table-column>
          <el-table-column label="店铺" min-width="100" prop="store_name" show-overflow-tooltip />
          <el-table-column label="日期" width="100" prop="order_date" />
          <el-table-column label="订单号" min-width="110" prop="order_no" show-overflow-tooltip />
          <el-table-column label="销售额" width="100" align="right">
            <template #default="{row}">{{ fmt(row.platform_sales) }}</template>
          </el-table-column>
          <el-table-column label="退款" width="80" align="right">
            <template #default="{row}">{{ fmt(row.platform_refunds) }}</template>
          </el-table-column>
          <el-table-column label="销项VAT" width="90" align="right">
            <template #default="{row}">{{ fmt(row.vat_sales_calculated) }}</template>
          </el-table-column>
          <el-table-column label="手续费" width="80" align="right">
            <template #default="{row}">{{ fmt(row.platform_fees) }}</template>
          </el-table-column>
          <el-table-column label="广告费" width="80" align="right">
            <template #default="{row}">{{ fmt(row.advertising_fees) }}</template>
          </el-table-column>
          <el-table-column label="回款" width="90" align="right">
            <template #default="{row}">{{ fmt(row.actual_received) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="75">
            <template #default="{row}">
              <el-tag size="small" v-if="row.collection_status==='collected'" type="success">已回款</el-tag>
              <el-tag size="small" v-else-if="row.collection_status==='partial'" type="warning">部分</el-tag>
              <el-tag size="small" v-else type="info">未回款</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="开票" width="50">
            <template #default="{row}"><span v-if="row.tax_invoice_issued" style="color:#67c23a">是</span><span v-else>否</span></template>
          </el-table-column>
          <el-table-column label="操作" width="100" fixed="right">
            <template #default="{row}">
              <el-button link type="primary" size="small" @click="editRecord(row)" :disabled="isPeriodLocked">编辑</el-button>
              <el-button link type="danger" size="small" @click="deleteRecord(row)" :disabled="isPeriodLocked">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 汇总行 -->
        <div style="margin-top:12px;padding:10px 16px;background:#f5f7fa;border-radius:6px;display:flex;flex-wrap:wrap;gap:20px;font-size:13px">
          <span style="color:#909399">共 {{ records.length }} 条</span>
          <span>销售总额 <b>{{ fmt(totals.grossSales) }}</b></span>
          <span>未税合计 <b>{{ fmt(totals.netSales) }}</b></span>
          <span>销项VAT <b style="color:#e6a23c">{{ fmt(totals.vatSales) }}</b></span>
          <span>手续费 <b>{{ fmt(totals.platformFees) }}</b></span>
          <span>广告费 <b>{{ fmt(totals.adFees) }}</b></span>
          <span>实际回款 <b style="color:#409eff">{{ fmt(totals.received) }}</b></span>
          <span>未回款 <b style="color:#f56c6c">{{ fmt(totals.uncollected) }}</b></span>
        </div>
      </el-card>

      <!-- 提示 -->
      <el-card>
        <div style="font-size:12px;color:#909399;line-height:2">
          <p>含税金额：平台结算单上包含增值税的金额。不含税金额：扣除增值税后的实际收入。</p>
          <p>销项增值税：你卖货时代收的增值税（7%），需要按时申报交给税务局。</p>
          <p>回款状态：标记这笔钱到账了没有。已回款 = 钱已到你泰国银行账户。</p>
        </div>
      </el-card>
    </div>

    <el-empty v-else description="请选择客户公司和会计期间" />
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
const editingId = ref(null)
const saveLoading = ref(false)

const isPeriodLocked = computed(() => {
  const p = store.periods?.find(p => p.id === selectedPeriodId.value)
  return p?.status === 'locked'
})

const emptyForm = () => ({
  platform: '', store_name: '', order_date: '', order_no: '',
  platform_sales: 0, shipping_income: 0, discounts: 0, platform_refunds: 0,
  is_vat_inclusive: true, vat_rate: 0.07,
  platform_fees: 0, advertising_fees: 0, shipping_fees: 0, cost_of_goods: 0,
  rental_fees: 0, salary_fees: 0, warehouse_fees: 0, other_expenses: 0,
  import_vat_paid: 0, import_duty_paid: 0,
  actual_received: 0, collection_status: 'uncollected', tax_invoice_issued: false, notes: '',
})

const form = ref(emptyForm())

const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const vatPreview = computed(() => {
  const gross = form.value.platform_sales - form.value.platform_refunds
  const rate = form.value.vat_rate || 0.07
  if (form.value.is_vat_inclusive) {
    const net = Math.round(gross / (1 + rate) * 100) / 100
    return { netExVat: net, vatSales: Math.round((gross - net) * 100) / 100 }
  }
  return { netExVat: gross, vatSales: Math.round(gross * rate * 100) / 100 }
})

const totals = computed(() => {
  let gs = 0, ns = 0, vs = 0, pf = 0, af = 0, rc = 0, uc = 0
  for (const r of records.value) {
    const gross = parseFloat(r.platform_sales || 0) - parseFloat(r.platform_refunds || 0)
    gs += gross
    ns += r.is_vat_inclusive !== false ? gross / (1 + (parseFloat(r.vat_rate) || 0.07)) : gross
    vs += parseFloat(r.vat_sales_calculated || 0)
    pf += parseFloat(r.platform_fees || 0)
    af += parseFloat(r.advertising_fees || 0)
    rc += parseFloat(r.actual_received || 0)
    if (r.collection_status === 'uncollected') uc += gross
  }
  return {
    grossSales: Math.round(gs * 100) / 100, netSales: Math.round(ns * 100) / 100,
    vatSales: Math.round(vs * 100) / 100, platformFees: Math.round(pf * 100) / 100,
    adFees: Math.round(af * 100) / 100, received: Math.round(rc * 100) / 100,
    uncollected: Math.round(uc * 100) / 100,
  }
})

const onCompanyChange = () => { selectedPeriodId.value = null; store.loadPeriods(selectedCompanyId.value) }

const fetchList = async () => {
  records.value = []
  if (!selectedPeriodId.value) return
  loading.value = true
  try {
    const data = await api.get('/ecommerce/sales', { params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value } })
    records.value = Array.isArray(data) ? data : (data ? [data] : [])
  } catch (e) { console.error(e) }
  finally { loading.value = false }
}

const editRecord = (row) => {
  editingId.value = row.id
  form.value = {
    platform: row.platform || '', store_name: row.store_name || '',
    order_date: row.order_date || '', order_no: row.order_no || '',
    platform_sales: parseFloat(row.platform_sales) || 0,
    shipping_income: parseFloat(row.shipping_income) || 0,
    discounts: parseFloat(row.discounts) || 0,
    platform_refunds: parseFloat(row.platform_refunds) || 0,
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
}

const resetForm = () => { editingId.value = null; form.value = emptyForm() }

const saveRecord = async () => {
  saveLoading.value = true
  try {
    const payload = { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value, ...form.value }
    if (editingId.value) {
      await api.put('/ecommerce/sales/' + editingId.value, payload)
      ElMessage.success('已更新')
    } else {
      await api.post('/ecommerce/sales', payload)
      ElMessage.success('已保存')
    }
    resetForm()
    fetchList()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '保存失败')
  } finally { saveLoading.value = false }
}

const deleteRecord = async (row) => {
  try {
    await ElMessageBox.confirm('确认删除该记录？', '删除', { type: 'warning' })
    await api.delete('/ecommerce/sales/' + row.id)
    ElMessage.success('已删除')
    if (editingId.value === row.id) resetForm()
    fetchList()
  } catch (e) { if (e !== 'cancel') ElMessage.error('删除失败') }
}

onMounted(() => store.loadCompanies?.())
</script>
