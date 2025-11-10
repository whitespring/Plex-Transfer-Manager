// API service for communicating with the backend
// Use relative URLs to work with reverse proxies
const API_BASE_URL = '/api';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  // Server management
  async getServers() {
    return this.request('/servers');
  }

  async getUIConfig() {
    return this.request('/config/ui');
  }

  async getFrontendConfig() {
    return this.request('/config/frontend');
  }

  async getServer(serverId) {
    return this.request(`/servers/${serverId}`);
  }

  async getServerInfo(serverId) {
    return this.request(`/servers/${serverId}/info`);
  }

  async getServerDisk(serverId) {
    return this.request(`/servers/${serverId}/disk`);
  }

  async getRecentMovies(serverId, limit = 50) {
    const response = await this.request(`/servers/${serverId}/movies/recent?limit=${limit}`);
    return response.movies || [];
  }

  async getRecentEpisodes(serverId, limit = 50) {
    const response = await this.request(`/servers/${serverId}/episodes/recent?limit=${limit}`);
    return response.episodes || [];
  }

  async getRecentSeasons(serverId, limit = 20) {
    const response = await this.request(`/servers/${serverId}/seasons/recent?limit=${limit}`);
    return response.seasons || [];
  }

  async searchContent(serverId, query) {
    const response = await this.request(`/servers/${serverId}/search?q=${encodeURIComponent(query)}`);
    return response.results || [];
  }

  getMoviePosterUrl(serverId, imagePath) {
    if (imagePath) {
      return `${this.baseURL}/servers/${serverId}/image?path=${encodeURIComponent(imagePath)}`;
    }
    return null;
  }

  async checkFileExists(serverId, filePath) {
    return this.request(`/servers/${serverId}/files/exists?path=${encodeURIComponent(filePath)}`);
  }

  // File operations
  async getFiles(serverId, path = '') {
    const queryParams = path ? `?path=${encodeURIComponent(path)}` : '';
    return this.request(`/files/${serverId}${queryParams}`);
  }

  async getFileInfo(serverId, path) {
    return this.request(`/files/${serverId}/info?path=${encodeURIComponent(path)}`);
  }

  // Transfer operations
  async createTransfer(transferData) {
    return this.request('/transfers', {
      method: 'POST',
      body: JSON.stringify(transferData),
    });
  }

  async getTransfers() {
    return this.request('/transfers');
  }

  async getTransfer(transferId) {
    return this.request(`/transfers/${transferId}`);
  }

  async cancelTransfer(transferId) {
    return this.request(`/transfers/${transferId}`, {
      method: 'DELETE',
    });
  }

  // Settings management
  async getSettings() {
    return this.request('/settings');
  }

  async updateSettings(settings) {
    return this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  async generateNginx() {
    return this.request('/settings/generate-nginx', {
      method: 'POST',
    });
  }

  async reloadConfig() {
    return this.request('/settings/reload', {
      method: 'POST',
    });
  }

  // Health check
  async getHealth() {
    return this.request('/health');
  }
}

// Export singleton instance
export default new ApiService();
