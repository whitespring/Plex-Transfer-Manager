import express from 'express';
import sshManager from '../services/ssh-manager.js';
import plexService from '../services/plex-service.js';

const router = express.Router();



/**
 * GET /api/servers
 * Get list of all configured servers
 */
router.get('/', (req, res) => {
  try {
    const config = req.app.locals.config;

    // Return server info without sensitive data
    const servers = config.servers.map(server => ({
      id: server.id,
      name: server.name,
      plexUrl: server.plexUrl,
      mediaPaths: server.mediaPaths,
      ssh: {
        host: server.ssh.host,
        port: server.ssh.port,
        username: server.ssh.username
        // Don't include password
      }
    }));

    res.json({
      success: true,
      servers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id
 * Get details of a specific server
 */
router.get('/:id', (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    res.json({
      success: true,
      server: {
        id: server.id,
        name: server.name,
        plexUrl: server.plexUrl,
        mediaPaths: server.mediaPaths,
        ssh: {
          host: server.ssh.host,
          port: server.ssh.port,
          username: server.ssh.username
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/servers/:id/test
 * Test SSH connection to a server
 */
router.post('/:id/test', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    // Test connection by executing a simple command
    const result = await sshManager.executeCommand(server, 'echo "Connection successful"');

    if (result.exitCode === 0) {
      res.json({
        success: true,
        message: 'SSH connection successful',
        output: result.stdout
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'SSH connection failed',
        details: result.stderr || result.stdout
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/info
 * Get server information from Plex API
 */
router.get('/:id/info', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const serverInfo = await plexService.getServerInfo(server.plexUrl, server.plexToken);

    res.json({
      success: true,
      server: serverInfo
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/disk
 * Get disk space information for a server
 */
router.get('/:id/disk', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    // Get disk usage information
    const result = await sshManager.executeCommand(server, 'df -h --output=source,size,used,avail,pcent,target | tail -n +2');

    if (result.exitCode !== 0) {
      throw new Error(`Failed to get disk info: ${result.stderr || result.stdout}`);
    }

    // Parse df output
    const lines = result.stdout.trim().split('\n');
    const disks = lines.map(line => {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 6) {
        return {
          filesystem: parts[0],
          size: parts[1],
          used: parts[2],
          available: parts[3],
          usePercent: parts[4],
          mountPoint: parts[5]
        };
      }
      return null;
    }).filter(Boolean);

    res.json({
      success: true,
      disks
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/movies/recent
 * Get recently added movies from a server
 */
router.get('/:id/movies/recent', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const movies = await plexService.getRecentlyAddedMovies(server.plexUrl, server.plexToken, limit);

    res.json({
      success: true,
      movies: movies
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/episodes/recent
 * Get recently added TV episodes from a server
 */
router.get('/:id/episodes/recent', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const limit = parseInt(req.query.limit) || 50;
    const episodes = await plexService.getRecentlyAddedEpisodes(server.plexUrl, server.plexToken, limit);

    res.json({
      success: true,
      episodes: episodes
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/seasons/recent
 * Get recently added TV seasons from a server (grouped episodes)
 */
router.get('/:id/seasons/recent', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const limit = parseInt(req.query.limit) || 20;
    const seasons = await plexService.getRecentlyAddedSeasons(server.plexUrl, server.plexToken, limit);

    res.json({
      success: true,
      seasons: seasons
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/files/exists
 * Check if a file exists on a server
 */
router.get('/:id/files/exists', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const filePath = req.query.path;
    if (!filePath) {
      return res.status(400).json({
        success: false,
        error: 'File path required'
      });
    }

    // Check if file exists using SSH
    const result = await sshManager.executeCommand(server, `test -f "${filePath}" && echo "exists" || echo "not found"`);

    const exists = result.stdout.trim() === 'exists';

    res.json({
      success: true,
      exists,
      path: filePath
    });

  } catch (error) {
    console.error('Error checking file existence:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/search
 * Search for content in Plex libraries
 */
router.get('/:id/search', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const query = req.query.q;
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }

    console.log(`Searching for "${query}" on server ${server.id}`);

    // Search across all libraries - results already include complete metadata
    const searchResults = await plexService.searchContent(server.plexUrl, server.plexToken, query.trim());

    console.log(`Found ${searchResults.length} search results for "${query}"`);

    res.json({
      success: true,
      query: query,
      results: searchResults
    });

  } catch (error) {
    console.error('Error searching content:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/servers/:id/image
 * Proxy Plex images to avoid CORS issues
 */
router.get('/:id/image', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const server = config.servers.find(s => s.id === req.params.id);

    if (!server) {
      return res.status(404).json({
        success: false,
        error: 'Server not found'
      });
    }

    const imagePath = req.query.path;
    if (!imagePath) {
      return res.status(400).json({
        success: false,
        error: 'Image path required'
      });
    }

    // Fetch image from Plex server
    const headers = {
      'Accept': 'image/*',
      'X-Plex-Token': server.plexToken
    };

    const imageUrl = `${server.plexUrl}${imagePath}`;
    const response = await fetch(imageUrl, { headers });

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: 'Failed to fetch image from Plex'
      });
    }

    // Get the image buffer
    const imageBuffer = await response.arrayBuffer();

    // Set appropriate headers
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour

    // Send the image
    res.send(Buffer.from(imageBuffer));

  } catch (error) {
    console.error('Error proxying Plex image:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to proxy image'
    });
  }
});

export default router;
