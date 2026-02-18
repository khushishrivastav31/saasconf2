#!/bin/bash
set -euo pipefail

# ===========================================
# SaaSConf Staging — PostgreSQL 15 → 16 Upgrade
# ===========================================
# One-time script: dumps PG15, swaps to PG16 image, restores data.
# The docker-compose.yml must already reference postgres:16.6-alpine.
#
# Uses `docker exec` (not `docker compose exec`) to interact with the
# running PG15 container, since the compose file already references PG16.
#
# Usage: bash upgrade-pg16.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="/opt/saasconf/backups"
DATE=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="$BACKUP_DIR/pg15_to_pg16_$DATE.sql.gz"
DB_CONTAINER="saasconf_db_staging"

# Load environment (.env must contain DB_USER, DB_PASSWORD, DB_NAME)
set -a
source "$SCRIPT_DIR/.env"
set +a

DB_USER="${DB_USER:-saasconf}"
DB_NAME="${DB_NAME:-saasconf}"

echo "=== PG15 → PG16 Upgrade ==="
echo ""

# -----------------------------------------------
# 1. Dump the PG15 database (via docker exec, not compose)
# -----------------------------------------------
echo "Step 1/6: Dumping PG15 database..."
mkdir -p "$BACKUP_DIR"
docker exec "$DB_CONTAINER" \
    pg_dump -U "$DB_USER" "$DB_NAME" \
    | gzip > "$DUMP_FILE"

DUMP_SIZE=$(du -h "$DUMP_FILE" | cut -f1)
echo "  Backup saved: $DUMP_FILE ($DUMP_SIZE)"

# -----------------------------------------------
# 2. Stop all services
# -----------------------------------------------
echo ""
echo "Step 2/6: Stopping all services..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" down

# -----------------------------------------------
# 3. Remove old PG15 data volume
# -----------------------------------------------
echo ""
echo "Step 3/6: Removing old postgres_data volume..."
# List actual volume name and remove it
PG_VOLUME=$(docker volume ls --format '{{.Name}}' | grep postgres_data || true)
if [ -n "$PG_VOLUME" ]; then
    docker volume rm "$PG_VOLUME"
    echo "  Removed volume: $PG_VOLUME"
else
    echo "  Warning: no postgres_data volume found — may have been removed already"
fi

# -----------------------------------------------
# 4. Start PG16 (creates fresh volume)
# -----------------------------------------------
echo ""
echo "Step 4/6: Starting PG16 container..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d db

echo "  Waiting for PG16 to be ready..."
for i in $(seq 1 30); do
    if docker exec "$DB_CONTAINER" pg_isready -U "$DB_USER" -d "$DB_NAME" >/dev/null 2>&1; then
        echo "  PG16 is ready."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ERROR: PG16 did not become ready in 30 seconds"
        exit 1
    fi
    sleep 1
done

# -----------------------------------------------
# 5. Restore dump into PG16
# -----------------------------------------------
echo ""
echo "Step 5/6: Restoring database into PG16..."
gunzip -c "$DUMP_FILE" | docker exec -i "$DB_CONTAINER" \
    psql -U "$DB_USER" -d "$DB_NAME" --quiet

echo "  Restore complete."

# -----------------------------------------------
# 6. Verify PG16 is running
# -----------------------------------------------
echo ""
echo "Step 6/6: Verifying PG16..."
PG_NEW_VERSION=$(docker exec "$DB_CONTAINER" psql -V 2>/dev/null || echo "unknown")
echo "  PostgreSQL version: $PG_NEW_VERSION"
echo "  Dump preserved at: $DUMP_FILE"
echo ""
echo "=== Upgrade complete ==="
echo "Note: remaining services will be started by the deploy pipeline."
