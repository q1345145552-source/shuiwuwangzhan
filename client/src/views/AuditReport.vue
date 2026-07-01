<template>
  <div class="page">
    <div class="page-header">
      <el-select v-model="companyId" placeholder="客户公司" style="width:220px" filterable>
        <el-option v-for="c in companies" :key="c.id" :label="c.name" :value="c.id" />
      </el-select>
      <el-select v-model="year" style="width:110px;margin-left:12px">
        <el-option v-for="y in [2024,2025,2026]" :key="y" :label="String(y)" :value="y" />
      </el-select>
    </div>

    <!-- Report config -->
    <el-card style="margin-bottom:16px">
      <template #header><span>⚙️ 报告配置</span></template>
      <el-checkbox-group v-model="sections">
        <el-checkbox value="vat" label="VAT 分析" />
        <el-checkbox value="wht" label="WHT 分析" />
        <el-checkbox value="cit" label="CIT 分析" />
        <el-checkbox value="compliance" label="合规检查" />
        <el-checkbox value="recommendation" label="建议" />
      </el-checkbox-group>
      <div style="margin-top:12px">
        <el-button type="primary" size="large" :loading="generating" @click="generate" :disabled="!companyId || !sections.length">
          📄 生成稽查报告
        </el-button>
      </div>
    </el-card>

    <!-- Generated report summary -->
    <el-card v-if="reportResult" style="margin-bottom:16px">
      <template #header>
        <span>📊 报告摘要 — {{ reportResult.report_no }}
          <el-tag :type="riskTag(reportResult.risk_level)" size="large" style="margin-left:12px">{{ riskLabel(reportResult.risk_level) }}</el-tag>
        </span>
        <el-button type="success" size="small" style="float:right" @click="downloadPdf(reportResult.id)">📥 下载 PDF</el-button>
      </template>

      <el-row :gutter="16">
        <el-col :span="12" v-if="reportResult.sections?.vat">
          <el-card shadow="hover" class="section-card" :class="reportResult.summary.vat_diff===0 ? 'ok' : 'warn'">
            <div class="sec-title">📈 VAT 分析</div>
            <div>差异: {{ fmt(reportResult.summary.vat_diff) }} THB</div>
            <el-tag :type="reportResult.summary.vat_diff===0 ? 'success' : 'warning'" size="small">{{ reportResult.summary.vat_diff===0 ? '✅ 低风险' : '⚠ 有差异' }}</el-tag>
          </el-card>
        </el-col>
        <el-col :span="12" v-if="reportResult.sections?.wht">
          <el-card shadow="hover" class="section-card" :class="reportResult.summary.wht_unmatched===0 ? 'ok' : 'warn'">
            <div class="sec-title">🧾 WHT 分析</div>
            <div>未匹配: {{ fmt(reportResult.summary.wht_unmatched) }} THB</div>
            <el-tag :type="reportResult.summary.wht_unmatched===0 ? 'success' : 'warning'" size="small">{{ reportResult.summary.wht_unmatched===0 ? '✅ 全部匹配' : '⚠ 有遗漏' }}</el-tag>
          </el-card>
        </el-col>
        <el-col :span="12" v-if="reportResult.sections?.cit">
          <el-card shadow="hover" class="section-card" :class="reportResult.summary.cit_payable===0 ? 'ok' : 'warn'">
            <div class="sec-title">💰 CIT 分析</div>
            <div>应补: {{ fmt(reportResult.summary.cit_payable) }} THB</div>
            <el-tag :type="reportResult.summary.cit_payable===0 ? 'success' : 'warning'" size="small">{{ reportResult.summary.cit_payable===0 ? '✅ 已缴清' : '⚠ 待缴' }}</el-tag>
          </el-card>
        </el-col>
        <el-col :span="12" v-if="reportResult.sections?.compliance">
          <el-card shadow="hover" class="section-card" :class="reportResult.summary.overdue===0 ? 'ok' : 'warn'">
            <div class="sec-title">📋 合规</div>
            <div>逾期: {{ reportResult.summary.overdue }} 项</div>
            <el-tag :type="reportResult.summary.overdue===0 ? 'success' : 'warning'" size="small">{{ reportResult.summary.overdue===0 ? '✅ 良好' : '⚠ 有逾期' }}</el-tag>
          </el-card>
        </el-col>
      </el-row>

      <!-- Detail collapse -->
      <el-collapse style="margin-top:12px">
        <el-collapse-item title="查看完整报告" name="1">
          <div v-if="reportResult.sections?.vat" style="margin-bottom:8px">
            <b>VAT 分析</b>
            <div v-for="d in reportResult.sections.vat.monthly_data" :key="d.month" style="font-size:13px;color:#606266">
              {{ d.month }}月: 不含税 {{ fmt(d.net_sales) }}THB | 申报 {{ fmt(d.vat_declared) }} | 应有 {{ fmt(d.vat_expected) }} {{ Math.abs(d.difference) < 0.01 ? '✓' : '⚠ ' + fmt(d.difference) }}
            </div>
          </div>
          <div v-if="reportResult.sections?.wht?.unmatched_items?.length" style="margin-bottom:8px">
            <b>WHT 未匹配 ({{ reportResult.sections.wht.unmatched_items.length }} 笔)</b>
            <div v-for="u in reportResult.sections.wht.unmatched_items" :key="u" style="font-size:13px;color:#f56c6c">
              {{ u.month }}月: {{ u.payee }} | {{ u.category }} | WHT {{ fmt(u.wht_amount) }}THB
            </div>
          </div>
          <div v-if="reportResult.sections?.recommendation?.items?.length">
            <b>建议</b>
            <div v-for="(r,i) in reportResult.sections.recommendation.items" :key="i" style="font-size:13px">{{ i+1 }}. {{ r }}</div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <!-- History -->
    <el-card>
      <template #header><span>📋 历史报告</span></template>
      <el-table :data="history" border size="small" v-loading="histLoading">
        <el-table-column label="时间" width="170"><template #default="{r}">{{ fmtTime(r.created_at) }}</template></el-table-column>
        <el-table-column prop="report_no" label="报告编号" width="200" />
        <el-table-column prop="year" label="年份" width="80" />
        <el-table-column label="风险等级" width="130">
          <template #default="{row}"><el-tag :type="riskTag(row.risk_level)">{{ riskLabel(row.risk_level) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{row}">
            <el-button size="small" type="primary" @click="downloadPdf(row.id)">📥 下载</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../api'
