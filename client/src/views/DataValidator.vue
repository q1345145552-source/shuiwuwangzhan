<template>
  <div class="page">
    <div class="page-header">
      <el-select v-model="companyId" placeholder="客户公司" @change="onCompanyChange" style="width:240px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="year" @change="onYearChange" style="width:120px;margin-left:12px">
        <el-option v-for="y in yearOpts" :key="y" :label="String(y)" :value="y" />
      </el-select>
      <el-button type="primary" :loading="fullCheckLoading" @click="runFullCheck" style="margin-left:12px">🔍 一键全量检查</el-button>
    </div>

    <!-- 全量检查结果 -->
    <el-card v-if="fullCheckResult" style="margin-bottom:16px">
      <template #header>
        <span>📊 全量检查结果 — {{ fullCheckResult.summary.passed }}/{{ fullCheckResult.summary.total_checks }} 通过</span>
      </template>
      <el-row :gutter="16">
        <el-col :span="8" v-for="(item, key) in fullCheckCards" :key="key">
          <el-card shadow="hover" :class="['check-card', item.ok ? 'ok' : 'fail']">
            <div class="check-icon">{{ item.ok ? '✅' : '❌' }}</div>
            <div class="check-title">{{ item.label }}</div>
            <div class="check-detail">{{ item.detail }}</div>
          </el-card>
        </el-col>
      </el-row>
    </el-card>

    <!-- Tab: 销售额 vs VAT -->
    <el-card style="margin-bottom:16px">
      <template #header>
        <span>📈 销售额 vs VAT 一致性
          <el-tag v-if="salesVat.summary" :type="salesVat.summary.total_mismatch ? 'danger' : 'success'" size="small" style="margin-left:8px">
            {{ salesVat.summary.total_mismatch ? '❌ ' + salesVat.summary.total_mismatch + ' 个差异' : '全部一致' }}
          </el-tag>
        </span>
        <el-button size="small" style="float:right" @click="checkSalesVat" :loading="salesVatLoading">运行检查</el-button>
      </template>
      <el-table :data="salesVat.checks" v-loading="salesVatLoading" border>
        <el-table-column label="月份" width="80"><template #default="{row}">{{ row.month }}月</template></el-table-column>
        <el-table-column label="销售额(不含税)" width="160"><template #default="{row}">{{ fmt(row.sales_revenue) }}</template></el-table-column>
        <el-table-column label="申报销项VAT" width="140"><template #default="{row}">{{ fmt(row.vat_reported) }}</template></el-table-column>
        <el-table-column label="应有销项VAT" width="140"><template #default="{row}">{{ fmt(row.vat_expected) }}</template></el-table-column>
        <el-table-column label="差异" width="120">
          <template #default="{row}"><span :style="{color:row.match?'#67c23a':'#f56c6c'}">{{ fmt(row.difference) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="80"><template #default="{row}">{{ row.match ? '✅' : '❌' }}</template></el-table-column>
      </el-table>
    </el-card>

    <!-- Tab: 进项VAT -->
    <el-card style="margin-bottom:16px">
      <template #header>
        <span>📥 进项 VAT 一致性
          <el-tag v-if="inputVat.summary" :type="inputVat.summary.total_mismatch ? 'danger' : 'success'" size="small" style="margin-left:8px">
            {{ inputVat.summary.total_mismatch ? '❌ ' + inputVat.summary.total_mismatch + ' 个差异' : '全部一致' }}
          </el-tag>
        </span>
        <el-button size="small" style="float:right" @click="checkInputVat" :loading="inputVatLoading">运行检查</el-button>
      </template>
      <el-table :data="inputVat.checks" v-loading="inputVatLoading" border>
        <el-table-column label="月份" width="80"><template #default="{row}">{{ row.month }}月</template></el-table-column>
        <el-table-column label="明细可抵扣VAT" width="160"><template #default="{row}">{{ fmt(row.input_vat_from_details) }}</template></el-table-column>
        <el-table-column label="申报进项VAT" width="160"><template #default="{row}">{{ fmt(row.input_vat_reported) }}</template></el-table-column>
        <el-table-column label="状态" width="80"><template #default="{row}">{{ row.match ? '✅' : '❌' }}</template></el-table-column>
      </el-table>
    </el-card>

    <!-- Tab: WHT 一致性 -->
    <el-card style="margin-bottom:16px">
      <template #header>
        <span>🧾 WHT 一致性检查
          <el-tag v-if="whtCheck.summary" :type="whtCheck.summary.unmatched ? 'danger' : 'success'" size="small" style="margin-left:8px">
            {{ whtCheck.summary.unmatched ? '❌ ' + whtCheck.summary.unmatched + ' 条未匹配' : '全部匹配' }}
          </el-tag>
        </span>
        <el-button size="small" style="float:right" @click="checkWht" :loading="whtLoading">运行检查</el-button>
      </template>
      <el-table :data="whtCheck.items" v-loading="whtLoading" border>
        <el-table-column label="月份" width="80"><template #default="{row}">{{ row.month }}月</template></el-table-column>
        <el-table-column label="收款方" prop="payee_name" width="150" />
        <el-table-column label="费用金额" width="130"><template #default="{row}">{{ fmt(row.amount) }}</template></el-table-column>
        <el-table-column label="WHT金额" width="120"><template #default="{row}">{{ fmt(row.wht_amount) }}</template></el-table-column>
        <el-table-column label="50Tavi凭证号" prop="wht_certificate_no" width="150" />
        <el-table-column label="WHT申报匹配" width="130">
          <template #default="{row}">{{ row.matched ? '✅ 已匹配' : '❌ 未找到' }}</template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Tab: 数据完整性 -->
    <el-card>
      <template #header>
        <span>📋 数据完整性检查
          <template v-if="dataCompleteness.summary">
            <el-tag type="success" size="small" style="margin-left:8px">完整 {{ dataCompleteness.summary.complete }}</el-tag>
            <el-tag type="warning" size="small" style="margin-left:4px">部分 {{ dataCompleteness.summary.partial }}</el-tag>
            <el-tag type="danger" size="small" style="margin-left:4px">缺失 {{ dataCompleteness.summary.missing }}</el-tag>
          </template>
        </span>
        <el-button size="small" style="float:right" @click="checkMissing" :loading="missingLoading">运行检查</el-button>
      </template>
      <el-table :data="dataCompleteness.checks" v-loading="missingLoading" border>
        <el-table-column label="月份" width="80"><template #default="{row}">{{ row.month }}月</template></el-table-column>
        <el-table-column label="销售数据" width="100"><template #default="{row}">{{ row.has_sales ? '✅' : '❌' }}</template></el-table-column>
        <el-table-column label="VAT明细" width="100"><template #default="{row}">{{ row.has_vat_details ? '✅' : '❌' }}</template></el-table-column>
        <el-table-column label="VAT申报" width="100"><template #default="{row}">{{ row.has_vat_report ? '✅' : '❌' }}</template></el-table-column>
        <el-table-column label="费用" width="80"><template #default="{row}">{{ row.has_expenses ? '✅' : '❌' }}</template></el-table-column>
        <el-table-column label="银行流水" width="100"><template #default="{row}">{{ row.has_bank ? '✅' : '❌' }}</template></el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{row}">
            <el-tag :type="row.status === 'complete' ? 'success' : row.status === 'partial' ? 'warning' : 'danger'" size="small">
              {{ row.status === 'complete' ? '完整' : row.status === 'partial' ? '部分' : '缺失' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import api from '../api'

const companyId = ref(null)
const year = ref(new Date().getFullYear())
const yearOpts = [2023, 2024, 2025, 2026]
const companies = ref([])

const salesVat = reactive({ checks: [], summary: null })
const inputVat = reactive({ checks: [], summary: null })
const whtCheck = reactive({ items: [], summary: null })
const dataCompleteness = reactive({ checks: [], summary: null })
const fullCheckResult = ref(null)

const salesVatLoading = ref(false), inputVatLoading = ref(false)
const whtLoading = ref(false), missingLoading = ref(false), fullCheckLoading = ref(false)

const fmt = v => (parseFloat(v) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fullCheckCards = computed(() => {
  if (!fullCheckResult.value) return {}
  const r = fullCheckResult.value.results
  return {
    sales_vat: { label: '销售额 vs VAT', ok: r.sales_vat.mismatches === 0,
      detail: r.sales_vat.mismatches ? r.sales_vat.mismatches + ' 差异, ' + fmt(r.sales_vat.total_difference) + ' THB' : '全部一致' },
    input_vat: { label: '进项VAT一致性', ok: r.input_vat.mismatches === 0,
      detail: r.input_vat.mismatches ? r.input_vat.mismatches + ' 差异' : '全部一致' },
    wht: { label: 'WHT匹配', ok: r.expense_wht.unmatched === 0,
      detail: r.expense_wht.unmatched ? r.expense_wht.unmatched + '/' + r.expense_wht.total + ' 未匹配' : '全部匹配' },
    completeness: { label: '数据完整', ok: r.data_completeness.missing + r.data_completeness.partial === 0,
      detail: `完整${r.data_completeness.complete} | 部分${r.data_completeness.partial} | 缺失${r.data_completeness.missing}` }
  }
})

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = Array.isArray(data) ? data : []
  if (companies.value.length) companyId.value = companies.value[0].id
}

function post(path, body) { return api.post(path, body) }
function runIfCompany(fn, loading) {
  if (!companyId.value) return
  fn(loading)
}

async function checkSalesVat() {
  salesVatLoading.value = true
  try { const d = await post('/data-validator/check-sales-vat', { company_id: companyId.value, year: year.value }); salesVat.checks = d.checks; salesVat.summary = d.summary } catch (e) { /* noop */ }
  finally { salesVatLoading.value = false }
}
async function checkInputVat() {
  inputVatLoading.value = true
  try { const d = await post('/data-validator/check-input-vat', { company_id: companyId.value, year: year.value }); inputVat.checks = d.checks; inputVat.summary = d.summary } catch (e) { /* noop */ }
  finally { inputVatLoading.value = false }
}
async function checkWht() {
  whtLoading.value = true
  try { const d = await post('/data-validator/check-expense-wht', { company_id: companyId.value, year: year.value }); whtCheck.items = d.items; whtCheck.summary = d.summary } catch (e) { /* noop */ }
  finally { whtLoading.value = false }
}
async function checkMissing() {
  missingLoading.value = true
  try { const d = await post('/data-validator/check-missing-data', { company_id: companyId.value, year: year.value }); dataCompleteness.checks = d.checks; dataCompleteness.summary = d.summary } catch (e) { /* noop */ }
  finally { missingLoading.value = false }
}
async function runFullCheck() {
  fullCheckLoading.value = true
  try {
    const d = await post('/data-validator/full-check', { company_id: companyId.value, year: year.value })
    fullCheckResult.value = d
    // Also refresh all tabs
    await Promise.all([checkSalesVat(), checkInputVat(), checkWht(), checkMissing()])
  } catch (e) { /* noop */ }
  finally { fullCheckLoading.value = false }
}

function onCompanyChange() { fullCheckResult.value = null }
function onYearChange() { fullCheckResult.value = null }

onMounted(() => { loadCompanies() })
</script>

<style scoped>
.page { padding: 8px; }
.page-header { display: flex; align-items: center; margin-bottom: 16px; gap: 8px; }
.check-card { text-align: center; padding: 8px; }
.check-card.ok { border-left: 4px solid #67c23a; }
.check-card.fail { border-left: 4px solid #f56c6c; }
.check-icon { font-size: 28px; }
.check-title { font-weight: bold; margin: 8px 0 4px; }
.check-detail { color: #909399; font-size: 13px; }
</style>
