import { Client } from 'ssh2';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

class SSHManager {
  constructor() {
    this.connections = new Map();
    this.config = null;
  }

  /**
   * Set the configuration object
   * @param {Object} config - Configuration object
   */
  setConfig(config) {
    this.config = config;
  }

  /**
   * Create an SSH connection to a server
   * @param {Object} serverConfig - Server configuration
   * @returns {Promise<Client>} SSH client
   */
  async connect(serverConfig) {
    const connectionKey = `${serverConfig.ssh.host}:${serverConfig.ssh.port}`;
    
    // Return existing connection if available
    if (this.connections.has(connectionKey)) {
      const existingConn = this.connections.get(connectionKey);
      if (existingConn && !existingConn.destroyed) {
        return existingConn;
      }
      // Connection was destroyed, remove it
      this.connections.delete(connectionKey);
    }

    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      console.log(`[SSH] Attempting connection to ${serverConfig.ssh.host}:${serverConfig.ssh.port} as ${serverConfig.ssh.username}`);

      const sshConfig = {
        host: serverConfig.ssh.host,
        port: serverConfig.ssh.port || 22,
        username: serverConfig.ssh.username,
        privateKey: fs.readFileSync(this.config.ssh.keyPath),
        readyTimeout: this.config.ssh.readyTimeout,
        keepaliveInterval: this.config.ssh.keepaliveInterval,
        debug: (msg) => console.log(`[SSH DEBUG] ${msg}`)
      };

      conn.on('ready', () => {
        console.log(`[SSH] Connected to ${connectionKey}`);
        this.connections.set(connectionKey, conn);
        resolve(conn);
      });

      conn.on('error', (err) => {
        console.error(`[SSH] Connection error to ${connectionKey}:`, err.message);
        this.connections.delete(connectionKey);
        reject(err);
      });

      conn.on('close', () => {
        console.log(`[SSH] Connection closed to ${connectionKey}`);
        this.connections.delete(connectionKey);
      });

      conn.connect(sshConfig);
    });
  }

  /**
   * Execute a command on a remote server
   * @param {Object} serverConfig - Server configuration
   * @param {string} command - Command to execute
   * @returns {Promise<Object>} { stdout, stderr, exitCode }
   */
  async executeCommand(serverConfig, command) {
    const conn = await this.connect(serverConfig);

    return new Promise((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) {
          return reject(err);
        }

        let stdout = '';
        let stderr = '';

        stream.on('close', (exitCode) => {
          resolve({
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode
          });
        });

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  /**
   * List files in a directory on a remote server
   * @param {Object} serverConfig - Server configuration
   * @param {string} path - Directory path
   * @returns {Promise<Array>} Array of file objects
   */
  async listFiles(serverConfig, path) {
    // Escape path for shell
    const escapedPath = path.replace(/'/g, "'\\''");
    
    // Use ls with specific format for parsing
    const command = `ls -lAh --time-style=+%s '${escapedPath}' 2>&1`;
    
    try {
      const result = await this.executeCommand(serverConfig, command);
      
      if (result.exitCode !== 0) {
        throw new Error(`Failed to list directory: ${result.stderr || result.stdout}`);
      }

      return this.parseListOutput(result.stdout, path);
    } catch (error) {
      throw new Error(`Error listing files: ${error.message}`);
    }
  }

  /**
   * Parse ls -lAh output into file objects
   * @param {string} output - ls command output
   * @param {string} basePath - Base directory path
   * @returns {Array} Array of file objects
   */
  parseListOutput(output, basePath) {
    const lines = output.trim().split('\n');
    const files = [];

    // Skip first line if it starts with "total"
    const startIndex = lines[0]?.startsWith('total') ? 1 : 0;

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;

      // Parse ls -lAh output
      // Format: drwxr-xr-x 2 user group 4.0K timestamp filename
      const match = line.match(/^([drwx-]+)\s+\d+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s+(.+)$/);
      
      if (match) {
        const [, permissions, owner, group, size, timestamp, name] = match;
        
        // Skip . and .. entries
        if (name === '.' || name === '..') continue;

        const isDirectory = permissions.startsWith('d');
        const fullPath = `${basePath}/${name}`.replace(/\/+/g, '/');

        files.push({
          name,
          path: fullPath,
          type: isDirectory ? 'directory' : 'file',
          size: isDirectory ? null : size,
          permissions,
          owner,
          group,
          modified: parseInt(timestamp) * 1000, // Convert to milliseconds
          isDirectory
        });
      }
    }

    return files.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      // Then alphabetically
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Check if a path exists on a remote server
   * @param {Object} serverConfig - Server configuration
   * @param {string} path - Path to check
   * @returns {Promise<boolean>}
   */
  async pathExists(serverConfig, path) {
    const escapedPath = path.replace(/'/g, "'\\''");
    const command = `test -e '${escapedPath}' && echo "exists" || echo "not found"`;
    
    try {
      const result = await this.executeCommand(serverConfig, command);
      return result.stdout.includes('exists');
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file information
   * @param {Object} serverConfig - Server configuration
   * @param {string} path - File path
   * @returns {Promise<Object>} File information
   */
  async getFileInfo(serverConfig, path) {
    const escapedPath = path.replace(/'/g, "'\\''");
    const command = `stat -c '%s %Y %a %U %G' '${escapedPath}' 2>&1`;
    
    try {
      const result = await this.executeCommand(serverConfig, command);
      
      if (result.exitCode !== 0) {
        throw new Error(`File not found or inaccessible: ${path}`);
      }

      const [size, mtime, mode, owner, group] = result.stdout.split(' ');
      
      return {
        path,
        size: parseInt(size),
        modified: parseInt(mtime) * 1000,
        permissions: mode,
        owner,
        group
      };
    } catch (error) {
      throw new Error(`Error getting file info: ${error.message}`);
    }
  }

  /**
   * Start an rsync transfer between two servers
   * @param {Object} sourceConfig - Source server configuration
   * @param {Object} destConfig - Destination server configuration
   * @param {string} sourcePath - Source file path
   * @param {string} destPath - Destination file path
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Promise<Object>} Transfer result
   */
  async startRsyncTransfer(sourceConfig, destConfig, sourcePath, destPath, progressCallback) {
    const conn = await this.connect(sourceConfig);
    
    const escapedSourcePath = sourcePath.replace(/'/g, "'\\''");
    const escapedDestPath = destPath.replace(/'/g, "'\\''");
    
    // Build rsync command
    // Using --info=progress2 for better progress reporting and --mkpath to create directories
    const rsyncCommand = `rsync -avz --info=progress2 --partial --mkpath '${escapedSourcePath}' ${destConfig.ssh.username}@${destConfig.ssh.host}:'${escapedDestPath}'`;

    return new Promise((resolve, reject) => {
      conn.exec(rsyncCommand, (err, stream) => {
        if (err) {
          return reject(err);
        }

        let stdout = '';
        let stderr = '';
        let lastProgress = null;

        stream.on('close', (exitCode) => {
          if (exitCode === 0) {
            resolve({
              success: true,
              stdout: stdout.trim(),
              stderr: stderr.trim()
            });
          } else {
            reject(new Error(`rsync failed with exit code ${exitCode}: ${stderr || stdout}`));
          }
        });

        stream.on('data', (data) => {
          const text = data.toString();
          stdout += text;

          // Parse rsync progress output
          // Format: 123,456,789  45%  1.23MB/s  0:00:12
          const progressMatch = text.match(/(\d+(?:,\d+)*)\s+(\d+)%\s+([\d.]+[KMG]?B\/s)\s+(\d+:\d+:\d+)/);
          
          if (progressMatch) {
            const [, transferred, percentage, speed, eta] = progressMatch;
            const progress = {
              transferred: parseInt(transferred.replace(/,/g, '')),
              percentage: parseInt(percentage),
              speed: speed,
              eta: eta
            };

            // Only call callback if progress changed significantly
            if (!lastProgress || lastProgress.percentage !== progress.percentage) {
              lastProgress = progress;
              if (progressCallback) {
                progressCallback(progress);
              }
            }
          }
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      });
    });
  }

  /**
   * Cancel an ongoing transfer
   * @param {Object} serverConfig - Server configuration
   * @param {number} pid - Process ID to kill
   */
  async cancelTransfer(serverConfig, pid) {
    try {
      await this.executeCommand(serverConfig, `kill -9 ${pid}`);
      console.log(`[SSH] Cancelled transfer process ${pid}`);
    } catch (error) {
      console.error(`[SSH] Error cancelling transfer:`, error.message);
      throw error;
    }
  }

  /**
   * Close a specific connection
   * @param {string} host - Host to disconnect from
   * @param {number} port - Port number
   */
  disconnect(host, port = 22) {
    const connectionKey = `${host}:${port}`;
    const conn = this.connections.get(connectionKey);
    
    if (conn) {
      conn.end();
      this.connections.delete(connectionKey);
      console.log(`[SSH] Disconnected from ${connectionKey}`);
    }
  }

  /**
   * Close all connections
   */
  disconnectAll() {
    for (const [key, conn] of this.connections.entries()) {
      conn.end();
      console.log(`[SSH] Disconnected from ${key}`);
    }
    this.connections.clear();
  }
}

// Export singleton instance
export default new SSHManager();
