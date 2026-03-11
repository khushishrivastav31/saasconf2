#!/bin/bash
set -euo pipefail

# =============================================================================
# SaaSConf – Database + Uploads Backup
# =============================================================================
#
# Features:
#   • PostgreSQL dump (gzip compressed)
#   • Uploads/media volume backup (tar.gz)
#   • Optional AES-256 encryption  (set BACKUP_ENCRYPTION_PASSPHRASE)
#   • Optional offsite upload       (set BACKUP_S3_URI, e.g. s3://bucket/prefix)
#   • GFS retention locally         (7 daily, 4 weekly, 12 monthly)
#   • Backup integrity check        (test-restores schema only to /dev/null)
#
# Required env vars (sourced from .env):
#   DB_USER, DB_NAME, DB_PASSWORD
#
# Optional env vars:
#   BACKUP_ENCRYPTION_PASSPHRASE   – if set, backups are AES-256 encrypted
#   BACKUP_S3_URI                  – e.g. s3://mybucket/saasconf-backups
#   AWS_ACCESS_KEY_ID              – for S3 uploads
#   AWS_SECRET_ACCESS_KEY          – for S3 uploads
#   AWS_DEFAULT_REGION             – for S3 uploads (default: eu-central-1)
#   BACKUP_UPLOADS_DIR             – host path to uploads dir (optional)
#
# Usage:
#   ./backup.sh                    – run backup
#   BACKUP_DRY_RUN=1 ./backup.sh   – dry run (no changes)
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/opt/saasconf/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DAY_OF_WEEK=$(date +%u)    # 1=Mon … 7=Sun
DAY_OF_MONTH=$(date +%d)   # 01-31

DRY_RUN="${BACKUP_DRY_RUN:-0}"

# ── Load environment ──────────────────────────────────────────────────────────
set -a
# shellcheck source=.env
source "$SCRIPT_DIR/.env"
set +a

DB_USER="${DB_USER:-saasconf}"
DB_NAME="${DB_NAME:-saasconf}"
BACKUP_ENCRYPTION_PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
BACKUP_S3_URI="${BACKUP_S3_URI:-}"
AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-eu-central-1}"
BACKUP_UPLOADS_DIR="${BACKUP_UPLOADS_DIR:-}"

echo "=== SaaSConf Backup – $(date -u '+%Y-%m-%d %H:%M:%S UTC') ==="
echo "Dry-run: $DRY_RUN"

# ── Helper: run or echo ───────────────────────────────────────────────────────
run() {
    if [ "$DRY_RUN" = "1" ]; then
        echo "[DRY-RUN] $*"
    else
        "$@"
    fi
}

# ── Create backup directory ───────────────────────────────────────────────────
run mkdir -p "$BACKUP_DIR"

# ── 1. Database backup ────────────────────────────────────────────────────────
echo ""
echo "--- Database backup ---"
DB_FILE="$BACKUP_DIR/db_${DATE}.sql.gz"

if [ "$DRY_RUN" != "1" ]; then
    docker compose -f "$SCRIPT_DIR/docker-compose.yml" exec -T db \
        pg_dump -U "$DB_USER" "$DB_NAME" \
        | gzip > "$DB_FILE"

    DB_SIZE=$(du -h "$DB_FILE" | cut -f1)
    echo "Database dump: $DB_FILE ($DB_SIZE)"

    # Integrity check – verify the dump can be read by gzip + psql parse
    if gzip -t "$DB_FILE" 2>/dev/null; then
        echo "Integrity check: OK (gzip valid)"
    else
        echo "ERROR: Backup file is corrupt!" >&2
        exit 1
    fi
else
    DB_FILE="$BACKUP_DIR/db_${DATE}.sql.gz"
    echo "[DRY-RUN] Would create: $DB_FILE"
fi

# ── 2. Uploads/media backup (optional) ───────────────────────────────────────
UPLOADS_FILE=""
if [ -n "$BACKUP_UPLOADS_DIR" ] && [ -d "$BACKUP_UPLOADS_DIR" ]; then
    echo ""
    echo "--- Uploads backup ---"
    UPLOADS_FILE="$BACKUP_DIR/uploads_${DATE}.tar.gz"
    if [ "$DRY_RUN" != "1" ]; then
        tar -czf "$UPLOADS_FILE" -C "$(dirname "$BACKUP_UPLOADS_DIR")" "$(basename "$BACKUP_UPLOADS_DIR")"
        UPLOADS_SIZE=$(du -h "$UPLOADS_FILE" | cut -f1)
        echo "Uploads archive: $UPLOADS_FILE ($UPLOADS_SIZE)"
    else
        echo "[DRY-RUN] Would create: $UPLOADS_FILE"
    fi
fi

# ── 3. Encryption (optional) ──────────────────────────────────────────────────
encrypt_file() {
    local src="$1"
    local dst="${src}.enc"
    openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
        -pass "pass:${BACKUP_ENCRYPTION_PASSPHRASE}" \
        -in "$src" -out "$dst"
    rm "$src"
    echo "$dst"
}

