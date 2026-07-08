<template>
  <div class="page">
    <div class="page-header">
      <el-select v-model="companyId" placeholder="客户公司" @change="loadPeriods" style="width:220px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="periodId" placeholder="会计期间" style="width:200px;margin-left:12px" filterable>
        <el-option v-for="p in periods" :key="p.id" :label="p.year+'年'+p.month+'月'" :value="p.id" />
      </el-select>
    </div>

    <!-- Step 1: Upload -->
    <el-card style="margin-bottom:16px">
      <template #header><span :class="step>=1 ? 'step-active' : ''">Step 1 — 上传 CSV 文件</span></template>
      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :limit="1"
        accept=".csv,.xlsx"
        :on-change="onFileChange"
        drag
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽 CSV 文件到此处，或 <em>点击选择</em></div>
        <template #tip><div class="el-upload__tip">支持 Shopee / Lazada / TikTok Shop 后台导出的 CSV / Excel</div></template>
      </el-upload>
      <div v-if="platformDetected" class="plat-badge">
        <el-tag type="success" size="large">{{ platformName }} 已识别 ✅</el-tag>
        <span style="margin-left:12px;color:#909399">共 {{ totalRows }} 行数据</span>
        <el-button type="primary" @click="goStep2" style="margin-left:16px">下一步 →</el-button>
      </div>
    </el-card>

    <!-- Step 2: AI 智能字段映射 -->
    <el-card v-if="step >= 2" style="margin-bottom:16px">
      <template #header>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span :class="step>=2 ? 'step-active' : ''">Step 2 — 字段映射 & 数据预览</span>
          <el-button size="small" text @click="remapWithAI" :loading="remapping">重新识别</el-button>
        </div>
      </template>
      <el-alert type="success" :closable="false" show-icon style="margin-bottom:12px">
        AI 已自动识别字段对应关系，请检查确认。不确定的列会标记为"待确认"。
      </el-alert>
      <el-table :data="columnMapping" border size="small" style="margin-bottom:16px">
        <el-table-column prop="csvHeader" label="CSV 列名" width="200" />
        <el-table-column label="系统字段 / 映射结果" min-width="280">
          <template #default="{ row, $index }">
            <template v-if="!row.editing">
              <el-tag v-if="row.mappedTo" :type="row.confidence === 'high' || row.confidence === 'exact' ? 'success' : row.confidence === 'medium' ? 'warning' : 'info'" size="small" effect="plain">
                {{ getFieldLabel(row.mappedTo) }}
              </el-tag>
              <el-tag v-else type="danger" size="small" effect="plain">待确认</el-tag>
              <span v-if="row.confidence === 'exact'" style="color:#67c23a;font-size:11px;margin-left:6px">精准</span>
              <span v-else-if="row.confidence === 'high'" style="color:#409eff;font-size:11px;margin-left:6px">高</span>
              <span v-else-if="row.confidence === 'medium'" style="color:#e6a23c;font-size:11px;margin-left:6px">中</span>
              <el-button link type="primary" size="small" style="margin-left:8px" @click="startEditMapping($index)">修正</el-button>
            </template>
            <template v-else>
              <el-select v-model="row.mappedTo" size="small" placeholder="选择字段" style="width:180px" @change="row.editing = false">
                <el-option label="(忽略此列)" value="" />
                <el-option v-for="f in standardFields" :key="f.value" :label="f.label + ' (' + f.desc + ')'" :value="f.value" />
              </el-select>
              <el-button link size="small" style="margin-left:4px" @click="row.editing = false">取消</el-button>
            </template>
          </template>
        </el-table-column>
        <el-table-column label="预览值" min-width="160">
          <template #default="{ row }">{{ row.previewValue }}</template>
        </el-table-column>
      </el-table>

      <h4 style="margin:12px 0 8px;color:#606266">生成电商销售记录预览（前5行）</h4>
      <el-table :data="salesPreview" border size="small" max-height="320">
        <el-table-column prop="platform" label="平台" width="90" />
        <el-table-column prop="order_date" label="订单日期" width="110" />
        <el-table-column prop="order_no" label="订单号" min-width="140" />
        <el-table-column label="销售额" width="110" align="right">
          <template #default="{row}">{{ formatNum(row.platform_sales) }}</template>
        </el-table-column>
        <el-table-column label="运费收入" width="90" align="right">
          <template #default="{row}">{{ formatNum(row.shipping_income) }}</template>
        </el-table-column>
        <el-table-column label="平台佣金" width="90" align="right">
          <template #default="{row}">{{ formatNum(row.platform_fees) }}</template>
        </el-table-column>
        <el-table-column label="销项VAT" width="100" align="right">
          <template #default="{row}">{{ formatNum(row.vat_sales) }}</template>
        </el-table-column>
        <el-table-column prop="collection_status" label="回款状态" width="80">
          <template #default><el-tag size="small" type="info">未回款</el-tag></template>
        </el-table-column>
      </el-table>
      <el-button type="primary" @click="goStep3" style="margin-top:12px">确认映射 → 下一步</el-button>
    </el-card>

    <!-- Step 3: Confirm import -->
    <el-card v-if="step >= 3" style="margin-bottom:16px">
      <template #header><span :class="step>=3 ? 'step-active' : ''">Step 3 — 确认导入</span></template>
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
        每行 CSV 将生成一条电商销售记录，VAT 申报和利润表可自动读取。
      </el-alert>
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="平台">{{ platformName }}</el-descriptions-item>
        <el-descriptions-item label="会计期间">{{ selectedPeriodLabel }}</el-descriptions-item>
        <el-descriptions-item label="总记录数">{{ totalRows }}</el-descriptions-item>
        <el-descriptions-item label="销售额合计">{{ formatNum(importSummary.totalSales) }} THB</el-descriptions-item>
        <el-descriptions-item label="销项VAT合计">{{ formatNum(importSummary.totalVatSales) }} THB</el-descriptions-item>
        <el-descriptions-item label="平台佣金合计">{{ formatNum(importSummary.totalFees) }} THB</el-descriptions-item>
      </el-descriptions>
      <div style="margin-top:16px;display:flex;gap:12px;align-items:center">
        <el-button type="primary" size="large" :loading="importing" @click="doImport">
          确认导入 {{ totalRows }} 条记录
        </el-button>
        <el-button @click="step=2" :disabled="importing">返回上一步</el-button>
      </div>
    </el-card>

    <!-- Import result -->
    <el-card v-if="importResult" style="margin-bottom:16px">
      <template #header><span>📊 导入结果</span></template>
      <el-alert :type="importResult.failed_rows ? 'warning' : 'success'" :closable="false" show-icon>
        {{ importResult.platform }} — 共 {{ importResult.total_rows }} 条，
        成功 <b>{{ importResult.success_rows }}</b> 条
        <span v-if="importResult.failed_rows">，失败 <b style="color:#f56c6c">{{ importResult.failed_rows }}</b> 条</span>
      </el-alert>
      <div v-if="importResult.errors?.length" style="margin-top:8px">
        <div v-for="(e,i) in importResult.errors" :key="i" style="color:#f56c6c;font-size:13px">{{ e }}</div>
      </div>
    </el-card>

    <!-- Import history -->
    <el-card>
      <template #header><span>📋 导入历史</span></template>
      <el-table :data="history" border size="small">
        <el-table-column prop="created_at" label="时间" width="170">
          <template #default="{row}">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column prop="filename" label="文件名" min-width="200" />
        <el-table-column label="结果" width="150">
          <template #default="{row}">
            <el-tag :type="row.status === 'completed' ? 'success' : 'danger'" size="small">
              成功 {{ row.success_rows }} / 总数 {{ row.total_rows }}
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
import { ElMessage } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'

