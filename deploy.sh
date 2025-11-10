#!/bin/bash

# Plex Transfer Manager Deployment Script
# This script sets up the complete deployment on an LXC container

set -e

echo "🚀 Starting Plex Transfer Manager Deployment"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   print_error "This script must be run as root"
   exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

print_status "Installing system dependencies..."

# Update package list
apt update

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    print_status "Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
fi

print_status "Skipping Nginx installation (using external Nginx Proxy Manager)"

print_status "Installing Node.js dependencies..."

# Install backend dependencies
cd backend
if [ ! -d "node_modules" ]; then
    npm install
fi

# Install frontend dependencies
cd ../frontend
if [ ! -d "node_modules" ]; then
    npm install
fi

cd ..

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    print_status "Installing PM2..."
    npm install -g pm2
fi

print_status "Starting backend service with PM2..."

# Stop any existing processes
pm2 delete all 2>/dev/null || true

# Start backend
cd backend
pm2 start src/server.js --name plex-backend

cd ..

# Save PM2 configuration
pm2 save

# Set up PM2 startup
print_status "Setting up PM2 auto-startup..."
if pm2 startup | grep -q "sudo"; then
    eval $(pm2 startup | grep "sudo" | head -1)
else
    pm2 startup
fi

print_success "Deployment completed!"
echo ""
echo "🎉 Plex Transfer Manager is now running!"
echo ""
echo "Access the application at: https://plextransfer.netsv.org"
echo ""
echo "Management commands:"
echo "  pm2 list                    # View running processes"
echo "  pm2 logs                    # View logs"
echo "  pm2 restart plex-backend    # Restart backend"
echo ""
print_warning "Don't forget to:"
echo "  1. Configure SSH keys between your Plex servers"
echo "  2. Update backend/.env with correct SSH passwords"
echo "  3. Verify backend/src/config/config.json has correct server IPs"
echo "  4. Set up SSL certificate for HTTPS (recommended)"
