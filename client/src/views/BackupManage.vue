<template>
  <div class="page">
    <el-row :gutter="16" style="margin-bottom:20px">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ backupData.files?.length || 0 }}</div>
          <div class="stat-label">备份总数</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ backupData.total_size_display || '0 B' }}</div>
          <div class="stat-label">总大小</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num small">{{ lastBackup }}</div>
          <div class="stat-label">上次备份</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <el-button type="primary" size="large" :loading="backingUp" @click="doBackup" style="width:100%">
            立即备份
          </el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-card>
      <template #header><span>📁 备份文件列表</span></template>
      <el-alert type="info" :closable="false" show-icon style="margin-bottom:12px">
        备份目录：{{ backupDir }}<br/>
        每天凌晨2点自动备份，保留30天
      </el-alert>
      <el-table :data="backupData.files || []" empty-text="暂无备份文件">
        <el-table-column prop="name" label="文件名" min-width="280" />
        <el-table-column prop="size_display" label="大小" width="120" />
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="doDownloadBackup(row.name)">下载</el-button>
            <el-button size="small" type="danger" @click="deleteFile(row.name)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import api from '../api'
import { downloadFile, openPdf } from '../api/download'
import { ElMessage, ElMessageBox } from 'element-plus'

const backupData = reactive({ files: [], total_size: 0, total_size_display: '0', last_backup: null })
const backupDir = ref('')
const backingUp = ref(false)

const lastBackup = ref('暂无')

function formatTime(t) {
  if (!t) return '-'
  return new Date(t).toLocaleString('zh-CN')
}

async function loadBackups() {
  try {
    const data = await api.get('/backup/list')
    Object.assign(backupData, data)
    backupDir.value = data.backup_dir || ''
    if (data.last_backup) {
      lastBackup.value = new Date(data.last_backup).toLocaleString('zh-CN')
    }
  } catch (e) { /* noop */ }
}

async function doBackup() {
  backingUp.value = true
  try {
    await api.post('/backup/now')
    ElMessage.success('备份完成')
    await loadBackups()
  } catch (e) {
    ElMessage.error('备份失败: ' + (e.response?.data?.error || e.message))
  } finally { backingUp.value = false }
}

function doDownloadBackup(filename) {
  const token = localStorage.getItem('token')
  const url = `/api/backup/download/${filename}`
  const a = document.createElement('a')
  a.href = url
  // Use fetch to add auth header
  downloadFile(url, filename)
    .catch(() => ElMessage.error('下载失败'))
}

async function deleteFile(filename) {
  try {
    await ElMessageBox.confirm(`确定删除备份文件 "${filename}"？`, '确认', { type: 'warning' })
    await api.delete('/backup/' + encodeURIComponent(filename))
    ElMessage.success('已删除')
    loadBackups()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error(e?.response?.data?.error || '删除失败')
    }
  }
}

onMounted(() => { loadBackups() })
</script>

<style scoped>
.page { padding: 8px; }
.stat-card { text-align: center; }
.stat-num { font-size: 28px; font-weight: bold; color: #409eff; }
.stat-num.small { font-size: 14px; }
.stat-label { color: #909399; margin-top: 4px; font-size: 13px; }
</style>
