#!/bin/bash
set -e

# ===========================================
# SSL Certificate Initialization Script
# ===========================================
# Run this script once to obtain initial SSL certificates
# Usage: ./init-ssl.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment
if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

DOMAIN="${DOMAIN:-staging.sonrisa.ventures}"
EMAIL="${SSL_EMAIL:-admin@sonrisa.ventures}"

echo "=== SSL Certificate Initialization ==="
echo "Domain: $DOMAIN"
echo "Email: $EMAIL"
echo ""

# Create required directories
mkdir -p ./certbot/conf
mkdir -p ./certbot/www

# Step 1: Create a temporary nginx config for ACME challenge
echo "Step 1: Creating temporary nginx config for certificate issuance..."
cat > ./nginx-init.conf << 'EOF'
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    server {
        listen 80;
        server_name staging.sonrisa.ventures api.staging.sonrisa.ventures;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            return 200 'SSL certificate pending...';
            add_header Content-Type text/plain;
        }
    }
}
EOF

# Step 2: Start nginx with temporary config
echo "Step 2: Starting nginx for ACME challenge..."
docker compose down nginx certbot 2>/dev/null || true

docker run -d --name saasconf_nginx_init \
    -p 80:80 \
    -v "$SCRIPT_DIR/nginx-init.conf:/etc/nginx/nginx.conf:ro" \
    -v "$SCRIPT_DIR/certbot/www:/var/www/certbot" \
    nginx:alpine

sleep 3

# Step 3: Obtain certificates
echo "Step 3: Obtaining SSL certificates from Let's Encrypt..."
docker run --rm \
    -v "$SCRIPT_DIR/certbot/conf:/etc/letsencrypt" \
    -v "$SCRIPT_DIR/certbot/www:/var/www/certbot" \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "api.$DOMAIN"

# Step 4: Stop temporary nginx
echo "Step 4: Stopping temporary nginx..."
docker stop saasconf_nginx_init
docker rm saasconf_nginx_init
rm -f ./nginx-init.conf

# Step 5: Verify certificates
echo "Step 5: Verifying certificates..."
if [ -f "./certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
    echo "✅ SSL certificates obtained successfully!"
    echo ""
    echo "Certificate location: ./certbot/conf/live/$DOMAIN/"
    echo ""
    echo "Now run: ./deploy.sh"
else
    echo "❌ Failed to obtain certificates"
    exit 1
fi
