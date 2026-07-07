<template>
  <div class="page">
    <el-card>
      <template #header><span>🧮 税务计算器</span></template>
      <el-tabs v-model="activeTab" type="border-card">
        <!-- TAB 1: VAT -->
        <el-tab-pane label="VAT 增值税" name="vat">
          <el-form label-width="130px" size="default" style="max-width:500px">
            <el-form-item label="含税销售额 (THB)">
              <el-input-number v-model="vatInput.amount" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="进项 VAT (THB)">
              <el-input-number v-model="vatInput.inputVat" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
          </el-form>
          <el-alert type="info" :closable="false" style="max-width:500px;margin-top:12px">
            <template #title>计算结果</template>
            <el-table :data="vatResult" size="small" :show-header="false" style="margin-top:8px">
              <el-table-column prop="label" width="160" />
              <el-table-column prop="value" />
            </el-table>
          </el-alert>
          <el-divider />
          <p style="color:#909399;font-size:13px">泰国增值税率 7%，计算公式：不含税 = 含税 ÷ 1.07，VAT = 不含税 × 0.07</p>
        </el-tab-pane>

        <!-- TAB 2: CIT -->
        <el-tab-pane label="CIT 企业所得税" name="cit">
          <el-form label-width="140px" size="default" style="max-width:500px">
            <el-form-item label="年收入 (THB)">
              <el-input-number v-model="citInput.revenue" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="年成本 (THB)">
              <el-input-number v-model="citInput.cost" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="年费用 (THB)">
              <el-input-number v-model="citInput.expenses" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="WHT 已抵扣 (THB)">
              <el-input-number v-model="citInput.whtPaid" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="半年预付 (THB)">
              <el-input-number v-model="citInput.halfYearPaid" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
          </el-form>
          <el-alert type="info" :closable="false" style="max-width:500px;margin-top:12px">
            <template #title>计算结果</template>
            <el-table :data="citResult" size="small" :show-header="false" style="margin-top:8px">
              <el-table-column prop="label" width="160" />
              <el-table-column prop="value" />
            </el-table>
          </el-alert>
          <el-divider />
          <p style="color:#909399;font-size:13px">
            SME 阶梯税率：净利润 ≤ 30万 → 0% | 30万-300万 → 15% | >300万 → 20%<br/>
            非 SME 统一 20%。应补(退) = 税额 − WHT − 半年预付
          </p>
        </el-tab-pane>

        <!-- TAB 3: PND.1 -->
        <el-tab-pane label="PND.1 工资预扣税" name="pnd1">
          <el-form label-width="150px" size="default" style="max-width:550px">
            <el-form-item label="月薪 (THB)">
              <el-input-number v-model="pnd1Input.salary" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="婚姻状态">
              <el-select v-model="pnd1Input.marital" style="width:200px">
                <el-option label="单身" value="single" />
                <el-option label="已婚" value="married" />
              </el-select>
            </el-form-item>
            <el-form-item label="配偶有无收入">
              <el-select v-model="pnd1Input.spouseIncome" :disabled="pnd1Input.marital==='single'" style="width:200px">
                <el-option label="无" value="no" />
                <el-option label="有" value="yes" />
              </el-select>
            </el-form-item>
            <el-form-item label="子女数 (≤20岁)">
              <el-input-number v-model="pnd1Input.children" :min="0" :max="10" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="赡养老人数">
              <el-input-number v-model="pnd1Input.elders" :min="0" :max="10" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="社保月扣缴 (THB)">
              <el-input-number v-model="pnd1Input.ssMonthly" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="保险年缴 (THB)">
              <el-input-number v-model="pnd1Input.insurance" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="房贷年利息 (THB)">
              <el-input-number v-model="pnd1Input.mortgage" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
          </el-form>
          <el-alert type="info" :closable="false" style="max-width:550px;margin-top:12px">
            <template #title>计算结果（年化）</template>
            <el-table :data="pnd1Result" size="small" :show-header="false" style="margin-top:8px">
              <el-table-column prop="label" width="180" />
              <el-table-column prop="value" />
            </el-table>
          </el-alert>
          <el-divider />
          <p style="color:#909399;font-size:13px">
            7级累进税率：0-150k→0% | 150k-300k→5% | 300k-500k→10% | 500k-750k→15% | 750k-1M→20% | 1M-2M→25% | 2M-5M→30% | >5M→35%
          </p>
        </el-tab-pane>

        <!-- TAB 4: WHT -->
        <el-tab-pane label="WHT 预扣税" name="wht">
          <el-form label-width="140px" size="default" style="max-width:500px">
            <el-form-item label="支付金额 (THB)">
              <el-input-number v-model="whtInput.amount" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
            <el-form-item label="付款类型">
              <el-select v-model="whtInput.type" style="width:200px">
                <el-option v-for="t in whtTypes" :key="t.key" :label="t.label" :value="t.key" />
              </el-select>
            </el-form-item>
          </el-form>
          <el-alert type="info" :closable="false" style="max-width:500px;margin-top:12px">
            <template #title>计算结果</template>
            <el-table :data="whtResult" size="small" :show-header="false" style="margin-top:8px">
              <el-table-column prop="label" width="160" />
              <el-table-column prop="value" />
            </el-table>
          </el-alert>
          <el-divider />
          <p style="color:#909399;font-size:13px">
            常见 PND.53 税率：租金 5% | 服务费 3% | 利息 1% | 股息 10% | 特许权 3% | 广告费 2% | 运输费 1%
          </p>
        </el-tab-pane>

        <!-- TAB 5: Social Security -->
        <el-tab-pane label="社保" name="social">
          <el-form label-width="140px" size="default" style="max-width:500px">
            <el-form-item label="月薪 (THB)">
              <el-input-number v-model="socialInput.salary" :min="0" :precision="2" :controls="true" style="width:200px" />
            </el-form-item>
          </el-form>
          <el-alert type="info" :closable="false" style="max-width:500px;margin-top:12px">
            <template #title>计算结果</template>
            <el-table :data="socialResult" size="small" :show-header="false" style="margin-top:8px">
              <el-table-column prop="label" width="160" />
              <el-table-column prop="value" />
            </el-table>
          </el-alert>
          <el-divider />
          <p style="color:#909399;font-size:13px">
            社保基数上限 15,000 THB，费率各 5%（雇主 5% + 员工 5%）
          </p>
        </el-tab-pane>
      </el-tabs>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'

