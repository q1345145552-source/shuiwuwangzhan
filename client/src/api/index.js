import axios from 'axios'
import { ElMessage } from 'element-plus'

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

// Request interceptor — attach token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — handle 401 + global errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (!error.response) {
      ElMessage.error('网络连接失败，请检查网络')
      return Promise.reject(error)
    }

    const { status, data } = error.response

    if (status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      ElMessage.error('登录已过期，请重新登录')
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    } else if (status === 403) {
      ElMessage.error(data?.error || '没有权限执行此操作')
    } else if (status === 404) {
      ElMessage.error(data?.error || '请求的资源不存在')
    } else if (status >= 500) {
      ElMessage.error('服务器内部错误，请稍后重试')
    } else if (status === 400) {
      // 400 is typically handled inline by the page's own catch block
      // Don't show duplicate messages
    }

    return Promise.reject(error)
  }
)

export default api
