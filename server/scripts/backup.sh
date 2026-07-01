#!/bin/bash
# 泰国电商税务系统 - PostgreSQL 自动备份脚本

BACKUP_DIR="$HOME/thai-tax-backups"
DB_NAME="thai_tax_db"
DB_USER="postgres"
DB_HOST="localhost"
DB_PORT="5432"
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/thai_tax_db_$(date +%Y%m%d_%H%M%S).sql"

pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -F c -f "$BACKUP_FILE" 2>> "$BACKUP_DIR/backup_error.log"

if [ $? -eq 0 ]; then
  gzip "$BACKUP_FILE"
  find "$BACKUP_DIR" -name "thai_tax_db_*.sql.gz" -mtime +$RETENTION_DAYS -delete
  echo "$(date) - Backup OK: ${BACKUP_FILE}.gz" >> "$BACKUP_DIR/backup.log"
  echo "OK"
else
  echo "FAIL"
fi
