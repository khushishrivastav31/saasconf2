# SaaSConf Deployment Guide

This guide covers deploying SaaSConf to a staging environment on Hetzner Cloud (or similar VPS provider).

## Architecture Overview

```
                  Internet
                     │
              ┌──────┴──────┐
              │  Traefik    │  (SSL termination, routing)
              │  :80/:443   │
              └──────┬──────┘
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌────▼────┐
    │Frontend │ │ Backend │ │Traefik  │
    │ (Nginx) │ │(FastAPI)│ │Dashboard│
    │  :80    │ │  :8000  │ │         │
    └─────────┘ └────┬────┘ └─────────┘
                     │
         ┌───────────┼───────────┐
         │                       │
    ┌────▼────┐            ┌────▼────┐
    │PostgreSQL│            │  Redis  │
    │  :5432  │            │  :6379  │
    └─────────┘            └─────────┘
```

## Prerequisites

- Domain name with DNS access
- Hetzner Cloud account (or similar VPS provider)
- Local machine with SSH access

## Server Requirements

**Staging:**
- 1x CX22 (2 vCPU, 4GB RAM) - ~€4.35/mo
- Or CX32 (4 vCPU, 8GB RAM) for better performance - ~€7.75/mo

**Production (later):**
- 2x CX32 for load balancing
- Managed PostgreSQL
- Managed Redis (optional)

---

## Step 1: Create Server on Hetzner

1. Log in to [Hetzner Cloud Console](https://console.hetzner.cloud)
2. Create new project "SaaSConf"
3. Add new server:
   - **Location:** Falkenstein (fsn1) or Nuremberg (nbg1)
   - **Image:** Ubuntu 24.04
   - **Type:** CX22 (or CX32)
   - **SSH Key:** Add your public key
   - **Name:** `saasconf-staging`

4. Note the server IP address

## Step 2: Configure DNS

Add these DNS records (replace `yourapp.com` with your domain):

| Type  | Name              | Value           | TTL  |
|-------|-------------------|-----------------|------|
| A     | staging           | <server-ip>     | 300  |
| A     | api.staging       | <server-ip>     | 300  |
| A     | traefik.staging   | <server-ip>     | 300  |

Wait for DNS propagation (check with `dig staging.yourapp.com`).

## Step 3: Initial Server Setup

SSH into the server and run the setup script:

```bash
# SSH as root
ssh root@<server-ip>

# Download and run setup script
curl -O https://raw.githubusercontent.com/your-org/saasconf/main/deploy/staging/setup.sh
chmod +x setup.sh
./setup.sh
```

Or manually:

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker

# Install Docker Compose
apt install -y docker-compose-plugin

# Create deploy user
useradd -m -s /bin/bash deploy
usermod -aG docker deploy

# Set up SSH for deploy user
mkdir -p /home/deploy/.ssh
cp ~/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh

# Create app directory
mkdir -p /opt/saasconf
chown deploy:deploy /opt/saasconf
```

## Step 4: Deploy Application

SSH as the deploy user:

```bash
ssh deploy@<server-ip>

# Clone repository
git clone https://github.com/your-org/saasconf.git /opt/saasconf/app
cd /opt/saasconf/app/deploy/staging

# Configure environment
cp .env.example .env
nano .env
```

Edit `.env` with your values:

```bash
# Domain Configuration
DOMAIN=staging.yourapp.com
ACME_EMAIL=admin@yourapp.com

# Database (generate secure password)
DB_PASSWORD=$(openssl rand -base64 24)

# JWT Secret (generate with openssl)
JWT_SECRET_KEY=$(openssl rand -hex 32)

# Admin credentials
SUPER_ADMIN_EMAIL=admin@yourcompany.com
SUPER_ADMIN_PASSWORD=<secure-password>

# Sentry (optional)
SENTRY_DSN_BACKEND=https://xxx@sentry.io/123
SENTRY_DSN_FRONTEND=https://yyy@sentry.io/456
```

Generate Traefik dashboard password:

```bash
# Install htpasswd
apt install apache2-utils

# Generate auth string
htpasswd -nb admin your-dashboard-password
# Output: admin:$apr1$...
# Add this to TRAEFIK_AUTH in .env
```

Deploy:

```bash
./deploy.sh
```

## Step 5: Verify Deployment

Check service status:

```bash
docker compose ps
```

Expected output:
```
NAME                        STATUS
saasconf_backend_staging    Up (healthy)
saasconf_frontend_staging   Up (healthy)
saasconf_db_staging         Up (healthy)
saasconf_redis_staging      Up (healthy)
saasconf_traefik_staging    Up
```

Test endpoints:
```bash
# Health check
curl https://api.staging.yourapp.com/health

# Frontend
curl -I https://staging.yourapp.com
```

---

## Ongoing Operations

### View Logs

```bash
cd /opt/saasconf/app/deploy/staging

# All services
./logs.sh

# Specific service
./logs.sh backend -f

# Or directly
docker compose logs -f backend
```

### Update Deployment

```bash
cd /opt/saasconf/app/deploy/staging
./deploy.sh 0.2.0
```

### Database Backup

```bash
./backup.sh
```

Backups are stored in `/opt/saasconf/backups/` (last 7 retained).

### Restore Database

```bash
# Stop services
docker compose stop backend

# Restore
gunzip < /opt/saasconf/backups/db_backup_YYYYMMDD.sql.gz | \
  docker compose exec -T db psql -U saasconf saasconf

# Start services
docker compose start backend
```

### Scale Backend (Production)

For production, you can scale the backend:

```bash
docker compose up -d --scale backend=2
```

(Requires updating Traefik config for load balancing.)

---

## Troubleshooting

### SSL Certificate Issues

```bash
# Check Traefik logs
docker compose logs traefik

# Verify DNS is pointing to server
dig +short staging.yourapp.com

# Force certificate renewal
docker compose restart traefik
```

### Database Connection Errors

```bash
# Check database is healthy
docker compose exec db pg_isready -U saasconf

# View database logs
docker compose logs db
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean Docker
docker system prune -a --volumes
```

### Memory Issues

```bash
# Check memory
free -h

# View container stats
docker stats
```

---

## Security Checklist

Before going live:

- [ ] Changed all default passwords
- [ ] JWT_SECRET_KEY is a random 64-char hex string
- [ ] Firewall allows only ports 22, 80, 443
- [ ] Traefik dashboard has strong password
- [ ] Sentry DSN configured for error monitoring
- [ ] Regular backup schedule configured (cron)
- [ ] SSH key authentication only (disable password auth)

### Add Backup Cron Job

```bash
crontab -e
# Add:
0 3 * * * /opt/saasconf/app/deploy/staging/backup.sh >> /var/log/saasconf-backup.log 2>&1
```

---

## Cost Summary (Hetzner)

| Resource           | Staging    | Production  |
|--------------------|------------|-------------|
| Server (CX22/CX32) | €4.35/mo   | €15.50/mo   |
| Managed PostgreSQL | -          | €15-30/mo   |
| Object Storage     | €5/mo      | €12/mo      |
| Load Balancer      | -          | €6/mo       |
| **Total**          | ~€10/mo    | ~€50-65/mo  |

Prices as of 2025. Check [hetzner.com](https://www.hetzner.com/cloud) for current pricing.
