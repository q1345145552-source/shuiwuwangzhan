<template>
  <div class="page">
    <div class="page-header">
      <el-select v-model="companyId" placeholder="客户公司" @change="loadRates" style="width:220px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="year" @change="loadRates" style="width:110px;margin-left:12px">
        <el-option v-for="y in [2024,2025,2026]" :key="y" :label="String(y)" :value="y" />
      </el-select>
      <el-button type="primary" @click="openDialog()" style="margin-left:12px">+ 添加汇率</el-button>
      <el-button @click="openBatchDialog" style="margin-left:8px">📦 批量填充</el-button>
      <el-button @click="openCopyDialog" style="margin-left:8px">📋 从其他公司复制</el-button>
      <el-button @click="openBatchAllDialog" style="margin-left:8px">🌐 应用到所有公司</el-button>
    </div>

    <!-- 汇率表格 -->
    <el-card style="margin-bottom:16px">
      <template #header><span>📊 {{ year }} 年月度汇率</span></template>
      <el-table :data="rates" border stripe size="small">
        <el-table-column prop="month" label="月份" width="80">
          <template #default="{row}">{{ row.month }}月</template>
        </el-table-column>
        <el-table-column label="1 CNY = ? THB" width="180">
          <template #default="{row}">
            <span v-if="row.rate_thb_cny" style="font-weight:bold;color:#409eff">{{ row.rate_thb_cny }}</span>
            <el-tag v-else type="info" size="small">未设置</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="1 THB = ? CNY" width="180">
          <template #default="{row}">
            <span v-if="row.rate_cny_thb">{{ row.rate_cny_thb }}</span>
            <span v-else style="color:#c0c4cc">-</span>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="120">
          <template #default="{row}">
            <el-tag v-if="row.source" size="small">{{ row.source }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140">
          <template #default="{row}">
            <el-button v-if="row.rate_thb_cny" size="small" @click="openDialog(row)">编辑</el-button>
            <el-button v-if="row.rate_thb_cny" size="small" type="danger" @click="deleteRate(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 汇率换算器 -->
    <el-card>
      <template #header><span>🔄 汇率换算器</span></template>
      <el-row :gutter="16" style="align-items:center">
        <el-col :span="6">
          <el-input-number v-model="conv.amount" :min="0" :precision="2" style="width:100%" placeholder="金额" size="large" />
        </el-col>
        <el-col :span="3">
          <el-select v-model="conv.from" size="large" style="width:100%">
            <el-option label="CNY" value="cny" />
            <el-option label="THB" value="thb" />
          </el-select>
        </el-col>
        <el-col :span="1"><span style="font-size:18px">→</span></el-col>
        <el-col :span="3">
          <el-select v-model="conv.to" size="large" style="width:100%">
            <el-option label="THB" value="thb" />
            <el-option label="CNY" value="cny" />
          </el-select>
        </el-col>
        <el-col :span="3">
          <el-input-number v-model="conv.rate" :min="0" :precision="4" :step="0.01" style="width:100%" placeholder="汇率" size="large" />
        </el-col>
        <el-col :span="4">
          <div class="convert-result" v-if="convertedResult !== null">
            = <b>{{ fmt(convertedResult) }} {{ conv.to.toUpperCase() }}</b>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <!-- 添加/编辑弹窗 -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="400px">
      <el-form :model="form" label-width="120px">
        <el-form-item label="月份"><el-select v-model="form.month" style="width:100%"><el-option v-for="m in 12" :key="m" :label="m+'月'" :value="m" /></el-select></el-form-item>
        <el-form-item label="1 CNY = THB"><el-input-number v-model="form.rate_thb_cny" :min="0" :precision="4" :step="0.1" style="width:100%" /></el-form-item>
        <el-form-item label="来源"><el-input v-model="form.source" placeholder="manual/bank_of_thailand" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.notes" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible=false">取消</el-button><el-button type="primary" :loading="saveLoading" @click="saveRate">保存</el-button></template>
    </el-dialog>

    <!-- 批量填充弹窗 -->
    <el-dialog v-model="batchVisible" title="批量填充全年汇率" width="400px">
      <el-form label-width="120px">
        <el-form-item label="1 CNY = THB"><el-input-number v-model="batchRate" :min="0" :precision="4" style="width:100%" /></el-form-item>
        <el-form-item label="来源"><el-input v-model="batchSource" placeholder="manual" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="batchVisible=false">取消</el-button><el-button type="primary" :loading="batchLoading" @click="saveBatch">填充全部12个月</el-button></template>
    </el-dialog>

    <!-- 从其他公司复制弹窗 -->
    <el-dialog v-model="copyVisible" title="从其他公司复制汇率" width="500px">
      <el-form label-width="80px">
        <el-form-item label="源公司">
          <el-select v-model="copySourceId" placeholder="选择源公司" style="width:100%" filterable>
            <el-option v-for="c in companies.filter(x=>x.id!==companyId)" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标公司">
          <el-select v-model="copyTargetIds" placeholder="选择目标公司(可多选)" style="width:100%" multiple filterable>
            <el-option v-for="c in companies.filter(x=>x.id!==copySourceId)" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="年份"><el-input-number v-model="copyYear" :min="2020" :max="2030" style="width:100%" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="copyVisible=false">取消</el-button><el-button type="primary" :loading="copyLoading" @click="doCopyRates">执行复制</el-button></template>
    </el-dialog>

    <!-- 批量应用到所有公司弹窗 -->
    <el-dialog v-model="batchAllVisible" title="批量应用到所有公司" width="450px">
      <el-form label-width="100px">
        <el-form-item label="年份"><el-input-number v-model="batchAllYear" :min="2020" :max="2030" style="width:100%" /></el-form-item>
        <el-form-item label="汇率 (CNY→THB)"><el-input-number v-model="batchAllRate" :min="0" :precision="4" style="width:100%" /></el-form-item>
        <el-form-item label="覆盖已有">
          <el-switch v-model="batchAllOverride" active-text="覆盖" inactive-text="仅填空" />
          <span style="margin-left:8px;color:#999;font-size:12px">关闭：仅填充没有汇率的月份</span>
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="batchAllVisible=false">取消</el-button><el-button type="primary" :loading="batchAllLoading" @click="doBatchAll">执行</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import api from '../api'
import { ElMessage, ElMessageBox } from 'element-plus'

const fmt = v => (parseFloat(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const companyId = ref(null), companies = ref([]), year = ref(new Date().getFullYear()), rates = ref([])

const dialogVisible = ref(false), dialogTitle = ref(''), saveLoading = ref(false)
const form = reactive({ id:null, month:new Date().getMonth()+1, rate_thb_cny:4.5000, source:'manual', notes:'' })

const batchVisible = ref(false), batchRate = ref(4.5000), batchSource = ref('manual'), batchLoading = ref(false)
const copyVisible = ref(false), copySourceId = ref(null), copyTargetIds = ref([]), copyYear = ref(new Date().getFullYear()), copyLoading = ref(false)
const batchAllVisible = ref(false), batchAllYear = ref(new Date().getFullYear()), batchAllRate = ref(4.5000), batchAllOverride = ref(false), batchAllLoading = ref(false)

const conv = reactive({ amount:10000, from:'cny', to:'thb', rate:4.5000 })

const convertedResult = computed(() => {
  if (!conv.amount || !conv.rate) return null
  if (conv.from === conv.to) return conv.amount
  return conv.from === 'cny' ? (conv.amount * conv.rate).toFixed(2) : (conv.amount / conv.rate).toFixed(2)
})

// When month changes, try to get rate from table
watch(() => [conv.from, conv.to, conv.amount], () => {
  // Try to auto-fill rate from current month
  const current = rates.value.find(r => r.month === new Date().getMonth() + 1)
  if (current?.rate_thb_cny) conv.rate = parseFloat(current.rate_thb_cny)
})

async function loadCompanies(){
  const d=await api.get('/companies'); companies.value=Array.isArray(d)?d:[]
  if(companies.value.length){companyId.value=companies.value[0].id;loadRates()}
}
async function loadRates(){
  if(!companyId.value)return
  try{const d=await api.get('/exchange/rates',{params:{company_id:companyId.value,year:year.value}});rates.value=d.items||[]
  // Auto-fill converter rate
  const cur=rates.value.find(r=>r.month===new Date().getMonth()+1)
  if(cur?.rate_thb_cny) conv.rate=parseFloat(cur.rate_thb_cny)}
  catch(e){}
}
function openDialog(row){
  if(row){
    dialogTitle.value='编辑汇率';Object.assign(form,{id:row.id,month:row.month,rate_thb_cny:parseFloat(row.rate_thb_cny),source:row.source||'manual',notes:row.notes||''})
  }else{
    dialogTitle.value='添加汇率';Object.assign(form,{id:null,month:new Date().getMonth()+1,rate_thb_cny:4.5000,source:'manual',notes:''})
  }
  dialogVisible.value=true
}
async function saveRate(){
  saveLoading.value=true
  try{
    await api.post('/exchange/rates',{company_id:companyId.value,month:form.month,year:year.value,rate_thb_cny:form.rate_thb_cny,source:form.source,notes:form.notes})
    ElMessage.success('汇率已保存');dialogVisible.value=false;loadRates()
  }catch(e){ElMessage.error('保存失败')}
  finally{saveLoading.value=false}
}
async function deleteRate(row){
  try{await ElMessageBox.confirm(`删除 ${row.month}月汇率？`,'确认',{type:'warning'});await api.delete('/exchange/rates/'+row.id);ElMessage.success('已删除');loadRates()}
  catch(e){}
}
async function saveBatch(){
  batchLoading.value=true
  try{
    await api.post('/exchange/rates/batch',{company_id:companyId.value,year:year.value,rate_thb_cny:batchRate.value,source:batchSource.value})
    ElMessage.success('全年汇率已填充');batchVisible.value=false;loadRates()
  }catch(e){ElMessage.error('失败')}
  finally{batchLoading.value=false}
}
// Copy from another company
function openCopyDialog() { copySourceId.value = null; copyTargetIds.value = []; copyYear.value = year.value; copyVisible.value = true }
async function doCopyRates() {
  if (!copySourceId.value || !copyTargetIds.value.length) { ElMessage.error('请选择源公司和目标公司'); return }
  copyLoading.value = true
  try {
    const r = await api.post('/exchange/copy-to-companies', { source_company_id: copySourceId.value, target_company_ids: copyTargetIds.value, year: copyYear.value })
    ElMessage.success(r.message || '复制完成'); copyVisible.value = false; loadRates()
  } catch(e) { ElMessage.error(e.response?.data?.error || '复制失败') }
  finally { copyLoading.value = false }
}

// Batch apply to all companies
function openBatchAllDialog() { batchAllYear.value = year.value; batchAllRate.value = 4.5000; batchAllOverride.value = false; batchAllVisible.value = true }
async function doBatchAll() {
  if (!batchAllRate.value || batchAllRate.value <= 0) { ElMessage.error('汇率必须大于0'); return }
  batchAllLoading.value = true
  try {
    const r = await api.post('/exchange/batch-copy-all', { year: batchAllYear.value, rate: batchAllRate.value, override_existing: batchAllOverride.value })
    ElMessage.success(r.message || '操作完成'); batchAllVisible.value = false; loadRates()
  } catch(e) { ElMessage.error(e.response?.data?.error || '操作失败') }
  finally { batchAllLoading.value = false }
}

onMounted(()=>{loadCompanies()})
</script>

<style scoped>
.page{padding:8px}.page-header{display:flex;align-items:center;margin-bottom:16px;gap:8px}
.convert-result{font-size:20px;white-space:nowrap}.convert-result b{color:#409eff}
</style>
