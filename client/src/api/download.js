import { ElMessage } from 'element-plus'

/**
 * 统一下载函数：自动附加 token，处理 blob 下载
 * @param {string} url  - API 路径（如 '/export/profit-loss/xlsx'）
 * @param {string} filename - 下载文件名
 * @param {object} params - URL 查询参数
 */
export async function downloadFile(url, filename, params = {}) {
  try {
    const token = localStorage.getItem('token')
    const qs = new URLSearchParams(params).toString()
    const fullUrl = qs ? `${url}?${qs}` : url

    const res = await fetch(fullUrl, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const blob = await res.blob()
    const u = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = u
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(u)
  } catch (e) {
    console.error('下载失败:', e)
    ElMessage.error('下载失败')
  }
}

/**
 * 通过 API 返回的 { url } 打开 PDF
 * @param {string} url - API 路径
 * @param {object} params - 查询参数
 */
export async function openPdf(url, params = {}) {
  try {
    const { default: api } = await import('./index.js')
    const res = await api.get(url, { params })
    if (res.url) window.open(res.url, '_blank')
  } catch (e) {
    console.error('PDF打开失败:', e)
    ElMessage.error('打开失败')
  }
}
