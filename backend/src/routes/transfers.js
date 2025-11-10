import express from 'express';
import transferManager from '../services/transfer-manager.js';

const router = express.Router();

/**
 * POST /api/transfers
 * Create a new file transfer
 * Body:
 *   - sourceServerId: Source server ID
 *   - destServerId: Destination server ID
 *   - files: Array of file objects to transfer
 */
router.post('/', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const { sourceServerId, destServerId, files } = req.body;

    // Validate request
    if (!sourceServerId || !destServerId || !files || !Array.isArray(files)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sourceServerId, destServerId, files'
      });
    }

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No files specified for transfer'
      });
    }

    // Find servers
    const sourceServer = config.servers.find(s => s.id === sourceServerId);
    const destServer = config.servers.find(s => s.id === destServerId);

    if (!sourceServer) {
      return res.status(404).json({
        success: false,
        error: `Source server not found: ${sourceServerId}`
      });
    }

    if (!destServer) {
      return res.status(404).json({
        success: false,
        error: `Destination server not found: ${destServerId}`
      });
    }

    if (sourceServerId === destServerId) {
      return res.status(400).json({
        success: false,
        error: 'Source and destination servers must be different'
      });
    }

    // Create transfers
    const transferIds = await transferManager.createTransfers(
      sourceServer,
      destServer,
      files
    );

    res.json({
      success: true,
      message: `Created ${transferIds.length} transfer(s)`,
      transferIds
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/transfers
 * Get all transfers with optional filters
 * Query params:
 *   - status: Filter by status (queued, active, completed, failed, cancelled)
 *   - sourceServerId: Filter by source server
 *   - destServerId: Filter by destination server
 */
router.get('/', (req, res) => {
  try {
    const filters = {};
    
    if (req.query.status) {
      filters.status = req.query.status;
    }
    if (req.query.sourceServerId) {
      filters.sourceServerId = req.query.sourceServerId;
    }
    if (req.query.destServerId) {
      filters.destServerId = req.query.destServerId;
    }

    const transfers = transferManager.getAllTransfers(filters);

    res.json({
      success: true,
      transfers,
      count: transfers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/transfers/stats
 * Get transfer statistics
 */
router.get('/stats', (req, res) => {
  try {
    const stats = transferManager.getStatistics();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/transfers/:id
 * Get details of a specific transfer
 */
router.get('/:id', (req, res) => {
  try {
    const transfer = transferManager.getTransfer(req.params.id);

    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    res.json({
      success: true,
      transfer
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/transfers/:id
 * Cancel a transfer
 */
router.delete('/:id', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const transfer = transferManager.getTransfer(req.params.id);

    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    // Find source server for cancellation
    const sourceServer = config.servers.find(s => s.id === transfer.sourceServerId);
    
    if (!sourceServer) {
      return res.status(404).json({
        success: false,
        error: 'Source server not found'
      });
    }

    const cancelled = await transferManager.cancelTransfer(req.params.id, sourceServer);

    if (cancelled) {
      res.json({
        success: true,
        message: 'Transfer cancelled'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Transfer cannot be cancelled in current state'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;
