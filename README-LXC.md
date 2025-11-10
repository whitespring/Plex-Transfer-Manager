# Plex Transfer Manager - LXC Deployment

This guide will help you deploy the Plex Transfer Manager in an LXC container with automatic startup.

## Prerequisites

- LXC container with Linux (Ubuntu/Debian recommended)
- Node.js 18+ installed
- SSH access configured between Plex servers
- PM2 installed globally
- External Nginx Proxy Manager configured to proxy to this container

## Nginx Proxy Manager Configuration

Since the frontend is built for production (static files), configure Nginx Proxy Manager to serve the static files and route API/WebSocket requests:

### **Option A: Serve Static Files via Nginx Proxy Manager**
If your Nginx Proxy Manager can serve static files from a directory:

1. **Domain:** `plextransfer.netsv.org`
2. **Forward Hostname/IP:** `your-lxc-container-ip`
3. **Forward Port:** `80` (or whatever static file server you use)
4. **Root Directory:** `/root/Plex_Transfer_Manager/frontend/dist`
5. **Enable WebSocket Support:** ✅ Yes
6. **Custom Locations:**

   **Location: `/api/`**
   - Forward Hostname/IP: `your-lxc-container-ip`
   - Forward Port: `3001`
   - Enable WebSocket Support: ✅ Yes

   **Location: `/socket.io/`**
   - Forward Hostname/IP: `your-lxc-container-ip`
   - Forward Port: `3001`
   - Enable WebSocket Support: ✅ Yes

### **Option B: Use a Simple HTTP Server for Static Files**
If you need to serve static files, you can run a simple HTTP server:

```bash
# Install a simple HTTP server
npm install -g http-server

# Serve static files
cd /root/Plex_Transfer_Manager/frontend/dist
http-server -p 8080

# Then configure Nginx Proxy Manager to forward to port 8080 for main traffic
# and port 3001 for /api/* and /socket.io/*
```

The backend runs on port 3001 and handles all API and WebSocket connections.

## Installation

### Option 1: Automated Deployment (Recommended)

Run the automated deployment script as root:

```bash
git clone <repository-url>
cd Plex_Transfer_Manager
sudo ./deploy.sh
```

The script will:
- Install Node.js and PM2 (skips Nginx since using external proxy)
- Install frontend and backend dependencies
- Build frontend for production (static files)
- Start backend (port 3001) with PM2
- Set up automatic startup on LXC boot

### Option 2: Manual Installation

1. **Clone or copy the project to your LXC container**
   ```bash
   git clone <repository-url>
   cd Plex_Transfer_Manager
   ```

2. **Install dependencies**
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   npm run build  # Build for production
   cd ..
   ```

3. **Configure environment**
   - Edit `backend/.env` with your SSH passwords
   - Verify `backend/src/config/config.json` has correct server IPs and CORS origins

4. **Install PM2 globally (if not already installed)**
   ```bash
   npm install -g pm2
   ```

5. **Set up Nginx (for production serving)**
   ```bash
   # Install nginx if not already installed
   apt update && apt install -y nginx

   # Copy nginx configuration
   cp nginx.conf /etc/nginx/sites-available/plextransfer

   # Enable the site
   ln -s /etc/nginx/sites-available/plextransfer /etc/nginx/sites-enabled/

   # Remove default site (optional)
   rm /etc/nginx/sites-enabled/default

   # Test configuration
   nginx -t

   # Reload nginx
   systemctl reload nginx
   ```

## Starting Services

### Manual Start

```bash
# Start backend
cd backend
pm2 start src/server.js --name plex-backend

# Start frontend
cd ../frontend
pm2 start npm --name plex-frontend -- run dev -- --host

# Save configuration
pm2 save
```

### Automatic Startup Setup

```bash
# Set up PM2 to start on boot
pm2 startup

# Follow the prompts to enable the systemd service
```

## Verification

1. **Check PM2 status**
   ```bash
   pm2 list
   ```

2. **Test backend API**
   ```bash
   curl http://localhost:3001/api/health
   ```

3. **Test frontend**
   ```bash
   curl -I http://localhost:3000
   ```

4. **Access the application**
   - Frontend: http://your-lxc-ip:3000
   - Backend API: http://your-lxc-ip:3001

## Management Commands

```bash
# View logs
pm2 logs

# View logs for specific service
pm2 logs plex-backend
pm2 logs plex-frontend

# Restart services
pm2 restart plex-backend
pm2 restart plex-frontend

# Stop services
pm2 stop all

# Delete services
pm2 delete all
```

## Troubleshooting

### Services not starting
- Check PM2 logs: `pm2 logs`
- Verify Node.js version: `node --version`
- Check environment variables in `.env`

### Port conflicts
- Verify ports 3000 and 3001 are available
- Check with: `ss -tlnp | grep -E ':(3000|3001)'`

### SSH connection issues
- Test SSH manually: `ssh root@192.168.0.105`
- Verify passwords in `.env` file
- Check SSH key setup between servers

## Automatic Startup

The PM2 systemd service will automatically start the services when the LXC container boots. The services will run as daemons in the background.

## Security Notes

- Change default SSH passwords
- Consider using SSH keys instead of passwords
- Restrict network access to necessary IPs
- Keep Node.js and dependencies updated

## File Structure

```
Plex_Transfer_Manager/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── config/config.json    # Server configuration
│   │   ├── services/plex-service.js  # Plex API integration
│   │   └── routes/           # API endpoints
│   └── .env                  # Environment variables
├── frontend/                # React frontend
│   ├── src/
│   │   ├── App.jsx          # Main application
│   │   └── services/        # API and WebSocket services
│   └── package.json
└── README-LXC.md           # This deployment guide
```

## Support

If you encounter issues:

1. Check PM2 logs for error messages
2. Verify configuration in `backend/src/config/config.json`
3. Test SSH connections manually
4. Ensure all dependencies are installed
5. Check that Plex servers are accessible