const companyId = ref(null)
const companies = ref([])
const periods = ref([])
const periodId = ref(null)

const step = ref(1)
const csvFile = ref(null)
const platformDetected = ref('')
const platformName = ref('')
const totalRows = ref(0)
const allHeaders = ref([])
const standardFields = ref([])
const columnMapping = ref([])
const importResult = ref(null)
const importing = ref(false)
const history = ref([])

// Sales preview from CSV first 5 rows
const salesPreview = computed(() => {
  if (!csvFile.value || !columnMapping.value.length) return []
  // Re-parse the CSV client-side for preview (simpler than re-uploading)
  return []
})

// Import summary for confirmation
const importSummary = computed(() => {
  if (!platformDetected.value) return { totalSales: 0, totalVatSales: 0, totalFees: 0 }
  // Will be populated after preview data comes back
  return previewSummary.value
})

const previewSummary = ref({ totalSales: 0, totalVatSales: 0, totalFees: 0 })

const selectedPeriodLabel = computed(() => {
  const p = periods.value.find(x => x.id === periodId.value)
  return p ? p.year + '年' + p.month + '月' : '未选择'
})

function formatNum(n) { return (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const remapping = ref(false)

function getFieldLabel(field) {
  const f = standardFields.value.find(x => x.value === field)
  return f ? f.label : field
}

function startEditMapping(idx) {
  columnMapping.value[idx].editing = true
}

async function remapWithAI() {
  if (!csvFile.value) return
  remapping.value = true
  try {
    const formData = new FormData()
    formData.append('file', csvFile.value)
    formData.append('company_id', companyId.value)
    const data = await api.post('/platform-import/ai-map', formData)
    const aiMap = data.ai_mapping || {}
    for (const row of columnMapping.value) {
      const ai = aiMap[row.csvHeader]
      if (ai?.field) {
        row.mappedTo = ai.field
        row.confidence = ai.confidence
      }
    }
    ElMessage.success('AI 重新映射完成')
  } catch (e) {
    ElMessage.warning('AI 映射失败，请手动调整: ' + (e.response?.data?.error || e.message))
  } finally { remapping.value = false }
}

const uploadRef = ref(null)

function formatTime(t) { return t ? new Date(t).toLocaleString('zh-CN') : '-' }

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = Array.isArray(data) ? data : []
  if (companies.value.length) { companyId.value = companies.value[0].id; loadPeriods(); loadHistory() }
}

async function loadPeriods() {
  if (!companyId.value) return
  try { const data = await api.get('/periods', { params: { company_id: companyId.value } }); periods.value = Array.isArray(data) ? data : [] } catch (e) { periods.value = [] }
}

async function loadHistory() {
  if (!companyId.value) return
  try { history.value = await api.get('/platform-import/history', { params: { company_id: companyId.value } }) } catch (e) { history.value = [] }
}

async function onFileChange(file) {
  csvFile.value = file.raw
  const formData = new FormData()
  formData.append('file', file.raw)
  formData.append('company_id', companyId.value)
  try {
    const data = await api.post('/platform-import/preview', formData, {
      
    })
    platformDetected.value = data.platform_detected
    platformName.value = data.platform_name
    totalRows.value = data.total_rows
    allHeaders.value = data.all_headers
    standardFields.value = (data.standard_fields || []).map(f => ({ value: f.value, label: f.label, desc: f.desc }))

    // Build column mapping from AI results
    const aiMap = data.ai_mapping || {}
    const mapping = []
    for (const h of data.all_headers) {
      const ai = aiMap[h]
      const matched = ai?.field || ''
      const confidence = ai?.confidence || 'none'
      const previewVal = data.preview_rows?.[0]?.[h] || ''
      mapping.push({
        csvHeader: h,
        mappedTo: matched,
        confidence: confidence,
        previewValue: String(previewVal).slice(0, 40),
        editing: false,
      })
    }
    columnMapping.value = mapping

    // Build sales preview summary
    const rows = data.preview_rows || []
    let sumSales = 0, sumFees = 0
    for (const r of rows) {
      const amt = parseFloat(String(r['Total Amount'] || r['Total'] || 0).replace(/[^\d.]/g, '')) || 0
      const fee = parseFloat(String(r['Commission Fee'] || r['Commission'] || r['Platform Commission'] || 0).replace(/[^\d.]/g, '')) || 0
      sumSales += amt; sumFees += fee
    }
    // Scale to total from first 5 preview
    const scale = data.total_rows > 0 && rows.length > 0 ? data.total_rows / rows.length : 1
    previewSummary.value = {
      totalSales: Math.round(sumSales * scale * 100) / 100,
      totalVatSales: Math.round(sumSales * scale / 1.07 * 0.07 * 100) / 100,
      totalFees: Math.round(sumFees * scale * 100) / 100
    }

    step.value = 2
  } catch (e) { ElMessage.error('解析失败: ' + (e.response?.data?.error || e.message)) }
}

function goStep2() { step.value = 2 }
function goStep3() { step.value = 3 }

async function doImport() {
  if (!periodId.value) { ElMessage.warning('请选择会计期间'); return }
  importing.value = true
  try {
    const formData = new FormData()
    formData.append('file', csvFile.value)
    formData.append('company_id', companyId.value)
    formData.append('period_id', periodId.value)
    formData.append('platform', platformDetected.value)
    formData.append('import_as', 'ecommerce_sales,vat_output')
    importResult.value = await api.post('/platform-import/import', formData, {
      
    })
    ElMessage.success(`导入成功 ${importResult.value.success_rows} 条`)
    loadHistory()
  } catch (e) { ElMessage.error('导入失败: ' + (e.response?.data?.error || e.message)) }
  finally { importing.value = false }
}

onMounted(() => { loadCompanies() })
</script>

<style scoped>
.page { padding: 8px; }
.page-header { margin-bottom: 16px; display: flex; align-items: center; }
.step-active { color: #409eff; font-weight: bold; }
.plat-badge { margin-top: 16px; display: flex; align-items: center; }
.tip-text { color: #909399; font-size: 13px; }
</style>
