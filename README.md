# Plex Transfer Manager

A dual-server Plex management application with direct SSH file transfers between servers.

## 🎯 Background & Motivation

So imagine you have a large Plex server that requires a lot of power to run and therefore might be expensive over time. What you would like is a secondplex with only current or relevant media that you're currently watching so you can shut down your main largeplex server. This project allows you to connect multiple Plex servers and enables you to quickly and easily copy content from your main server to other servers in order to then be able to shut down your main server again and still watch your most current or the media that you're interested in.

## 🎯 Features

- **Multi-Server Management**: Connect to multiple Plex servers simultaneously
- **SSH File Browsing**: Browse files on remote servers via SSH
- **Direct Server-to-Server Transfers**: Transfer files directly between servers using rsync (no intermediate storage)
- **Real-Time Progress**: Live progress tracking with WebSocket updates
- **Transfer Queue**: Manage multiple concurrent file transfers
- **Watch Status Indicators**: Visual indicators for watched content (blue checkmarks) and existing files (green checkmarks)
- **Progress Bars**: Shows partial watch progress for in-progress content
- **Existing Features**: Includes duplicate finder and recently added content viewer

## 📋 Project Status

**Current Phase**: Phase 1-2 Complete (Setup & SSH Infrastructure)  
**Progress**: ~40% Complete

See `PRD.json` for detailed progress tracking.

### ✅ Completed
- Project structure setup
- Backend package.json with dependencies
- Frontend package.json with Socket.IO client
- Configuration templates
- SSH setup documentation
- SSH Manager service
- Transfer Manager service
- Backend dependencies configuration

### 🔄 In Progress
- Backend API routes
- Frontend components
- WebSocket integration

### ⏳ Pending
- Frontend UI components
- Integration testing
- Documentation completion

## 🏗️ Architecture

### Development Setup (Recommended for Testing)
```
┌─────────────────────┐
│  Vite Dev Server    │ ← User's Browser
│  Port: 5173         │
│  Hot Reload         │
│  Auto Proxy         │
└─────────┬───────────┘
          │ HTTP/WebSocket
          ↓
┌─────────────────┐
│  Backend (Node) │ ← LXC Container 101
│  Port: 3001     │
└────────┬─────────┘
         │ SSH (password)
         ↓
┌─────────────────┐        ┌──────────────────┐
│ Plex Server A   │───────→│ Plex Server B    │
│ (192.168.0.105) │  rsync │ (192.168.0.XXX)  │
└─────────────────┘  (SSH)  └──────────────────┘
```

### Production Setup
```
┌─────────────────┐
│  Nginx          │ ← User's Browser
│  Port: 3000     │
│  Static Files   │
└────────┬─────────┘
          │ Proxy
          ↓
┌─────────────────┐
│  Backend (Node) │ ← LXC Container 101
│  Port: 3001     │
└────────┬─────────┘
         │ SSH (password)
         ↓
┌─────────────────┐        ┌──────────────────┐
│ Plex Server A   │───────→│ Plex Server B    │
│ (192.168.0.105) │  rsync │ (192.168.0.XXX)  │
└─────────────────┘  (SSH)  └──────────────────┘
```

## 🚀 Getting Started

### Prerequisites

- Node.js >= 18.0.0
- SSH access to Plex servers
- rsync installed on Plex servers
- Plex API tokens for each server

### SSH Setup

**IMPORTANT**: Before running the application, you must set up SSH connections between servers.

See `backend/docs/SSH_SETUP.md` for detailed instructions.

Quick setup:
1. Generate SSH keys on Plex Server A
2. Copy keys to Plex Server B
3. Create `.env` file with SSH passwords
4. Update `backend/src/config/config.json` with server details

### Installation & Running

#### Backend (Required for both setups)

```bash
cd backend
npm install

# Copy and configure sample files
cp sample.env .env
cp sample-config.json src/config/config.json

# Edit .env with your SSH passwords
# Edit src/config/config.json with your server details
npm run dev
```

The backend runs on **port 3001** and provides the API for both development and production.

#### Option 1: Development Setup (Recommended for Testing)

**Frontend Development Server:**
```bash
cd frontend
npm install
npm run dev
```

**Access the app at:** `http://localhost:5173/` or `http://192.168.2.208:5173/`

**Benefits:**
- ✅ Hot reload - changes appear instantly
- ✅ No manual build/copy process
- ✅ Better for development and testing
- ✅ Automatic API proxying

#### Option 2: Production Setup

**Frontend Production Build:**
```bash
cd frontend
npm install
npm run build
```

**Deploy to nginx:**
```bash
# Build the frontend
cd frontend
npm run build
cp -r dist/* /var/www/html/plex/

# Generate nginx configuration from config.json
cd ../backend
npm run generate-nginx > ../../nginx.conf

# Copy nginx config to sites-available and enable
sudo cp ../../nginx.conf /etc/nginx/sites-available/plextransfer
sudo ln -sf /etc/nginx/sites-available/plextransfer /etc/nginx/sites-enabled/

# Test and restart nginx
sudo nginx -t
sudo systemctl restart nginx
```

**Access the app at:** `http://192.168.2.208/` (or your configured domain)

**Benefits:**
- ✅ Optimized production build
- ✅ Static file caching
- ✅ Auto-generated nginx config from config.json
- ✅ Better performance for end users

**⚠️ IMPORTANT:** For production setup, regenerate nginx.conf after changing nginx settings in config.json.

## 📖 Configuration

### Backend Configuration

Edit `backend/src/config/config.json`:

