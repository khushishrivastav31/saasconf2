#!/bin/bash
set -e

# ===========================================
# SaaSConf Staging - Deployment Script
# ===========================================
# Usage: ./deploy.sh [version]
# Example: ./deploy.sh 0.2.0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="${1:-$(date +%Y%m%d-%H%M%S)}"

echo "=== SaaSConf Staging Deployment ==="
echo "Version: $VERSION"
echo "Project: $PROJECT_ROOT"
echo ""

# Check for .env file
if [ ! -f "$SCRIPT_DIR/.env" ]; then
    echo "ERROR: .env file not found!"
    echo "Please copy .env.example to .env and configure it."
    exit 1
fi

# Load environment
set -a
source "$SCRIPT_DIR/.env"
set +a

# Update APP_VERSION in .env
sed -i "s/^APP_VERSION=.*/APP_VERSION=$VERSION/" "$SCRIPT_DIR/.env"

cd "$SCRIPT_DIR"

echo "Step 1: Pulling latest code..."
cd "$PROJECT_ROOT"
git pull origin main

echo ""
echo "Step 2: Building Docker images..."
cd "$SCRIPT_DIR"
docker compose build --no-cache

echo ""
echo "Step 3: Running database migrations..."
docker compose run --rm backend alembic upgrade head

echo ""
echo "Step 4: Deploying services..."
docker compose up -d

echo ""
echo "Step 5: Cleaning up old images..."
docker image prune -f

echo ""
echo "Step 6: Checking service health..."
sleep 10

# Check if services are running
SERVICES=("backend" "frontend" "db" "redis" "traefik")
ALL_HEALTHY=true

for service in "${SERVICES[@]}"; do
    STATUS=$(docker compose ps --format "{{.Status}}" "$service" 2>/dev/null | head -1)
    if [[ "$STATUS" == *"Up"* ]]; then
        echo "  $service: OK"
    else
        echo "  $service: FAILED ($STATUS)"
        ALL_HEALTHY=false
    fi
done

echo ""
if [ "$ALL_HEALTHY" = true ]; then
    echo "=== Deployment Successful ==="
    echo "Application is live at: https://$DOMAIN"
    echo "API available at: https://api.$DOMAIN"
else
    echo "=== Deployment Warning ==="
    echo "Some services may not be healthy. Check logs:"
    echo "  docker compose logs -f"
fi
