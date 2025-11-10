import express from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Get current directory for config path
const configPath = join(__dirname, '..', 'config', 'config.json');
const sampleConfigPath = join(__dirname, '..', '..', 'sample-config.json');

// Helper function to read config
function readConfig() {
  try {
    let configData;
    try {
      configData = readFileSync(configPath, 'utf-8');
    } catch (configError) {
      // If config.json doesn't exist, try sample-config.json
      try {
        configData = readFileSync(sampleConfigPath, 'utf-8');
      } catch (sampleError) {
        throw new Error(`Neither config.json nor sample-config.json found. Please ensure at least sample-config.json exists.`);
      }
    }
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(`Failed to read config: ${error.message}`);
  }
}

// Helper function to write config
function writeConfig(config) {
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to write config: ${error.message}`);
  }
}

// Filter out sensitive information from config
function filterSafeConfig(config) {
  const safeConfig = JSON.parse(JSON.stringify(config)); // Deep clone

  // Remove sensitive SSH information
  if (safeConfig.servers) {
    safeConfig.servers = safeConfig.servers.map(server => {
      const safeServer = { ...server };
      if (safeServer.ssh) {
        // Remove password but keep other SSH settings
        const { password, ...safeSsh } = safeServer.ssh;
        safeServer.ssh = safeSsh;
      }
      return safeServer;
    });
  }

  return safeConfig;
}

// GET /api/settings - Get all safe configuration settings
router.get('/', (req, res) => {
  try {
    const config = readConfig();
    const safeConfig = filterSafeConfig(config);

    res.json({
      success: true,
      config: safeConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Settings GET error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// PUT /api/settings - Update configuration settings
router.put('/', (req, res) => {
  try {
    const updates = req.body;
    const currentConfig = readConfig();

    // Validate updates (basic validation)
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid update data'
      });
    }

    // Prevent updating sensitive fields
    const sensitiveFields = ['servers.ssh.password'];
    for (const field of sensitiveFields) {
      if (updates[field]) {
        return res.status(403).json({
          success: false,
          error: `Cannot update sensitive field: ${field}`
        });
      }
    }

    // Merge updates into current config
    const updatedConfig = { ...currentConfig, ...updates };

    // Write updated config
    writeConfig(updatedConfig);

    // Reload config in the app
    req.app.locals.config = updatedConfig;

    // Update transfer manager settings if changed
    if (updates.transfer?.maxConcurrent) {
      const transferManager = req.app.locals.transferManager;
      if (transferManager) {
        transferManager.setMaxConcurrent(updates.transfer.maxConcurrent);
      }
    }

    res.json({
      success: true,
      message: 'Configuration updated successfully',
      config: filterSafeConfig(updatedConfig),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Settings PUT error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/settings/generate-nginx - Generate nginx.conf from current config
router.post('/generate-nginx', (req, res) => {
  try {
    // Run the nginx generation script
    const generateScript = join(__dirname, '..', '..', '..', 'scripts', 'generate-nginx.js');

    const child = spawn('node', ['--silent', generateScript], {
      cwd: join(__dirname, '..', '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        res.json({
          success: true,
          message: 'nginx.conf generated successfully',
          nginxConfig: stdout,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          error: `nginx generation failed: ${stderr}`
        });
      }
    });

    child.on('error', (error) => {
      res.status(500).json({
        success: false,
        error: `Failed to run nginx generation: ${error.message}`
      });
    });

  } catch (error) {
    console.error('Generate nginx error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// POST /api/settings/reload - Reload configuration (for development)
router.post('/reload', (req, res) => {
  try {
    const config = readConfig();

    // Replace environment variable references in SSH passwords
    config.servers = config.servers.map(server => {
      if (server.ssh.password && server.ssh.password.startsWith('env:')) {
        const envVar = server.ssh.password.substring(4);
        server.ssh.password = process.env[envVar];
      }
      return server;
    });

    // Update app config
    req.app.locals.config = config;

    // Update transfer manager settings
    const transferManager = req.app.locals.transferManager;
    if (transferManager && config.transfer?.maxConcurrent) {
      transferManager.setMaxConcurrent(config.transfer.maxConcurrent);
    }

    res.json({
      success: true,
      message: 'Configuration reloaded successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Reload config error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
