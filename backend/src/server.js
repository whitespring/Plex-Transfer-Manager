import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Import services
import transferManager from './services/transfer-manager.js';
import sshManager from './services/ssh-manager.js';

// Import routes
import serversRouter from './routes/servers.js';
import filesRouter from './routes/files.js';
import transfersRouter from './routes/transfers.js';
import settingsRouter from './routes/settings.js';

// Load environment variables
dotenv.config();

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load configuration
const configPath = join(__dirname, 'config', 'config.json');
const sampleConfigPath = join(__dirname, '..', 'sample-config.json');
let config;
let usingSampleConfig = false;

try {
  // Try to load config.json first
  let configData;
  try {
    configData = readFileSync(configPath, 'utf-8');
    console.log('✓ Configuration loaded from config.json');
  } catch (configError) {
    // If config.json doesn't exist, try sample-config.json
    try {
      configData = readFileSync(sampleConfigPath, 'utf-8');
      usingSampleConfig = true;
      console.log('✓ Configuration loaded from sample-config.json (first-time setup)');
    } catch (sampleError) {
      throw new Error(`Neither config.json nor sample-config.json found. Please ensure at least sample-config.json exists.`);
    }
  }

  config = JSON.parse(configData);

  // Replace environment variable references in SSH passwords
  config.servers = config.servers.map(server => {
    if (server.ssh.password && server.ssh.password.startsWith('env:')) {
      const envVar = server.ssh.password.substring(4);
      server.ssh.password = process.env[envVar];

      if (!server.ssh.password) {
        console.warn(`⚠️  Warning: Environment variable ${envVar} not set for server ${server.id}`);
      }
    }
    return server;
  });

} catch (error) {
  console.error('✗ Failed to load configuration:', error.message);
  process.exit(1);
}

// Create Express app
const app = express();
const httpServer = createServer(app);

// Set up Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: config.backend.corsOrigins || ['http://localhost:5173'],
    methods: ['GET', 'POST', 'DELETE']
  }
});

// Configure middleware
app.use(cors({
  origin: config.backend.corsOrigins || ['http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Make config and io available to routes
app.locals.config = config;
app.locals.io = io;

// Set up transfer manager with Socket.IO
transferManager.setSocketIO(io);
if (config.transfer?.maxConcurrent) {
  transferManager.setMaxConcurrent(config.transfer.maxConcurrent);
}

// Set config for SSH manager
sshManager.setConfig(config);

// API Routes
app.use('/api/servers', serversRouter);
app.use('/api/files', filesRouter);
app.use('/api/transfers', transfersRouter);
app.use('/api/settings', settingsRouter);

// UI config endpoint
app.get('/api/config/ui', (req, res) => {
  try {
    const config = req.app.locals.config;
    console.log('🔧 UI config request - config.ui:', config.ui);

    const uiConfig = config.ui || {
      visibleMovies: 36,
      visibleEpisodes: 36,
      visibleSeasons: 24
    };

    console.log('📤 Returning UI config:', uiConfig);

    res.json({
      success: true,
      ui: uiConfig
    });
  } catch (error) {
    console.error('❌ UI config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Frontend config endpoint
app.get('/api/config/frontend', (req, res) => {
  try {
    const config = req.app.locals.config;
    console.log('🔧 Frontend config request - config.frontend:', config.frontend);

    const frontendConfig = config.frontend || {
      port: 3000,
      defaultSourceServer: "server1",
      defaultDestServer: "server2"
    };

    console.log('📤 Returning frontend config:', frontendConfig);

    res.json({
      success: true,
      frontend: frontendConfig
    });
  } catch (error) {
    console.error('❌ Frontend config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      ssh: 'operational',
      transfers: 'operational'
    },
    stats: transferManager.getStatistics()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.DEBUG === 'true' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[WebSocket] Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[WebSocket] Client disconnected: ${socket.id}`);
  });

  // Send initial transfer list
  socket.emit('transfers:initial', transferManager.getAllTransfers());
});

// Start server
const PORT = config.backend.port || 3001; // Backend port from config, default 3001
const HOST = process.env.HOST || config.backend.host || '0.0.0.0';

httpServer.listen(PORT, HOST, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Plex Transfer Manager Backend');
  console.log('='.repeat(60));
  console.log(`✓ Server running on http://${HOST}:${PORT}`);
  console.log(`✓ Configured servers: ${config.servers.length}`);
  config.servers.forEach(server => {
    console.log(`  - ${server.name} (${server.id})`);
  });
  console.log(`✓ Max concurrent transfers: ${transferManager.maxConcurrent}`);
  console.log(`✓ WebSocket ready for real-time updates`);
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM received, shutting down gracefully...');
  
  // Close SSH connections
  sshManager.disconnectAll();
  
  // Close HTTP server
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down gracefully...');
  
  // Close SSH connections
  sshManager.disconnectAll();
  
  // Close HTTP server
  httpServer.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

// Periodic cleanup of old transfers (every hour)
setInterval(() => {
  transferManager.clearOldTransfers();
}, 60 * 60 * 1000);

export default app;
