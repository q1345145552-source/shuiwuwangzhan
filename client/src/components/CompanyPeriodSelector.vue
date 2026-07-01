<template>
  <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
    <el-select
      :model-value="companyId"
      @update:model-value="$emit('update:companyId', $event); $emit('companyChange', $event)"
      placeholder="选择客户公司"
      style="width:220px"
    >
      <el-option v-for="c in store.companies" :key="c.id" :label="c.name" :value="c.id" />
    </el-select>
    <el-select
      :model-value="periodId"
      @update:model-value="$emit('update:periodId', $event); $emit('periodChange', $event)"
      placeholder="选择会计期间"
      :disabled="!companyId"
      style="width:220px"
    >
      <el-option v-for="p in periods" :key="p.id" :label="p.year + '年' + p.month + '月'" :value="p.id" />
    </el-select>
    <span v-if="lockedLabel" style="color:#e6a23c;font-weight:bold;font-size:13px">🔒 已锁定</span>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue'
import { useCompanyStore } from '../stores/currentCompany'
import api from '../api'

const props = defineProps({
  companyId: { type: [Number, String], default: null },
  periodId: { type: [Number, String], default: null },
  showLockBadge: { type: Boolean, default: false },
})

defineEmits(['update:companyId', 'update:periodId', 'companyChange', 'periodChange'])

const store = useCompanyStore()
const periods = ref([])

const lockedLabel = computed(() => {
  if (!props.showLockBadge || !props.periodId) return ''
  const p = periods.value.find(p => p.id === props.periodId)
  return p?.status === 'locked' ? '🔒 已锁定' : ''
})

async function loadPeriods() {
  if (!props.companyId) { periods.value = []; return }
  try {
    periods.value = await api.get('/periods', { params: { company_id: props.companyId } })
  } catch (e) { console.error('加载期间失败:', e); periods.value = [] }
}

watch(() => props.companyId, () => loadPeriods(), { immediate: true })
onMounted(() => { if (store.companies.length === 0) store.loadCompanies() })
</script>
