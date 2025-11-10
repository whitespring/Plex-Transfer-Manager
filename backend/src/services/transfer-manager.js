import sshManager from './ssh-manager.js';
import { v4 as uuidv4 } from 'uuid';

class TransferManager {
  constructor() {
    this.transfers = new Map();
    this.queue = [];
    this.activeTransfers = new Set();
    this.maxConcurrent = 3;
    this.io = null; // Socket.io instance
  }

  /**
   * Set Socket.IO instance for real-time updates
   * @param {Object} socketIO - Socket.IO server instance
   */
  setSocketIO(socketIO) {
    this.io = socketIO;
  }

  /**
   * Set maximum concurrent transfers
   * @param {number} max - Maximum concurrent transfers
   */
  setMaxConcurrent(max) {
    this.maxConcurrent = max;
  }

  /**
   * Create a new file transfer
   * @param {Object} sourceServer - Source server configuration
   * @param {Object} destServer - Destination server configuration
   * @param {Array} files - Array of file paths to transfer
   * @returns {Promise<Array>} Array of transfer IDs
   */
  async createTransfers(sourceServer, destServer, files) {
    const transferIds = [];

    for (const file of files) {
      const transferId = uuidv4();
      
      const destPath = this.buildDestPath(file.path, sourceServer.mediaPaths, destServer.mediaPaths);

      const transfer = {
        id: transferId,
        sourceServerId: sourceServer.id,
        destServerId: destServer.id,
        sourcePath: file.path,
        destPath: destPath,
        filename: file.name,
        size: file.size,
        status: 'queued', // queued, active, completed, failed, cancelled, skipped
        progress: {
          percentage: 0,
          transferred: 0,
          speed: null,
          eta: null
        },
        error: null,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null
      };

      this.transfers.set(transferId, transfer);
      this.queue.push(transferId);
      transferIds.push(transferId);

      // Emit transfer created event
      this.emitTransferUpdate(transfer);
    }

    // Process queue
    this.processQueue(sourceServer, destServer);

    return transferIds;
  }

  /**
   * Build destination path based on media paths
   * Handles separate paths for movies and TV shows
   * @param {string} sourcePath - Source file path
   * @param {Object} sourceMediaPaths - Source server media paths object
   * @param {Object} destMediaPaths - Destination server media paths object
   * @returns {string} Destination path
   */
  buildDestPath(sourcePath, sourceMediaPaths, destMediaPaths) {
    // Determine media type and get relative path
    let relativePath;
    let mediaType;

    // Check if path is in movies directory
    if (sourceMediaPaths.movies && sourcePath.startsWith(sourceMediaPaths.movies)) {
      relativePath = sourcePath.replace(sourceMediaPaths.movies, '').replace(/^\/+/, '');
      mediaType = 'movies';
    }
    // Check if path is in TV directory
    else if (sourceMediaPaths.tv && sourcePath.startsWith(sourceMediaPaths.tv)) {
      relativePath = sourcePath.replace(sourceMediaPaths.tv, '').replace(/^\/+/, '');
      mediaType = 'tv';
    }
    // Fallback to root path
    else if (sourceMediaPaths.root && sourcePath.startsWith(sourceMediaPaths.root)) {
      relativePath = sourcePath.replace(sourceMediaPaths.root, '').replace(/^\/+/, '');
      mediaType = 'root';
    }
    // If no match, just use the filename
    else {
      const parts = sourcePath.split('/');
      relativePath = parts[parts.length - 1];
      mediaType = 'root';
    }

    // Build destination path based on media type
    let destBasePath;
    if (mediaType === 'movies' && destMediaPaths.movies) {
      destBasePath = destMediaPaths.movies;
    } else if (mediaType === 'tv' && destMediaPaths.tv) {
      destBasePath = destMediaPaths.tv;
    } else {
      destBasePath = destMediaPaths.root || destMediaPaths.movies || destMediaPaths.tv;
    }

    return `${destBasePath}/${relativePath}`.replace(/\/+/g, '/');
  }

  /**
   * Process the transfer queue
   * @param {Object} sourceServer - Source server configuration
   * @param {Object} destServer - Destination server configuration
   */
  async processQueue(sourceServer, destServer) {
    // Start transfers up to max concurrent limit
    while (this.queue.length > 0 && this.activeTransfers.size < this.maxConcurrent) {
      const transferId = this.queue.shift();
      const transfer = this.transfers.get(transferId);

      if (!transfer || transfer.status !== 'queued') {
        continue;
      }

      this.activeTransfers.add(transferId);
      this.startTransfer(transferId, sourceServer, destServer);
    }
  }

