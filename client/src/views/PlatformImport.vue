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
        accept=".csv"
        :on-change="onFileChange"
        drag
      >
        <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
        <div class="el-upload__text">拖拽 CSV 文件到此处，或 <em>点击选择</em></div>
        <template #tip><div class="el-upload__tip">支持 Shopee / Lazada / TikTok Shop 后台导出的原始 CSV</div></template>
      </el-upload>
      <div v-if="platformDetected" class="plat-badge">
        <el-tag type="success" size="large">{{ platformName }} 已识别 ✅</el-tag>
        <span style="margin-left:12px;color:#909399">共 {{ totalRows }} 行数据</span>
        <el-button type="primary" @click="goStep2" style="margin-left:16px">下一步 →</el-button>
      </div>
    </el-card>

    <!-- Step 2: Preview mapping -->
    <el-card v-if="step >= 2" style="margin-bottom:16px">
      <template #header><span :class="step>=2 ? 'step-active' : ''">Step 2 — 字段映射预览</span></template>
      <el-table :data="columnMapping" border size="small">
        <el-table-column prop="csvHeader" label="CSV 列名" width="220" />
        <el-table-column label="系统字段" width="220">
          <template #default="{ row }">
            <el-select v-model="row.mappedTo" size="small" placeholder="选择映射">
              <el-option label="(忽略)" value="" />
              <el-option v-for="f in standardFields" :key="f.value" :label="f.label" :value="f.value" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="预览值" min-width="200">
          <template #default="{ row }">{{ row.previewValue }}</template>
        </el-table-column>
      </el-table>
      <el-button type="primary" @click="goStep3" style="margin-top:12px">确认映射 → 下一步</el-button>
    </el-card>

    <!-- Step 3: Import config -->
    <el-card v-if="step >= 3" style="margin-bottom:16px">
      <template #header><span :class="step>=3 ? 'step-active' : ''">Step 3 — 导入配置</span></template>
      <el-checkbox-group v-model="importTargets" style="margin-bottom:12px">
        <el-checkbox value="vat_output" label="导入为销项明细（用于 VAT 申报）" />
        <el-checkbox value="ecommerce_sales" label="导入为销售汇总（用于利润表）" />
      </el-checkbox-group>
      <div class="tip-text">建议两项都勾选，数据会自动同步到对应模块</div>
      <el-button type="primary" size="large" :loading="importing" @click="doImport" style="margin-top:16px">
        🚀 确认导入 {{ totalRows }} 条数据
      </el-button>
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
const importTargets = ref(['vat_output', 'ecommerce_sales'])
const importResult = ref(null)
const importing = ref(false)
const history = ref([])

const uploadRef = ref(null)

function formatTime(t) { return t ? new Date(t).toLocaleString('zh-CN') : '-' }

async function loadCompanies() {
  const data = await api.get('/companies')
  companies.value = Array.isArray(data) ? data : []
  if (companies.value.length) { companyId.value = companies.value[0].id; loadPeriods(); loadHistory() }
}

async function loadPeriods() {
  if (!companyId.value) return
  try { const data = await api.get('/periods', { params: { company_id: companyId.value } }); periods.value = Array.isArray(data) ? data : [] } catch (e) {}
}

async function loadHistory() {
  if (!companyId.value) return
  try { history.value = await api.get('/platform-import/history', { params: { company_id: companyId.value } }) } catch (e) {}
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
    standardFields.value = Object.entries(data.standard_fields || {}).map(([k,v]) => ({ label: k, value: v }))

    // Build column mapping
    const mapping = []
    for (const h of data.all_headers) {
      const matched = data.columns_matched[h] || ''
      const previewVal = data.preview_rows[0]?.[h] || ''
      mapping.push({ csvHeader: h, mappedTo: matched, previewValue: String(previewVal).slice(0, 40) })
    }
    columnMapping.value = mapping
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
    formData.append('import_as', importTargets.value.join(','))
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
