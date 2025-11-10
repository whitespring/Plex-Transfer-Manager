import express from 'express';
import sshManager from '../services/ssh-manager.js';

const router = express.Router();

/**
 * GET /api/files/:serverId
 * Browse files on a server
 * Query params:
 *   - path: Directory path to browse (default: mediaPath from config)
 */
router.get('/:serverId', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.serverId);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    // Get path from query or use server's root media path
    const path = req.query.path || server.mediaPaths?.root || server.mediaPaths?.movies || server.mediaPaths?.tv;

    // Validate path to prevent directory traversal
    const allowedPaths = [
      server.mediaPaths?.root,
      server.mediaPaths?.movies,
      server.mediaPaths?.tv
    ].filter(Boolean);

    const isAllowed = allowedPaths.some(allowedPath => path.startsWith(allowedPath));
    
    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Path must be within server media paths'
      });
    }

    // List files
    const files = await sshManager.listFiles(server, path);

    res.json({
      success: true,
      path,
      files
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/files/:serverId/info
 * Get information about a specific file
 * Query params:
 *   - path: File path
 */
router.get('/:serverId/info', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.serverId);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const path = req.query.path;
    if (!path) {
      return res.status(400).json({
        success: false,
        error: 'Path parameter is required'
      });
    }

    // Validate path
    const allowedPaths = [
      server.mediaPaths?.root,
      server.mediaPaths?.movies,
      server.mediaPaths?.tv
    ].filter(Boolean);

    const isAllowed = allowedPaths.some(allowedPath => path.startsWith(allowedPath));
    
    if (!isAllowed) {
      return res.status(403).json({
        success: false,
        error: 'Access denied: Path must be within server media paths'
      });
    }

    // Get file info
    const fileInfo = await sshManager.getFileInfo(server, path);

    res.json({
      success: true,
      file: fileInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
