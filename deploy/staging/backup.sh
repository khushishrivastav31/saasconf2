#!/bin/bash
set -e

# ===========================================
# SaaSConf Staging - Database Backup Script
# ===========================================
# Usage: ./backup.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/opt/saasconf/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Load environment
set -a
source "$SCRIPT_DIR/.env"
set +a

echo "=== SaaSConf Database Backup ==="

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Backup database
echo "Creating database backup..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T db \
    pg_dump -U "${DB_USER:-saasconf}" "${DB_NAME:-saasconf}" \
    | gzip > "$BACKUP_DIR/db_backup_$DATE.sql.gz"

# Keep only last 7 backups
echo "Cleaning old backups..."
ls -t "$BACKUP_DIR"/db_backup_*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm

# Show backup info
BACKUP_FILE="$BACKUP_DIR/db_backup_$DATE.sql.gz"
BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo ""
echo "=== Backup Complete ==="
echo "File: $BACKUP_FILE"
echo "Size: $BACKUP_SIZE"
echo ""
echo "Existing backups:"
ls -lh "$BACKUP_DIR"/db_backup_*.sql.gz 2>/dev/null || echo "  (none)"
