const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const BACKUP_DIR = path.join(os.homedir(), 'thai-tax-backups');

// GET /api/backup/list
router.get('/list', (req, res, next) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ files: [], total_size: 0, last_backup: null });
    }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sql.gz'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          name: f,
          size: stat.size,
          size_display: formatSize(stat.size),
          created_at: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));

    const totalSize = files.reduce((s, f) => s + f.size, 0);
    res.json({
      files,
      total_size: totalSize,
      total_size_display: formatSize(totalSize),
      last_backup: files.length > 0 ? files[0].created_at : null,
      backup_dir: BACKUP_DIR
    });
  } catch (e) { next(e); }
});

// POST /api/backup/now
router.post('/now', (req, res, next) => {
  try {
    const scriptPath = path.join(__dirname, '..', '..', 'scripts', 'backup.sh');
    if (!fs.existsSync(scriptPath)) {
      return res.status(500).json({ error: '备份脚本不存在: ' + scriptPath });
    }
    const result = execSync(`bash "${scriptPath}"`, { encoding: 'utf8', timeout: 60000 });
    if (result.includes('OK')) {
      res.json({ success: true, message: '备份完成' });
    } else {
      res.status(500).json({ error: '备份失败，请查看日志' });
    }
  } catch (e) {
    res.status(500).json({ error: '备份失败: ' + e.message });
  }
});

// GET /api/backup/download/:filename
router.get('/download/:filename', (req, res, next) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const backupDir = path.resolve(BACKUP_DIR);
    const filepath = path.resolve(path.join(backupDir, safeFilename));

    // 防止路径穿越：确保文件在 backupDir 内
    if (!filepath.startsWith(backupDir + path.sep)) {
      console.warn('路径穿越尝试:', req.params.filename);
      return res.status(403).json({ error: '拒绝访问' });
    }

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    res.download(filepath);
  } catch (e) { next(e); }
});

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}


// DELETE /api/backup/:filename
router.delete('/:filename', (req, res, next) => {
  try {
    const safeFilename = path.basename(req.params.filename);
    const backupDir = path.resolve(BACKUP_DIR);
    const filepath = path.resolve(path.join(backupDir, safeFilename));

    if (!filepath.startsWith(backupDir + path.sep)) {
      return res.status(403).json({ error: '拒绝访问' });
    }
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: '文件不存在' });
    }
    fs.unlinkSync(filepath);
    res.json({ success: true });
  } catch (e) { 
    console.error('删除备份失败:', e.message);
    return res.status(500).json({ error: '删除失败' });
  }
});

module.exports = router;
