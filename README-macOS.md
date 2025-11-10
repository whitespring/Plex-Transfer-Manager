# Plex Transfer Manager - macOS Setup

This guide will help you set up and run the Plex Transfer Manager on macOS.

## Prerequisites

1. **Node.js** (version 16 or higher)
   - Download from: https://nodejs.org/
   - Or install via Homebrew: `brew install node`

2. **Git** (optional, for cloning the repository)
   - Install via Homebrew: `brew install git`

## Installation

1. **Clone or download the project**
   ```bash
   git clone <repository-url>
   cd Plex_Transfer_Manager
   ```

2. **Make the startup script executable**
   ```bash
   chmod +x start-server.sh
   ```

## Configuration

Before running the application, you need to configure your Plex servers in the backend configuration file.

1. **Edit the configuration file:**
   ```bash
   nano backend/src/config/config.json
   ```

2. **Update the server settings:**
   - Replace `192.168.0.105` with your source Plex server IP
   - Replace `192.168.0.101` with your destination Plex server IP
   - Update Plex tokens (get from Plex Web > Settings > General > Sign In)
   - Update SSH credentials for your servers

## Running the Application

### Option 1: Double-Click Launcher (Easiest)

For the most user-friendly experience:

1. **Double-click the `PlexTransferManager.scpt` file**
2. **Terminal will open automatically** and run the startup script
3. **The application will start** with colored status output

This AppleScript launcher will:
- ✅ Open Terminal automatically
- ✅ Navigate to the correct directory
- ✅ Make the startup script executable
- ✅ Run the startup script
- ✅ Handle any errors with dialog boxes

### Option 2: Using the Startup Script (Recommended for Terminal Users)

The startup script will automatically:
- Install dependencies if needed
- Start both backend and frontend servers
- Handle cleanup on exit

```bash
./start-server.sh
```

**What the script does:**
- ✅ Checks for Node.js and npm
- ✅ Installs backend dependencies (if needed)
- ✅ Installs frontend dependencies (if needed)
- ✅ Starts backend server on port 3001
- ✅ Starts frontend development server
- ✅ Provides colored status output
- ✅ Handles clean shutdown with Ctrl+C

### Option 2: Manual Startup

If you prefer to start services manually:

**Terminal 1 - Backend:**
```bash
cd backend
npm install
npm start
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm install
npm run dev -- --host
```

## Accessing the Application

Once both servers are running:

1. **Open your web browser**
2. **Navigate to the frontend URL** (shown in terminal output, typically `http://localhost:3002`)
3. **The application will load** and connect to your Plex servers

## Troubleshooting

### Port Conflicts
If ports 3001 or 3002 are already in use:
- The startup script will warn you but attempt to start anyway
- Kill existing processes: `lsof -ti:3001 | xargs kill -9`

### Permission Issues
If you get permission errors:
```bash
# Make script executable
chmod +x start-server.sh

# Or run with sudo if needed (not recommended)
sudo ./start-server.sh
```

### Node.js Version Issues
If you encounter Node.js compatibility issues:
```bash
# Check your Node.js version
node --version

# Update Node.js if needed
brew update && brew upgrade node
```

### Plex Connection Issues
- Verify your Plex servers are accessible
- Check that Plex tokens are correct
- Ensure SSH credentials are valid
- Confirm firewall settings allow connections

## Stopping the Application

- **Using the startup script:** Press `Ctrl+C` in the terminal
- **Manual shutdown:** Press `Ctrl+C` in each terminal window

## Development

For development work:

```bash
# Backend development with auto-restart
cd backend
npm run dev

# Frontend development with hot reload
cd frontend
npm run dev
```

## File Structure

```
Plex_Transfer_Manager/
├── PlexTransferManager.scpt # Double-click launcher (easiest option)
├── start-server.sh          # macOS startup script
├── README-macOS.md          # This setup guide
├── backend/                 # Node.js backend server
│   ├── src/
│   │   ├── config/config.json    # Server configuration
│   │   ├── services/plex-service.js  # Plex API integration
│   │   └── routes/           # API endpoints
│   └── package.json
├── frontend/                # React frontend
│   ├── src/
│   │   ├── App.jsx          # Main application
│   │   └── services/        # API and WebSocket services
│   └── package.json
└── PRD.json                 # Product requirements
```

## Support

If you encounter issues:

1. Check the terminal output for error messages
2. Verify your configuration in `backend/src/config/config.json`
3. Ensure all prerequisites are installed
4. Check that your Plex servers are running and accessible

## Security Notes

- Store Plex tokens securely (consider environment variables)
- Use strong SSH passwords or key-based authentication
- Keep the application updated with the latest security patches
- Run on a trusted network to prevent unauthorized access
