#!/bin/bash

# ===========================================
# SaaSConf Staging - Log Viewer
# ===========================================
# Usage: ./logs.sh [service] [options]
# Examples:
#   ./logs.sh              # All services
#   ./logs.sh backend      # Backend only
#   ./logs.sh backend -f   # Follow backend logs

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SERVICE="${1:-}"
shift 2>/dev/null || true

if [ -z "$SERVICE" ]; then
    docker compose logs --tail=100 "$@"
else
    docker compose logs --tail=100 "$SERVICE" "$@"
fi