```json
{
  "servers": [
    {
      "id": "server1",
      "name": "Plex Server A",
      "plexUrl": "http://192.168.0.105:32400",
      "plexToken": "YOUR_PLEX_TOKEN",
      "ssh": {
        "host": "192.168.0.105",
        "port": 22,
        "username": "plex",
        "password": "env:PLEX_SERVER1_SSH_PASSWORD"
      },
      "mediaPath": "/mnt/media/plex"
    }
  ]
}
```

### Environment Variables

Create `backend/.env`:

```env
PLEX_SERVER1_SSH_PASSWORD=your_password
PLEX_SERVER2_SSH_PASSWORD=your_password
PORT=3001
HOST=0.0.0.0
```

## 🔌 API Endpoints

### Servers
- `GET /api/servers` - List all configured servers
- `GET /api/servers/:id` - Get server details

### Files
- `GET /api/servers/:id/files?path=/path` - Browse files on a server

### Transfers
- `POST /api/transfers` - Create a new file transfer
- `GET /api/transfers` - List all transfers
- `GET /api/transfers/:id` - Get transfer details
- `DELETE /api/transfers/:id` - Cancel a transfer

## 🔗 WebSocket Events

### Client ← Server
- `transfer:update` - Transfer status changed
- `transfer:progress` - Transfer progress update
- `transfer:complete` - Transfer completed
- `transfer:error` - Transfer failed

## 📁 Project Structure

```
Plex_Transfer_Manager/
├── PRD.json                    # Product Requirements Document
├── README.md                   # This file
├── nginx.conf                  # Generated nginx config (gitignored)
├── scripts/                    # Utility scripts
│   └── generate-nginx.js       # Nginx config generator
├── backend/                    # Node.js Backend
│   ├── src/
│   │   ├── server.js          # Main server file
│   │   ├── config/
│   │   │   └── config.json    # Server configuration
│   │   ├── services/
│   │   │   ├── ssh-manager.js         # SSH operations
│   │   │   ├── transfer-manager.js    # Transfer orchestration
│   │   │   └── plex-service.js        # Plex API integration
│   │   ├── routes/
│   │   │   ├── servers.js     # Server management routes
│   │   │   ├── files.js       # File browsing routes
│   │   │   └── transfers.js   # Transfer routes
│   │   └── utils/
│   ├── docs/
│   │   └── SSH_SETUP.md       # SSH setup guide
│   ├── sample.env             # Sample environment variables
│   ├── sample-config.json     # Sample configuration file
│   ├── .env.example           # Legacy example file
│   ├── package.json
│   └── .env                   # Actual environment (gitignored)
│
└── frontend/                   # React Frontend
    ├── src/
    │   ├── components/
    │   │   ├── RecentlyAdded.jsx      # Recently added content
    │   │   ├── DuplicateFinder.jsx    # Duplicate finder
    │   │   ├── ServerTransfer.jsx     # Main transfer interface
    │   │   ├── ServerSelector.jsx     # Server selection
    │   │   ├── FileBrowser.jsx        # Server selection
    │   │   ├── TransferQueue.jsx      # Transfer queue display
    │   │   └── ProgressBar.jsx        # Progress bar
    │   ├── services/
    │   │   ├── api.js                 # Backend API client
    │   │   └── websocket.js           # WebSocket client
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    └── vite.config.js
```

## 🔒 Security Notes

- SSH passwords are stored in `.env` file (not committed to git)
- Server-to-server transfers use SSH key authentication
- Path traversal protection in file browsing
- CORS restrictions in place

## 🐛 Troubleshooting

### SSH Connection Failed
- Verify server IP addresses and SSH ports
- Check SSH credentials in `.env`
- Ensure SSH service is running on servers
- Test connection manually: `ssh user@host`

### Transfer Hangs
- Check network connectivity between servers
- Verify rsync is installed on both servers
- Check disk space on destination server
- Review backend logs for errors

### Permission Denied
- Verify SSH user has read access to source files
- Verify SSH user has write access to destination directory
- Check file permissions: `ls -la /path/to/file`

### Frontend Changes Not Showing (Production Setup)
- After making frontend changes, you must rebuild and redeploy:
  ```bash
  cd frontend
  npm run build
  cp -r dist/* /var/www/html/plex/
  systemctl restart nginx
  ```
- Clear browser cache or hard refresh (Ctrl+F5)

### Frontend Changes Not Showing (Development Setup)
- Ensure Vite dev server is running: `cd frontend && npm run dev`
- Access at `http://localhost:5173/` (not port 3000)
- Changes should appear instantly with hot reload

### Watch Status Not Showing
- Verify Plex API token is valid and has read access
- Check that content has been watched in Plex
- Blue checkmarks = watched content
- Green checkmarks = exists on destination server
- Progress bars show partial watch progress

### Multiple Servers Running
- **Development**: Vite (5173) + Backend (3001)
- **Production**: nginx (3000) + Backend (3001)
- **Don't run both nginx and Vite** on same ports
- Check running processes: `ps aux | grep -E "(nginx|vite|node.*server)"`

## 📝 Development Notes

### Adding a New Server

1. Update `backend/src/config/config.json`
2. Add SSH password to `.env`
3. Set up SSH keys between servers
4. Restart backend server

### Custom rsync Options

Edit `backend/src/config/config.json`:

```json
{
  "transfer": {
    "rsyncOptions": "-avz --progress --partial --bwlimit=10000"
  }
}
```

## 🤝 Contributing

1. Check `PRD.json` for pending tasks
2. Follow existing code patterns
3. Test SSH connections before file operations
4. Update documentation for new features

## 📄 License

MIT

## 🔗 Related Documentation

- [SSH Setup Guide](backend/docs/SSH_SETUP.md)
- [PRD (Product Requirements)](PRD.json)
- [Plex API Documentation](https://www.plex.tv/integrations/)