const activeTab = ref('vat')

// ===== TAB 1: VAT =====
const vatInput = reactive({ amount: 350000, inputVat: 0 })

const vatResult = computed(() => {
  const exVat = vatInput.amount / 1.07
  const outputVat = exVat * 0.07
  const net = outputVat - vatInput.inputVat
  return [
    { label: '不含税销售额', value: exVat.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '销项 VAT (7%)', value: outputVat.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: net >= 0 ? '应缴 VAT' : '留抵 VAT', value: Math.abs(net).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
  ]
})

// ===== TAB 2: CIT =====
const citInput = reactive({ revenue: 2000000, cost: 800000, expenses: 500000, whtPaid: 0, halfYearPaid: 0 })

function calcCitTax(profit) {
  if (profit <= 300000) return { rate: 0, tax: 0 }
  if (profit <= 3000000) return { rate: 15, tax: (profit - 300000) * 0.15 }
  return { rate: 20, tax: (profit - 3000000) * 0.20 + (3000000 - 300000) * 0.15 }
}

const citResult = computed(() => {
  const profit = Math.max(0, citInput.revenue - citInput.cost - citInput.expenses)
  const { rate, tax } = calcCitTax(profit)
  const net = tax - citInput.whtPaid - citInput.halfYearPaid
  return [
    { label: '净利润', value: profit.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '适用税率', value: rate + '%' },
    { label: '应纳税额', value: tax.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: net >= 0 ? '应补税额' : '应退税额', value: Math.abs(net).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
  ]
})

// ===== TAB 3: PND.1 =====
const pnd1Input = reactive({ salary: 35000, marital: 'single', spouseIncome: 'no', children: 0, elders: 0, ssMonthly: 750, insurance: 0, mortgage: 0 })

// 7-level progressive rate
const pitBrackets = [
  { upTo: 150000, rate: 0 },
  { upTo: 300000, rate: 5 },
  { upTo: 500000, rate: 10 },
  { upTo: 750000, rate: 15 },
  { upTo: 1000000, rate: 20 },
  { upTo: 2000000, rate: 25 },
  { upTo: 5000000, rate: 30 },
  { upTo: Infinity, rate: 35 },
]

function calcPitAnnualTax(taxableIncome) {
  if (taxableIncome <= 0) return 0
  let tax = 0, prev = 0
  for (const b of pitBrackets) {
    const slice = Math.min(taxableIncome, b.upTo) - prev
    if (slice > 0) tax += slice * b.rate / 100
    prev = b.upTo
    if (taxableIncome <= b.upTo) break
  }
  return tax
}

const pnd1Result = computed(() => {
  const annual = pnd1Input.salary * 12
  const expenseDeduction = Math.min(annual * 0.5, 100000)
  const personalAllowance = 60000
  const spouseAllowance = (pnd1Input.marital === 'married' && pnd1Input.spouseIncome === 'no') ? 60000 : 0
  const childAllowance = pnd1Input.children * 30000
  const elderAllowance = pnd1Input.elders * 30000
  const ssDeduction = pnd1Input.ssMonthly * 12
  const insuranceDeduction = Math.min(pnd1Input.insurance, 100000)
  const mortgageDeduction = Math.min(pnd1Input.mortgage, 100000)
  const totalDeductions = expenseDeduction + personalAllowance + spouseAllowance + childAllowance + elderAllowance + ssDeduction + insuranceDeduction + mortgageDeduction
  const taxable = Math.max(0, annual - totalDeductions)
  const annualTax = calcPitAnnualTax(taxable)
  return [
    { label: '年收入', value: annual.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '费用扣除 (50%, ≤10万)', value: expenseDeduction.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '个人免税额', value: personalAllowance.toLocaleString() + ' THB' },
    { label: '配偶免税额', value: spouseAllowance.toLocaleString() + ' THB' },
    { label: '子女免税额 (' + pnd1Input.children + '人)', value: childAllowance.toLocaleString() + ' THB' },
    { label: '老人免税额 (' + pnd1Input.elders + '人)', value: elderAllowance.toLocaleString() + ' THB' },
    { label: '社保扣除', value: ssDeduction.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '保险扣除', value: insuranceDeduction.toLocaleString() + ' THB' },
    { label: '房贷利息扣除', value: mortgageDeduction.toLocaleString() + ' THB' },
    { label: '减免合计', value: totalDeductions.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '应税收入', value: taxable.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '全年应缴税额', value: annualTax.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '每月预扣', value: (annualTax / 12).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
  ]
})

// ===== TAB 4: WHT =====
const whtTypes = [
  { key: 'rental', label: '租金 (5%)', rate: 5 },
  { key: 'service', label: '服务费 (3%)', rate: 3 },
  { key: 'interest', label: '利息 (10%)', rate: 10 },
  { key: 'dividend', label: '股息 (10%)', rate: 10 },
  { key: 'royalty', label: '特许权 (15%)', rate: 15 },
]
const whtInput = reactive({ amount: 100000, type: 'service' })

const whtResult = computed(() => {
  const def = whtTypes.find(t => t.key === whtInput.type) || whtTypes[0]
  const tax = whtInput.amount * def.rate / 100
  return [
    { label: '支付金额', value: whtInput.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '预扣税率', value: def.rate + '%' },
    { label: '预扣税额', value: tax.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '净付金额', value: (whtInput.amount - tax).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
  ]
})

// ===== TAB 5: Social Security =====
const socialInput = reactive({ salary: 35000 })

const socialResult = computed(() => {
  const base = Math.min(socialInput.salary, 15000)
  const employer = base * 0.05
  const employee = base * 0.05
  return [
    { label: '计算基数 (≤15,000)', value: base.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '雇主缴纳 (5%)', value: employer.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '员工缴纳 (5%)', value: employee.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
    { label: '合计', value: (employer + employee).toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' THB' },
  ]
})
</script>

<style scoped>
.page { padding: 8px; }
</style>