  /**
   * Start a single file transfer
   * @param {string} transferId - Transfer ID
   * @param {Object} sourceServer - Source server configuration
   * @param {Object} destServer - Destination server configuration
   */
  async startTransfer(transferId, sourceServer, destServer) {
    const transfer = this.transfers.get(transferId);

    if (!transfer) {
      return;
    }

    transfer.status = 'active';
    transfer.startedAt = Date.now();
    this.emitTransferUpdate(transfer);

    try {
      console.log(`[Transfer] Starting transfer ${transferId}: ${transfer.filename}`);

      // Progress callback for rsync
      const progressCallback = (progress) => {
        transfer.progress = {
          percentage: progress.percentage,
          transferred: progress.transferred,
          speed: progress.speed,
          eta: progress.eta
        };
        this.emitTransferProgress(transfer);
      };

      // Start rsync transfer
      await sshManager.startRsyncTransfer(
        sourceServer,
        destServer,
        transfer.sourcePath,
        transfer.destPath,
        progressCallback
      );

      // Transfer completed successfully
      transfer.status = 'completed';
      transfer.completedAt = Date.now();
      transfer.progress.percentage = 100;

      console.log(`[Transfer] Completed transfer ${transferId}: ${transfer.filename}`);
      this.emitTransferComplete(transfer);

    } catch (error) {
      // Transfer failed
      transfer.status = 'failed';
      transfer.error = error.message;
      transfer.completedAt = Date.now();

      console.error(`[Transfer] Failed transfer ${transferId}:`, error.message);
      this.emitTransferError(transfer);

    } finally {
      // Remove from active transfers
      this.activeTransfers.delete(transferId);

      // Process next in queue
      this.processQueue(sourceServer, destServer);
    }
  }

  /**
   * Cancel a transfer
   * @param {string} transferId - Transfer ID
   * @param {Object} sourceServer - Source server configuration
   * @returns {Promise<boolean>} Success status
   */
  async cancelTransfer(transferId, sourceServer) {
    const transfer = this.transfers.get(transferId);
    
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (transfer.status === 'queued') {
      // Remove from queue
      const index = this.queue.indexOf(transferId);
      if (index > -1) {
        this.queue.splice(index, 1);
      }
      transfer.status = 'cancelled';
      transfer.completedAt = Date.now();
      this.emitTransferUpdate(transfer);
      return true;
    }

    if (transfer.status === 'active') {
      // Try to kill the rsync process
      // This is a simplified approach - in production, you'd track process IDs
      transfer.status = 'cancelled';
      transfer.completedAt = Date.now();
      this.activeTransfers.delete(transferId);
      this.emitTransferUpdate(transfer);
      return true;
    }

    return false;
  }

  /**
   * Get transfer by ID
   * @param {string} transferId - Transfer ID
   * @returns {Object} Transfer object
   */
  getTransfer(transferId) {
    return this.transfers.get(transferId);
  }

  /**
   * Get all transfers
   * @param {Object} filters - Optional filters
   * @returns {Array} Array of transfer objects
   */
  getAllTransfers(filters = {}) {
    let transfers = Array.from(this.transfers.values());

    // Apply filters
    if (filters.status) {
      transfers = transfers.filter(t => t.status === filters.status);
    }
    if (filters.sourceServerId) {
      transfers = transfers.filter(t => t.sourceServerId === filters.sourceServerId);
    }
    if (filters.destServerId) {
      transfers = transfers.filter(t => t.destServerId === filters.destServerId);
    }

    // Sort by creation date (newest first)
    transfers.sort((a, b) => b.createdAt - a.createdAt);

    return transfers;
  }

  /**
   * Get transfer statistics
   * @returns {Object} Statistics object
   */
  getStatistics() {
    const transfers = Array.from(this.transfers.values());

    return {
      total: transfers.length,
      queued: transfers.filter(t => t.status === 'queued').length,
      active: transfers.filter(t => t.status === 'active').length,
      completed: transfers.filter(t => t.status === 'completed').length,
      failed: transfers.filter(t => t.status === 'failed').length,
      cancelled: transfers.filter(t => t.status === 'cancelled').length,
      skipped: transfers.filter(t => t.status === 'skipped').length
    };
  }

  /**
   * Clear completed transfers older than specified time
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
   */
  clearOldTransfers(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const toDelete = [];

    for (const [id, transfer] of this.transfers.entries()) {
      if (
        (transfer.status === 'completed' || transfer.status === 'failed' || transfer.status === 'cancelled' || transfer.status === 'skipped') &&
        transfer.completedAt &&
        now - transfer.completedAt > maxAge
      ) {
        toDelete.push(id);
      }
    }

    toDelete.forEach(id => this.transfers.delete(id));

    if (toDelete.length > 0) {
      console.log(`[Transfer] Cleared ${toDelete.length} old transfers`);
    }
  }

  /**
   * Emit transfer update event via Socket.IO
   * @param {Object} transfer - Transfer object
   */
  emitTransferUpdate(transfer) {
    if (this.io) {
      this.io.emit('transfer:update', transfer);
    }
  }

  /**
   * Emit transfer progress event via Socket.IO
   * @param {Object} transfer - Transfer object
   */
  emitTransferProgress(transfer) {
    if (this.io) {
      this.io.emit('transfer:progress', {
        id: transfer.id,
        filename: transfer.filename,
        progress: transfer.progress
      });
    }
  }

  /**
   * Emit transfer complete event via Socket.IO
   * @param {Object} transfer - Transfer object
   */
  emitTransferComplete(transfer) {
    if (this.io) {
      this.io.emit('transfer:complete', {
        id: transfer.id,
        filename: transfer.filename,
        duration: transfer.completedAt - transfer.startedAt
      });
    }
  }

  /**
   * Emit transfer error event via Socket.IO
   * @param {Object} transfer - Transfer object
   */
  emitTransferError(transfer) {
    if (this.io) {
      this.io.emit('transfer:error', {
        id: transfer.id,
        filename: transfer.filename,
        error: transfer.error
      });
    }
  }
}

// Export singleton instance
export default new TransferManager();
