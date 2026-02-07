#!/bin/bash
set -e

# ===========================================
# SaaSConf Staging - Initial Server Setup
# ===========================================
# Run this script on a fresh server to set up the staging environment
# Usage: ./setup.sh

echo "=== SaaSConf Staging Setup ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo ./setup.sh)"
    exit 1
fi

# Update system
echo "Updating system packages..."
apt-get update && apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

# Install Docker Compose plugin
echo "Installing Docker Compose..."
apt-get install -y docker-compose-plugin

# Create deploy user
echo "Creating deploy user..."
if ! id "deploy" &>/dev/null; then
    useradd -m -s /bin/bash deploy
    usermod -aG docker deploy
    echo "deploy ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/docker-compose" >> /etc/sudoers.d/deploy
fi

# Create application directory
echo "Setting up application directory..."
mkdir -p /opt/saasconf
chown -R deploy:deploy /opt/saasconf

# Install useful tools
apt-get install -y htop vim curl wget git

# Configure firewall
echo "Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp    # SSH
    ufw allow 80/tcp    # HTTP
    ufw allow 443/tcp   # HTTPS
    ufw --force enable
fi

# Set up log rotation for Docker
cat > /etc/logrotate.d/docker-containers << 'EOF'
/var/lib/docker/containers/*/*.log {
    rotate 7
    daily
    compress
    missingok
    delaycompress
    copytruncate
}
EOF

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Copy your SSH key to the deploy user:"
echo "   ssh-copy-id deploy@$(hostname -I | awk '{print $1}')"
echo ""
echo "2. Clone the repository:"
echo "   su - deploy"
echo "   git clone <your-repo> /opt/saasconf/app"
echo ""
echo "3. Configure environment:"
echo "   cd /opt/saasconf/app/deploy/staging"
echo "   cp .env.example .env"
echo "   nano .env  # Edit with your values"
echo ""
echo "4. Deploy the application:"
echo "   ./deploy.sh"