import { ElMessage } from 'element-plus'

const fmt=v=>(parseFloat(v)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const fmtTime=t=>t?new Date(t).toLocaleString('zh-CN'):'-'
const riskTag=l=>({low:'success',medium:'warning',high:'danger'}[l]||'info')
const riskLabel=l=>({low:'✅ 低风险',medium:'⚡ 中风险',high:'⚠️ 高风险'}[l]||l)

const companyId=ref(null),companies=ref([]),year=ref(new Date().getFullYear())
const sections=ref(['vat','wht','cit','compliance','recommendation'])
const generating=ref(false),reportResult=ref(null)
const history=ref([]),histLoading=ref(false)

async function loadCompanies(){
  const d=await api.get('/companies');companies.value=Array.isArray(d)?d:[]
  if(companies.value.length){companyId.value=companies.value[0].id;loadHistory()}
}
async function loadHistory(){
  if(!companyId.value)return;histLoading.value=true
  try{history.value=await api.get('/audit-report/history',{params:{company_id:companyId.value}})}
  catch(e){}finally{histLoading.value=false}
}
async function generate(){
  generating.value=true
  try{
    reportResult.value=await api.post('/audit-report/generate',{company_id:companyId.value,year:year.value,include_sections:sections.value,language:'zh'})
    ElMessage.success('报告已生成: '+reportResult.value.report_no)
    loadHistory()
  }catch(e){ElMessage.error('生成失败: '+(e.response?.data?.error||e.message))}
  finally{generating.value=false}
}
function downloadPdf(id){
  api.get(`/audit-report/download/${id}`, { responseType: 'blob' }).then(blob => {
    const u = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = u; a.download = `report_${id}.pdf`; a.click()
    URL.revokeObjectURL(u)
  }).catch(() => ElMessage.error('下载失败'))
}
onMounted(()=>{loadCompanies()})
</script>

<style scoped>
.page{padding:8px}.page-header{display:flex;align-items:center;margin-bottom:16px;gap:8px}
.section-card{text-align:center;padding:8px}.section-card.ok{border-left:4px solid #67c23a}.section-card.warn{border-left:4px solid #e6a23c}
.sec-title{font-weight:bold;margin-bottom:8px;font-size:15px}
</style>
