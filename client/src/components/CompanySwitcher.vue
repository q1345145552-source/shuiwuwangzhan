<template>
  <div class="company-switcher">
    <el-select
      v-model="selectedId"
      placeholder="选择公司"
      filterable
      size="small"
      popper-class="company-popper"
      @change="onSwitch"
    >
      <el-option
        v-for="c in store.companies"
        :key="c.id"
        :label="(c.code ? c.code + ' - ' : '') + c.name"
        :value="c.id"
      />
    </el-select>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useCompanyStore } from '../stores/currentCompany'

const store = useCompanyStore()

const selectedId = computed({
  get: () => store.currentCompanyId,
  set: (val) => store.switchCompany(val)
})

function onSwitch() {
  // 切换后刷新当前页面
  window.location.reload()
}
</script>

<style scoped>
.company-switcher { padding: 12px 16px; border-bottom: 1px solid #4a5064; }
:deep(.el-select) { width: 100%; }
</style>
