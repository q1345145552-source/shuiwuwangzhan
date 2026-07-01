import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import api from '../api'

export const useCompanyStore = defineStore('company', () => {
  const companies = ref([])
  const currentCompanyId = ref(parseInt(localStorage.getItem('currentCompanyId')) || null)

  const currentCompany = computed(() =>
    companies.value.find(c => c.id === currentCompanyId.value) || null
  )

  async function loadCompanies() {
    try {
      const data = await api.get('/companies')
      companies.value = Array.isArray(data) ? data : []
      if (!currentCompanyId.value && companies.value.length > 0) {
        currentCompanyId.value = companies.value[0].id
        localStorage.setItem('currentCompanyId', currentCompanyId.value)
      }
    } catch (e) { /* noop */ }
  }

  function switchCompany(id) {
    currentCompanyId.value = id
    localStorage.setItem('currentCompanyId', id)
  }

  const periods = ref([])

  async function loadPeriods(companyId) {
    if (!companyId) { periods.value = []; return }
    try {
      periods.value = await api.get('/periods', { params: { company_id: companyId } })
    } catch (e) { console.error('loadPeriods failed:', e); periods.value = [] }
  }

  return { companies, periods, currentCompanyId, currentCompany, loadCompanies, loadPeriods, switchCompany }
})
