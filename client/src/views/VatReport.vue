<template>
  <div class="vat-report">
    <!-- 顶部工具栏 -->
    <el-card style="margin-bottom:16px">
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <span style="font-weight:bold;font-size:16px">VAT 指挥中心</span>
        <CompanyPeriodSelector
          v-model:company-id="selectedCompanyId" v-model:period-id="selectedPeriodId"
          @company-change="onCompanyChange" @period-change="fetchAll"
        />
        <el-button type="primary" :disabled="!report" @click="saveReport" :loading="saving">
          {{ report?.status === 'submitted' ? '已申报' : '保存' }}
        </el-button>
        <el-button :disabled="!report" :loading="exportLoading" @click="exportVat">导出 PDF</el-button>
        <el-button size="small" :disabled="!report" @click="exportXlsx">导出 Excel</el-button>
      </div>
    </el-card>

    <el-skeleton v-if="loading" :rows="8" animated style="padding:16px" />

    <template v-if="report">
      <!-- 数据来源提示 -->
      <el-alert
        :type="report.from_details ? 'success' : 'warning'"
        :closable="false"
        show-icon
        style="margin-bottom:16px"
      >
        <template #title>
          <span v-if="report.from_details">数据来源：VAT 明细表</span>
          <span v-else>数据来源：电商销售估算 — 建议补充 VAT 明细数据以获得精确申报数字</span>
        </template>
      </el-alert>

      <!-- 核心数字卡片行 -->
      <el-row :gutter="16" style="margin-bottom:16px">
        <el-col :span="8">
          <el-card shadow="hover">
            <div style="text-align:center">
              <div style="font-size:13px;color:#909399;margin-bottom:4px">本月含税销售额</div>
              <div style="font-size:24px;font-weight:bold;color:#303133">{{ fmt(report.gross_sales) }}</div>
              <div style="font-size:12px;color:#909399;margin-top:4px">不含税 {{ fmt(report.sales_amount) }}</div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover">
            <div style="text-align:center">
              <div style="font-size:13px;color:#909399;margin-bottom:4px">申报截止日期</div>
              <div style="font-size:22px;font-weight:bold;color:#409eff">{{ report.deadline }}</div>
              <div style="margin-top:4px">
                <el-tag v-if="report.status === 'submitted'" type="success" size="small">已申报</el-tag>
                <el-tag v-else-if="report.status === 'draft'" type="warning" size="small">草稿</el-tag>
                <el-tag v-else type="info" size="small">待申报</el-tag>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col :span="8">
          <el-card shadow="hover" :style="{ borderColor: report.vat_payable > 0 ? '#f56c6c' : '#67c23a' }">
            <div style="text-align:center">
              <div style="font-size:13px;color:#909399;margin-bottom:4px">
                {{ report.vat_payable > 0 ? '本期应缴 VAT' : '本期留抵结转' }}
              </div>
              <div :style="{ fontSize:'24px', fontWeight:'bold', color: report.vat_payable > 0 ? '#f56c6c' : '#67c23a' }">
                {{ fmt(report.vat_payable > 0 ? report.vat_payable : report.vat_credit_carry) }}
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <!-- 详细计算表 -->
      <el-card>
        <template #header><h3 style="margin:0">P.P.30 增值税申报 — {{ report.period.year }}年{{ report.period.month }}月</h3></template>

        <el-table :data="vatRows" :show-header="false" stripe style="width:100%">
          <el-table-column prop="label" width="280">
            <template #default="{ row }">
              <span :style="{ paddingLeft: row.indent ? '24px' : '0', fontWeight: row.bold ? 'bold' : 'normal' }">{{ row.label }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="value" align="right" width="180">
            <template #default="{ row }">
              <span :style="{ fontWeight: row.bold ? 'bold' : 'normal', color: row.color || '#303133', fontSize: row.bold ? '16px' : '14px' }">{{ row.value }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="hint" min-width="200">
            <template #default="{ row }">
              <span style="color:#909399;font-size:12px">{{ row.hint }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-card>

      <!-- VAT 来源追溯 -->
      <el-card style="margin-top:16px">
        <template #header>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-weight:bold;font-size:15px">VAT 来源追溯</span>
            <div style="display:flex;gap:8px;align-items:center">
              <el-tag v-if="traceLoading" size="small" type="info">加载中</el-tag>
              <el-button size="small" @click="fetchTrace" :loading="traceLoading" :disabled="!selectedPeriodId">刷新</el-button>
              <el-button size="small" @click="exportTraceXlsx" :disabled="!traceData">导出 Excel</el-button>
            </div>
          </div>
        </template>

        <template v-if="!traceData">
          <div style="text-align:center;padding:20px;color:#909399">
            <p>点击"刷新"加载 VAT 来源明细</p>
          </div>
        </template>
        <template v-else>
          <!-- 来源汇总 -->
          <el-row :gutter="16" style="margin-bottom:16px">
            <el-col :span="6">
              <div style="background:#f0f9eb;border-radius:6px;padding:12px;text-align:center">
                <div style="font-size:12px;color:#909399">销项 VAT 来源合计</div>
                <div style="font-size:20px;font-weight:bold;color:#67c23a">{{ fmt(traceData.summary.output_vat_total) }}</div>
                <div style="font-size:11px;color:#909399">{{ traceData.summary.output_record_count }} 条记录</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div style="background:#ecf5ff;border-radius:6px;padding:12px;text-align:center">
                <div style="font-size:12px;color:#909399">可抵扣进项 VAT</div>
                <div style="font-size:20px;font-weight:bold;color:#409eff">{{ fmt(traceData.summary.input_vat_deductible) }}</div>
                <div style="font-size:11px;color:#909399">计入申报</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div style="background:#fef0f0;border-radius:6px;padding:12px;text-align:center">
                <div style="font-size:12px;color:#909399">不可抵扣进项 VAT</div>
                <div style="font-size:20px;font-weight:bold;color:#f56c6c">{{ fmt(traceData.summary.input_vat_non_deductible) }}</div>
                <div style="font-size:11px;color:#909399">不计入申报</div>
              </div>
            </el-col>
            <el-col :span="6">
              <div style="background:#f5f7fa;border-radius:6px;padding:12px;text-align:center">
                <div style="font-size:12px;color:#909399">进项 VAT 合计</div>
                <div style="font-size:20px;font-weight:bold;color:#303133">{{ fmt(traceData.summary.input_vat_total) }}</div>
                <div style="font-size:11px;color:#909399">{{ traceData.summary.input_record_count }} 条记录</div>
              </div>
            </el-col>
          </el-row>

          <!-- Tab 切换 -->
          <el-tabs v-model="traceTab">
            <el-tab-pane label="销项 VAT 来源" name="output">
              <el-table :data="filteredOutputSources" border size="small" max-height="400" style="width:100%">
                <el-table-column prop="source_label" label="来源" width="130" />
                <el-table-column prop="platform" label="平台" width="80" />
                <el-table-column prop="order_date" label="日期" width="110" />
                <el-table-column prop="order_no" label="订单号" min-width="130" />
                <el-table-column label="含税金额" width="120" align="right">
                  <template #default="{row}">{{ fmt(row.gross_amount) }}</template>
                </el-table-column>
                <el-table-column label="未税金额" width="120" align="right">
                  <template #default="{row}">{{ fmt(row.net_amount) }}</template>
                </el-table-column>
                <el-table-column label="销项 VAT" width="110" align="right">
                  <template #default="{row}">
                    <span style="font-weight:bold;color:#e6a23c">{{ fmt(row.vat_amount) }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="customer_name" label="客户" width="80" />
                <el-table-column prop="description" label="说明" min-width="150" show-overflow-tooltip />
              </el-table>
              <div v-if="traceData.output_sources.length" style="margin-top:8px;color:#909399;font-size:12px">
                销项 VAT 不可直接修改。如需更正，请到「电商销售录入」或「VAT 明细」模块调整原始数据。
              </div>
            </el-tab-pane>

            <el-tab-pane label="进项 VAT 来源" name="input">
              <!-- 筛选 -->
              <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;flex-wrap:wrap">
                <el-select v-model="inputFilter.source_type" placeholder="来源类型" clearable size="small" style="width:160px">
                  <el-option label="全部" value="" />
                  <el-option v-for="(v, k) in traceData.breakdown.input_by_source" :key="k" :label="k" :value="k" />
                </el-select>
                <el-checkbox v-model="inputFilter.only_deductible" size="small">仅显示可抵扣</el-checkbox>
              </div>

              <el-table :data="filteredInputSources" border size="small" max-height="400" style="width:100%">
                <el-table-column prop="source_label" label="来源" width="140" />
                <el-table-column prop="category" label="类别" width="100" />
                <el-table-column prop="supplier_name" label="供应商" width="120" />
                <el-table-column prop="date" label="日期" width="110" />
                <el-table-column label="含税金额" width="120" align="right">
                  <template #default="{row}">{{ fmt(row.gross_amount) }}</template>
                </el-table-column>
                <el-table-column label="未税金额" width="120" align="right">
                  <template #default="{row}">{{ fmt(row.net_amount) }}</template>
                </el-table-column>
                <el-table-column label="进项 VAT" width="110" align="right">
                  <template #default="{row}">
                    <span :style="{fontWeight:'bold',color:row.deductible?'#409eff':'#c0c4cc'}">{{ fmt(row.vat_amount) }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="可抵扣" width="70" align="center">
                  <template #default="{row}">
                    <el-tag v-if="row.deductible" type="success" size="small">是</el-tag>
                    <el-tag v-else type="info" size="small">否</el-tag>
                  </template>
                </el-table-column>
                <el-table-column prop="non_deductible_reason" label="不可抵扣原因" width="160" show-overflow-tooltip />
                <el-table-column prop="description" label="说明" min-width="120" show-overflow-tooltip />
              </el-table>
              <div v-if="traceData.input_sources.length" style="margin-top:8px;color:#909399;font-size:12px">
                进项 VAT 不可直接修改。如需更正，请到「费用管理」「电商销售录入」或「VAT 明细」模块调整原始数据。
              </div>
            </el-tab-pane>
          </el-tabs>
        </template>
      </el-card>

      <!-- 指标说明 -->
      <el-card style="margin-top:16px">
        <template #header><span style="font-weight:bold">指标说明</span></template>
        <div style="font-size:13px;color:#606266;line-height:2">
          <p><b>销项 VAT</b>：来自平台销售收入。你卖货时代收的 7% 增值税，需要交给税务局。</p>
          <p><b>进项 VAT</b>：来自费用开支、进口清关已缴 VAT、可抵扣的平台扣费。是你花钱时已经付过的 VAT，可以抵扣。</p>
          <p><b>上月留抵</b>：上个月进项大于销项，多出来的 VAT 结转本月继续抵扣。</p>
          <p><b>应缴 VAT = 销项 VAT - 进项 VAT - 上月留抵</b>。正数要交钱，负数留到下月抵扣。</p>
        </div>
      </el-card>
    </template>

    <el-empty v-else description="请选择客户公司和会计期间" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api'
import { downloadFile } from '../api/download'
import CompanyPeriodSelector from '../components/CompanyPeriodSelector.vue'

const selectedCompanyId = ref(null)
const selectedPeriodId = ref(null)
const report = ref(null)
const loading = ref(false)
const saving = ref(false)
const exportLoading = ref(false)

const traceData = ref(null)
const traceLoading = ref(false)
const traceTab = ref('output')
const inputFilter = ref({ source_type: '', only_deductible: false })

function fmt(n) {
  if (n == null) return '0.00'
  return (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })
}

const vatRows = computed(() => {
  const r = report.value
  if (!r) return []
  return [
    { label: '不含税销售收入', value: fmt(r.sales_amount), indent: true, hint: '平台销售额扣除 VAT 后的净收入' },
    { label: '销项 VAT (7%)', value: fmt(r.vat_sales), indent: true, hint: '来自平台销售收入，需上交税务局', bold: true },
    { label: '', value: '', hint: '' },
    { label: '可抵扣进项 VAT', value: fmt(r.vat_purchases), indent: true, hint: '来自费用、进口 VAT、可抵扣扣费' },
    { label: '', value: '', hint: '' },
    { label: '上月留抵', value: fmt(r.credit_forward), indent: true, hint: '上月多缴的 VAT 结转本月抵扣' },
    { label: '', value: '', hint: '' },
    { label: r.vat_payable > 0 ? '本期应缴 VAT' : '本期留抵结转', value: fmt(r.vat_payable > 0 ? r.vat_payable : r.vat_credit_carry), bold: true, color: r.vat_payable > 0 ? '#f56c6c' : '#67c23a', hint: r.vat_payable > 0 ? '需在截止日前缴纳' : '结转下月继续抵扣' },
  ]
})

const filteredOutputSources = computed(() => {
  if (!traceData.value) return []
  return traceData.value.output_sources
})

const filteredInputSources = computed(() => {
  if (!traceData.value) return []
  let list = traceData.value.input_sources
  if (inputFilter.value.source_type) {
    list = list.filter(r => r.source_label === inputFilter.value.source_type)
  }
  if (inputFilter.value.only_deductible) {
    list = list.filter(r => r.deductible)
  }
  return list
})

const fetchReport = async () => {
  if (!selectedPeriodId.value) return
  loading.value = true
  try {
    report.value = await api.get('/vat-report', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch (e) { ElMessage.error('加载失败') } finally { loading.value = false }
}

const fetchTrace = async () => {
  if (!selectedPeriodId.value) return
  traceLoading.value = true
  try {
    traceData.value = await api.get('/vat-report/source-trace', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
  } catch (e) { ElMessage.error('来源追溯加载失败') } finally { traceLoading.value = false }
}

const fetchAll = () => {
  fetchReport()
  fetchTrace()
}

const onCompanyChange = () => { selectedPeriodId.value = null; report.value = null; traceData.value = null }

const saveReport = async () => {
  saving.value = true
  try {
    const r = report.value
    await api.post('/vat-report', {
      company_id: selectedCompanyId.value,
      period_id: selectedPeriodId.value,
      sales_amount: r.sales_amount,
      vat_sales: r.vat_sales,
      vat_purchases: r.vat_purchases,
      credit_forward: r.credit_forward,
      vat_payable: r.vat_payable,
      vat_credit_carry: r.vat_credit_carry,
      status: 'draft',
    })
    report.value.status = 'draft'
    ElMessage.success('保存成功')
  } catch (e) { ElMessage.error('保存失败') } finally { saving.value = false }
}

const exportVat = async () => {
  if (!selectedPeriodId.value) return
  exportLoading.value = true
  try {
    const res = await api.get('/export/vat-report', {
      params: { company_id: selectedCompanyId.value, period_id: selectedPeriodId.value }
    })
    window.open(res.url, '_blank')
    ElMessage.success('VAT 申报 PDF 已生成')
  } catch (e) { ElMessage.error('导出失败') } finally { exportLoading.value = false }
}

function exportXlsx() {
  const cid = selectedCompanyId.value, pid = selectedPeriodId.value
  if (!pid || !cid) return
  downloadFile('/api/export/vat-report/xlsx', 'vat_report.xlsx', { company_id: cid, period_id: pid })
}

function exportTraceXlsx() {
  const cid = selectedCompanyId.value, pid = selectedPeriodId.value
  if (!pid || !cid) return
  downloadFile('/api/export/vat-source-trace/xlsx', 'vat_source_trace.xlsx', { company_id: cid, period_id: pid })
}
</script>

<style scoped>
h3 { margin: 0; }
</style>
