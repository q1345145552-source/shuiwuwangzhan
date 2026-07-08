<template>
  <div class="profit-loss">
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold">简化利润表</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="fetchData"
        />
        <el-button :disabled="!data" :loading="exportLoading" @click="exportPdf">导出 PDF</el-button>
        <el-button size="small" @click="exportXlsx">Excel</el-button>
      </div>
    </el-card>

    <el-skeleton v-if="loading" :rows="12" animated style="padding:16px" />
    <el-card v-if="data">
      <template #header>
        <div style="text-align:center">
          <h2 style="margin:0">{{ companyName }} 利润表</h2>
          <p style="margin:4px 0 0;color:#999">{{ data.period?.year }}年{{ data.period?.month }}月</p>
        </div>
      </template>

      <table class="pl-table">
        <thead>
          <tr>
            <th>科目</th>
            <th style="text-align:right;width:160px">当月金额 (THB)</th>
            <th style="text-align:right;width:160px">本年度累计 (THB)</th>
          </tr>
        </thead>
        <tbody>
          <!-- 收入 -->
          <tr class="section-header"><td colspan="3">收入</td></tr>
          <tr>
            <td class="indent">平台总销售额（含VAT）</td>
            <td class="num">{{ fmt(data.sales.gross) }}</td>
            <td class="num">{{ fmt(ytd.sales.gross) }}</td>
          </tr>
          <tr>
            <td class="indent">减：退款</td>
            <td class="num">({{ fmt(data.sales.refunds) }})</td>
            <td class="num">({{ fmt(ytd.sales.refunds) }})</td>
          </tr>
          <tr>
            <td class="indent">加：运费收入</td>
            <td class="num">{{ fmt(data.sales.shipping_income) }}</td>
            <td class="num">{{ fmt(ytd.sales.shipping_income) }}</td>
          </tr>
          <tr>
            <td class="indent">减：优惠折扣</td>
            <td class="num">({{ fmt(data.sales.discounts) }})</td>
            <td class="num">({{ fmt(ytd.sales.discounts) }})</td>
          </tr>
          <tr>
            <td class="indent">加：平台补贴</td>
            <td class="num">{{ fmt(data.sales.platform_subsidy) }}</td>
            <td class="num">{{ fmt(ytd.sales.platform_subsidy) }}</td>
          </tr>
          <tr>
            <td class="indent">加：其他收入</td>
            <td class="num">{{ fmt(data.sales.other_income) }}</td>
            <td class="num">{{ fmt(ytd.sales.other_income) }}</td>
          </tr>
          <tr class="sub-total">
            <td>净销售收入（含VAT）</td>
            <td class="num">{{ fmt(data.sales.net) }}</td>
            <td class="num">{{ fmt(ytd.sales.net) }}</td>
          </tr>
          <tr>
            <td class="indent">减：销项 VAT</td>
            <td class="num" style="color:#f56c6c">({{ fmt(data.sales.vat_sales) }})</td>
            <td class="num" style="color:#f56c6c">({{ fmt(ytd.sales.vat_sales) }})</td>
          </tr>
          <tr class="sub-total">
            <td>不含税净销售收入</td>
            <td class="num" style="font-weight:bold">{{ fmt(data.sales.net_ex_vat) }}</td>
            <td class="num" style="font-weight:bold">{{ fmt(ytd.sales.net_ex_vat) }}</td>
          </tr>

          <!-- 成本 -->
          <tr class="section-header"><td colspan="3">成本</td></tr>
          <tr><td class="indent">采购成本</td><td class="num">{{ fmt(data.costs.cogs) }}</td><td class="num">{{ fmt(ytd.costs.cogs) }}</td></tr>
          <tr><td class="indent">平台佣金</td><td class="num">{{ fmt(data.costs.platform_fees) }}</td><td class="num">{{ fmt(ytd.costs.platform_fees) }}</td></tr>
          <tr><td class="indent">广告费</td><td class="num">{{ fmt(data.costs.advertising) }}</td><td class="num">{{ fmt(ytd.costs.advertising) }}</td></tr>
          <tr><td class="indent">物流运费</td><td class="num">{{ fmt(data.costs.shipping) }}</td><td class="num">{{ fmt(ytd.costs.shipping) }}</td></tr>
          <tr><td class="indent">交易手续费</td><td class="num">{{ fmt(data.costs.transaction_fee) }}</td><td class="num">{{ fmt(ytd.costs.transaction_fee) }}</td></tr>
          <tr><td class="indent">预扣税（WHT）</td><td class="num">{{ fmt(data.costs.wht_deducted) }}</td><td class="num">{{ fmt(ytd.costs.wht_deducted) }}</td></tr>
          <tr><td class="indent">活动服务费</td><td class="num">{{ fmt(data.costs.campaign_fee) }}</td><td class="num">{{ fmt(ytd.costs.campaign_fee) }}</td></tr>
          <tr><td class="indent">达人佣金</td><td class="num">{{ fmt(data.costs.affiliate_commission) }}</td><td class="num">{{ fmt(ytd.costs.affiliate_commission) }}</td></tr>
          <tr><td class="indent">COD 手续费</td><td class="num">{{ fmt(data.costs.cod_fee) }}</td><td class="num">{{ fmt(ytd.costs.cod_fee) }}</td></tr>
          <tr class="sub-total"><td>成本合计</td><td class="num">{{ fmt(data.costs.total) }}</td><td class="num">{{ fmt(ytd.costs.total) }}</td></tr>

          <!-- 进口 -->
          <tr class="section-header"><td colspan="3">进口</td></tr>
          <tr><td class="indent">进口 VAT 已缴</td><td class="num">{{ fmt(data.imports.import_vat) }}</td><td class="num">{{ fmt(ytd.imports.import_vat) }}</td></tr>
          <tr><td class="indent">进口关税已缴</td><td class="num">{{ fmt(data.imports.import_duty) }}</td><td class="num">{{ fmt(ytd.imports.import_duty) }}</td></tr>

          <!-- 毛利 -->
          <tr class="section-header"><td colspan="3">毛利</td></tr>
          <tr class="sub-total">
            <td>毛利</td>
            <td class="num" :style="{color: data.gross_profit >= 0 ? '#67c23a' : '#f56c6c'}">{{ fmt(data.gross_profit) }}</td>
            <td class="num" :style="{color: ytd.gross_profit >= 0 ? '#67c23a' : '#f56c6c'}">{{ fmt(ytd.gross_profit) }}</td>
          </tr>

          <!-- 费用 -->
          <tr class="section-header"><td colspan="3">费用</td></tr>
          <tr><td class="indent">房租</td><td class="num">{{ fmt(data.expenses.rent) }}</td><td class="num">{{ fmt(ytd.expenses.rent) }}</td></tr>
          <tr><td class="indent">工资</td><td class="num">{{ fmt(data.expenses.salary) }}</td><td class="num">{{ fmt(ytd.expenses.salary) }}</td></tr>
          <tr><td class="indent">仓储费</td><td class="num">{{ fmt(data.expenses.warehouse) }}</td><td class="num">{{ fmt(ytd.expenses.warehouse) }}</td></tr>
          <tr><td class="indent">其他费用</td><td class="num">{{ fmt(data.expenses.other) }}</td><td class="num">{{ fmt(ytd.expenses.other) }}</td></tr>
          <tr class="sub-total"><td>费用合计</td><td class="num">{{ fmt(data.expenses.total) }}</td><td class="num">{{ fmt(ytd.expenses.total) }}</td></tr>

          <!-- 净利润 -->
          <tr class="net-profit">
            <td>净利润</td>
            <td class="num" :style="{color: data.net_profit >= 0 ? '#67c23a' : '#f56c6c'}">{{ fmt(data.net_profit) }}</td>
            <td class="num" :style="{color: ytd.net_profit >= 0 ? '#67c23a' : '#f56c6c'}">{{ fmt(ytd.net_profit) }}</td>
          </tr>
        </tbody>
      </table>
    </el-card>

    <el-empty v-else description="请选择客户公司和会计期间" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useCompanyStore } from '../stores/currentCompany'
