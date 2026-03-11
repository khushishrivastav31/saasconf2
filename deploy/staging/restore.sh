#!/bin/bash
set -euo pipefail

# =============================================================================
# SaaSConf – Database + Uploads Restore
# =============================================================================
#
# Usage:
#   ./restore.sh <backup-file>         – restore DB from a .sql.gz (or .sql.gz.enc)
#   ./restore.sh --list                – list available backups
#
# Optional env vars:
#   BACKUP_ENCRYPTION_PASSPHRASE   – required if backup file is .enc encrypted
#   RESTORE_TARGET_DB              – override DB name (default: from .env)
#   RESTORE_UPLOADS_FILE           – also restore uploads from this .tar.gz[.enc]
#
# Examples:
#   ./restore.sh /opt/saasconf/backups/db_20260301_030000.sql.gz
#   BACKUP_ENCRYPTION_PASSPHRASE=secret ./restore.sh /opt/saasconf/backups/db_20260301_030000.sql.gz.enc
#   ./restore.sh /opt/saasconf/backups/db_20260301_030000.sql.gz.enc \
#       RESTORE_UPLOADS_FILE=/opt/saasconf/backups/uploads_20260301_030000.tar.gz
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/opt/saasconf/backups"

# ── Load environment ──────────────────────────────────────────────────────────
set -a
# shellcheck source=.env
source "$SCRIPT_DIR/.env"
set +a

DB_USER="${DB_USER:-saasconf}"
DB_NAME="${RESTORE_TARGET_DB:-${DB_NAME:-saasconf}}"
BACKUP_ENCRYPTION_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
RESTORE_UPLOADS_FILE="${RESTORE_UPLOADS_FILE:-}"
BACKUP_UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-}"

# ── List mode ─────────────────────────────────────────────────────────────────
if [ "${1:-}" = "--list" ]; then
    echo "=== Available Backups in $BACKUP_DIR ==="
    echo ""
    echo "--- Database backups ---"
    ls -lht "$BACKUP_DIR"/db_*.sql.gz* 2>/dev/null || echo "  (none)"
    echo ""
    echo "--- Uploads backups ---"
    ls -lht "$BACKUP_DIR"/uploads_*.tar.gz* 2>/dev/null || echo "  (none)"
    exit 0
fi

# ── Require a backup file argument ───────────────────────────────────────────
if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup-file.sql.gz[.enc]>"
    echo "       $0 --list"
    exit 1
fi

DB_BACKUP_FILE="$1"

if [ ! -f "$DB_BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $DB_BACKUP_FILE" >&2
    exit 1
fi

echo "=== SaaSConf Restore – $(date -u '+%Y-%m-%d %H:%M:%S UTC') ==="
echo "Restoring DB from: $DB_BACKUP_FILE"
echo "Target DB:         $DB_NAME"
echo "Target DB user:    $DB_USER"
[ -n "$RESTORE_UPLOADS_FILE" ] && echo "Restoring uploads: $RESTORE_UPLOADS_FILE"
echo ""

# Confirmation prompt (skip if non-interactive)
if [ -t 0 ]; then
    read -r -p "⚠️  This will DROP and recreate the '$DB_NAME' database. Continue? [y/N] " confirm
    if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
        echo "Aborted."
        exit 0
    fi
fi

# ── Decrypt if needed ─────────────────────────────────────────────────────────
decrypt_file() {
    local src="$1"
    local dst="${src%.enc}"
    if [ -z "$BACKUP_ENCRYPTION_PASSPHRASE" ]; then
        echo "ERROR: Backup file is encrypted (.enc) but BACKUP_ENCRYPTION_PASSPHRASE is not set." >&2
        exit 1
    fi
    echo "Decrypting $src …"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
        -pass "pass:${BACKUP_ENCRYPTION_PASSPHRASE}" \
        -in "$src" -out "$dst"
    echo "$dst"
}

WORK_DB_FILE="$DB_BACKUP_FILE"
WORK_UPLOADS_FILE="$RESTORE_UPLOADS_FILE"
CLEANUP_FILES=()

if [[ "$DB_BACKUP_FILE" == *.enc ]]; then
    WORK_DB_FILE=$(decrypt_file "$DB_BACKUP_FILE")
    CLEANUP_FILES+=("$WORK_DB_FILE")
fi

if [ -n "$WORK_UPLOADS_FILE" ] && [[ "$WORK_UPLOADS_FILE" == *.enc ]]; then
    WORK_UPLOADS_FILE=$(decrypt_file "$RESTORE_UPLOADS_FILE")
    CLEANUP_FILES+=("$WORK_UPLOADS_FILE")
fi

# ── Validate DB dump ──────────────────────────────────────────────────────────
echo "Validating backup integrity …"
if ! gzip -t "$WORK_DB_FILE" 2>/dev/null; then
    echo "ERROR: Backup file failed integrity check (corrupt gzip)." >&2
    exit 1
fi
echo "Integrity check: OK"

# ── Stop application containers (keep db running) ────────────────────────────
echo ""
echo "--- Stopping application containers ---"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" stop backend frontend nginx \
    cleanup-cron deadline-cron payment-reminder-cron 2>/dev/null || true
echo "Application containers stopped."

# ── Restore database ──────────────────────────────────────────────────────────
echo ""
echo "--- Restoring database ---"

# Drop and recreate database
docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T db \
    psql -U "$DB_USER" -d postgres -c "
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
        DROP DATABASE IF EXISTS \"${DB_NAME}\";
        CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";
    "

echo "Database dropped and recreated."

# Restore from dump
zcat "$WORK_DB_FILE" | docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T db \
    psql -U "$DB_USER" -d "$DB_NAME"

echo "Database restore complete."

# ── Restore uploads (optional) ────────────────────────────────────────────────
if [ -n "$WORK_UPLOADS_FILE" ] && [ -f "$WORK_UPLOADS_FILE" ]; then
    echo ""
    echo "--- Restoring uploads ---"
    if [ -n "$BACKUP_UPLOADS_DIR" ]; then
        UPLOADS_PARENT="$(dirname "$BACKUP_UPLOADS_DIR")"
        # Clear existing uploads and extract
        rm -rf "${BACKUP_UPLOADS_DIR:?}"/*
        tar -xzf "$WORK_UPLOADS_FILE" -C "$UPLOADS_PARENT"
        echo "Uploads restored to $BACKUP_UPLOADS_DIR"
    else
        echo "WARNING: RESTORE_UPLOADS_FILE set but BACKUP_UPLOADS_DIR not configured. Skipping uploads restore." >&2
    fi
fi

# ── Clean up decrypted temp files ─────────────────────────────────────────────
for f in "${CLEANUP_FILES[@]}"; do
    rm -f "$f"
    echo "Removed temp file: $f"
done

# ── Restart application ───────────────────────────────────────────────────────
echo ""
echo "--- Restarting application ---"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d backend frontend nginx \
    cleanup-cron deadline-cron payment-reminder-cron
echo "Application restarted."

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "=== Restore Complete ==="
echo "Database:  $DB_NAME (restored from $(basename "$DB_BACKUP_FILE"))"
[ -n "$RESTORE_UPLOADS_FILE" ] && echo "Uploads:   restored from $(basename "$RESTORE_UPLOADS_FILE")"
echo ""
echo "Container status:"
docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps
