<template>
  <div class="login-bg">
    <div class="login-card">
      <div class="login-logo">
        <h1>电商税务管理系统</h1>
        <p>面向泰国跨境电商的一站式税务合规平台</p>
      </div>

      <el-form :model="form" :rules="rules" ref="formRef" @submit.prevent="handleLogin" size="large">
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            :prefix-icon="User"
            clearable
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="Lock"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item style="margin-top:8px">
          <el-button type="primary" :loading="loading" @click="handleLogin" style="width:100%;height:44px;font-size:16px">
            {{ loading ? '登录中...' : '登录' }}
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <span>VAT / WHT / CIT / PND.1 / 社保 全覆盖</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import api from '../api'

const router = useRouter()
const formRef = ref(null)
const loading = ref(false)

onMounted(() => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
})

const form = reactive({ username: '', password: '' })
const rules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

async function handleLogin() {
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    const data = await api.post('/auth/login', {
      username: form.username,
      password: form.password
    })
    localStorage.setItem('token', data.token)
    localStorage.setItem('user', JSON.stringify(data.user))
    ElMessage.success('登录成功')
    router.push('/')
  } catch (e) {
    const code = e.response?.status
    if (code === 401) {
      ElMessage.error('用户名或密码错误')
    } else if (!e.response) {
      ElMessage.error('网络连接失败，请检查网络')
    } else {
      ElMessage.error(e.response?.data?.error || '登录失败')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-bg {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}
.login-card {
  width: 420px;
  padding: 48px 40px 36px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.25);
}
.login-logo {
  text-align: center;
  margin-bottom: 36px;
}
.login-logo h1 {
  margin: 4px 0;
  font-size: 22px;
  color: #303133;
  font-weight: 700;
}
.login-logo p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}
.login-footer {
  text-align: center;
  margin-top: 24px;
  font-size: 12px;
  color: #c0c4cc;
}
</style>