import { ElMessage } from 'element-plus'
import api from '../api'
import { downloadFile } from '../api/download'

const store = useCompanyStore()
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'

const companies = ref([])
const periods = ref([])
const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const data = ref(null)
const loading = ref(false)
const exportLoading = ref(false)
const companyName = ref('')

const emptySales = { gross: 0, refunds: 0, shipping_income: 0, discounts: 0, platform_subsidy: 0, other_income: 0, net: 0, net_ex_vat: 0, vat_sales: 0 }
const emptyCosts = { cogs: 0, platform_fees: 0, advertising: 0, shipping: 0, transaction_fee: 0, wht_deducted: 0, campaign_fee: 0, affiliate_commission: 0, cod_fee: 0, total: 0 }
const emptyExpenses = { rent: 0, salary: 0, warehouse: 0, other: 0, total: 0 }
const emptyImports = { import_vat: 0, import_duty: 0 }

const ytd = computed(() => data.value?.ytd || {
  sales: { ...emptySales }, costs: { ...emptyCosts }, expenses: { ...emptyExpenses }, imports: { ...emptyImports },
  gross_profit: 0, net_profit: 0,
})

const fmt = (v) => (v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const fetchCompanies = async () => {
  try { companies.value = await api.get('/companies') } catch (e) { console.error('ProfitLoss.vue: 请求失败', e) }
}
const fetchPeriods = () => store.loadPeriods(selectedCompanyId.value)
const onCompanyChange = () => {
  selectedPeriodId.value = null; data.value = null
  companyName.value = companies.value.find(c => c.id === selectedCompanyId.value)?.name || ''
  fetchPeriods()
}

const fetchData = async () => {
  if (!selectedPeriodId.value) return
  loading.value = true
  try {
    data.value = await api.get('/profit-loss', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch (e) { ElMessage.error('加载失败') } finally { loading.value = false }
}

const exportPdf = async () => {
  exportLoading.value = true
  try {
    const res = await api.get('/export/profit-loss', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
    window.open(res.url, '_blank')
    ElMessage.success('PDF 已生成')
  } catch { ElMessage.error('导出失败') } finally { exportLoading.value = false }
}

const exportXlsx = () => {
  const cid = selectedCompanyId.value, pid = selectedPeriodId.value
  if (!pid || !cid) return
  downloadFile('/api/export/profit-loss/xlsx', 'profit_loss.xlsx', { company_id: cid, period_id: pid })
}

onMounted(fetchCompanies)
</script>

<style scoped>
.pl-table { width:100%; border-collapse:collapse; font-size:15px }
.pl-table th { background:#f5f7fa; padding:10px 16px; border-bottom:2px solid #e4e7ed; text-align:left }
.pl-table td { padding:8px 16px; border-bottom:1px solid #ebeef5 }
.pl-table .section-header td { background:#f0f9eb; font-weight:bold; padding:10px 16px }
.pl-table .indent { padding-left:36px }
.pl-table .num { text-align:right; font-variant-numeric: tabular-nums }
.pl-table .sub-total td { font-weight:bold; border-top:1px solid #999 }
.pl-table .net-profit { font-size: 18px }
.pl-table .net-profit td { font-weight:bold; padding:14px 16px; border-top:2px solid #409eff; border-bottom:2px solid #409eff }
</style>
