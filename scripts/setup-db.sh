#!/bin/sh
# Reads DATABASE_URL from backend/.env and creates (or drops) the DB role + database.
# Usage: setup-db.sh [drop]
set -e

ENV_FILE="backend/.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ $ENV_FILE not found. Run 'make init' first."
  exit 1
fi

DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2-)
DB_USER=$(echo "$DB_URL" | sed 's|.*://\([^:]*\):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed 's|.*://[^:]*:\([^@]*\)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed 's|.*/\([^?]*\).*|\1|')

# Use DB_ADMIN_USER from .env, fallback to current OS user (default on macOS/Homebrew)
DB_ADMIN=$(grep "^DB_ADMIN_USER=" "$ENV_FILE" | cut -d= -f2-)
DB_ADMIN=${DB_ADMIN:-$(whoami)}

echo "  Admin:    $DB_ADMIN"
echo "  User:     $DB_USER"
echo "  Database: $DB_NAME"

# Drop mode
if [ "${1:-}" = "drop" ]; then
  psql -U "$DB_ADMIN" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
  psql -U "$DB_ADMIN" -d postgres -c "DROP ROLE IF EXISTS $DB_USER;"
  echo "  Dropped database '$DB_NAME' and role '$DB_USER'."
  exit 0
fi

if psql -U "$DB_ADMIN" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
  echo "  Role '$DB_USER' already exists, skipping."
else
  psql -U "$DB_ADMIN" -d postgres -c "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS';"
  echo "  Role '$DB_USER' created."
fi

if psql -U "$DB_ADMIN" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  echo "  Database '$DB_NAME' already exists, skipping."
else
  psql -U "$DB_ADMIN" -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  psql -U "$DB_ADMIN" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
  echo "  Database '$DB_NAME' created."
fi