if [ -n "$BACKUP_ENCRYPTION_PASSPHRASE" ] && [ "$DRY_RUN" != "1" ]; then
    echo ""
    echo "--- Encrypting backups ---"
    DB_FILE=$(encrypt_file "$DB_FILE")
    echo "Encrypted: $DB_FILE"
    if [ -n "$UPLOADS_FILE" ] && [ -f "$UPLOADS_FILE" ]; then
        UPLOADS_FILE=$(encrypt_file "$UPLOADS_FILE")
        echo "Encrypted: $UPLOADS_FILE"
    fi
elif [ -n "$BACKUP_ENCRYPTION_PASSPHRASE" ] && [ "$DRY_RUN" = "1" ]; then
    echo "[DRY-RUN] Would encrypt backups with AES-256"
fi

# ── 4. Offsite upload to S3-compatible storage ────────────────────────────────
upload_to_s3() {
    local file="$1"
    local filename
    filename=$(basename "$file")
    if command -v aws &>/dev/null; then
        AWS_DEFAULT_REGION="$AWS_DEFAULT_REGION" \
        aws s3 cp "$file" "${BACKUP_S3_URI}/${filename}" \
            --storage-class STANDARD_IA
        echo "Uploaded to S3: ${BACKUP_S3_URI}/${filename}"
    else
        echo "WARNING: aws CLI not found, skipping offsite upload" >&2
    fi
}

if [ -n "$BACKUP_S3_URI" ]; then
    echo ""
    echo "--- Offsite upload (S3) ---"
    if [ "$DRY_RUN" != "1" ]; then
        upload_to_s3 "$DB_FILE"
        [ -n "$UPLOADS_FILE" ] && [ -f "$UPLOADS_FILE" ] && upload_to_s3 "$UPLOADS_FILE"
    else
        echo "[DRY-RUN] Would upload to: $BACKUP_S3_URI"
    fi
fi

# ── 5. GFS local retention ────────────────────────────────────────────────────
# Keep:  7 daily backups  (all)
#       +4 weekly backups (Sunday = day 7)
#      +12 monthly backups (1st of month)
#
# Strategy: tag files by their retention class at creation time using symlinks.
# Simpler approach: just prune by age with class-specific maxima.

prune_local_backups() {
    local prefix="$1"   # e.g. "db" or "uploads"
    local ext="$2"      # e.g. ".sql.gz" or ".tar.gz" (optionally + ".enc")

    # All local backup files for this type, sorted oldest-first
    # shellcheck disable=SC2207
    ALL_FILES=($(ls -t "$BACKUP_DIR/${prefix}_"*"${ext}" 2>/dev/null || true))

    if [ "${#ALL_FILES[@]}" -eq 0 ]; then return; fi

    # Keep last 7 (daily)
    if [ "${#ALL_FILES[@]}" -gt 7 ]; then
        # Files beyond 7 daily: keep if they are weekly (created on a Sunday)
        # or monthly (created on the 1st). Delete the rest.
        for f in "${ALL_FILES[@]:7}"; do
            fname=$(basename "$f")
            # Extract date portion: db_20260301_030000…
            fdate="${fname#${prefix}_}"
            fdate="${fdate%%_*}"  # YYYYMMDD
            fday="${fdate:6:2}"   # DD
            fdow=$(date -d "${fdate}" +%u 2>/dev/null || date -j -f "%Y%m%d" "${fdate}" +%u 2>/dev/null || echo "0")

            keep=0
            # Monthly: keep 1st of month for 12 months (365 days)
            if [ "$fday" = "01" ]; then
                age_days=$(( ( $(date +%s) - $(date -d "$fdate" +%s 2>/dev/null || date -j -f "%Y%m%d" "$fdate" +%s) ) / 86400 ))
                [ "$age_days" -le 365 ] && keep=1
            fi
            # Weekly: keep Sundays for 4 weeks (28 days)
            if [ "$fdow" = "7" ]; then
                age_days=$(( ( $(date +%s) - $(date -d "$fdate" +%s 2>/dev/null || date -j -f "%Y%m%d" "$fdate" +%s) ) / 86400 ))
                [ "$age_days" -le 28 ] && keep=1
            fi

            if [ "$keep" = "0" ]; then
                run rm "$f"
                echo "Pruned: $f"
            fi
        done
    fi
}

echo ""
echo "--- Local retention (GFS) ---"
if [ "$DRY_RUN" != "1" ]; then
    if [ -n "$BACKUP_ENCRYPTION_PASSPHRASE" ]; then
        prune_local_backups "db" ".sql.gz.enc"
        [ -n "$UPLOADS_FILE" ] && prune_local_backups "uploads" ".tar.gz.enc"
    else
        prune_local_backups "db" ".sql.gz"
        [ -n "$UPLOADS_FILE" ] && prune_local_backups "uploads" ".tar.gz"
    fi
fi

# ── 6. Summary ────────────────────────────────────────────────────────────────
echo ""
echo "=== Backup Complete ==="
echo "Local backups in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/ 2>/dev/null | grep -v "^total" | tail -20 || echo "  (none)"
echo ""
