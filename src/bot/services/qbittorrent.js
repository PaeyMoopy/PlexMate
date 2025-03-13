import fetch from 'node-fetch';

/**
 * Service for interacting with the qBittorrent WebUI API
 */
class QBittorrentService {
  constructor() {
    // Try to use the generic download client variables first, then fall back to legacy variables
    this.baseUrl = process.env.DOWNLOAD_CLIENT_URL || process.env.QBITTORRENT_URL;
    this.username = process.env.DOWNLOAD_CLIENT_USERNAME || process.env.QBITTORRENT_USERNAME;
    this.password = process.env.DOWNLOAD_CLIENT_PASSWORD || process.env.QBITTORRENT_PASSWORD;
    this.cookies = null;
    this.isLoggedIn = false;
    
    if (!this.baseUrl) {
      console.warn('qBittorrent URL not configured. Download statistics will be limited.');
    }
  }

  /**
   * Update credentials from environment variables
   * This ensures we always have the latest credentials
   */
  updateCredentials() {
    this.baseUrl = process.env.DOWNLOAD_CLIENT_URL || process.env.QBITTORRENT_URL;
    this.username = process.env.DOWNLOAD_CLIENT_USERNAME || process.env.QBITTORRENT_USERNAME;
    this.password = process.env.DOWNLOAD_CLIENT_PASSWORD || process.env.QBITTORRENT_PASSWORD;
    
    // If URL has trailing slash, remove it
    if (this.baseUrl && this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
    
    // If credentials changed, reset login state
    if (this.isLoggedIn) {
      this.isLoggedIn = false;
      this.cookies = null;
    }
  }

  /**
   * Log in to qBittorrent WebUI
   * @returns {Promise<boolean>} Login success
   */
  async login() {
    // Always get latest credentials
    this.updateCredentials();
    
    if (!this.baseUrl || !this.username || !this.password) {
      console.warn('qBittorrent credentials not fully configured.');
      return false;
    }
    
    try {
      const url = new URL(`${this.baseUrl}/api/v2/auth/login`);
      const body = new URLSearchParams();
      body.append('username', this.username);
      body.append('password', this.password);
      
      console.log(`Logging in to qBittorrent at ${this.baseUrl}`);
      
      const response = await fetch(url.toString(), {
        method: 'POST',
        body,
        redirect: 'manual'
      });
      
      if (!response.ok) {
        console.error(`qBittorrent login failed: ${response.status} ${response.statusText}`);
        this.isLoggedIn = false;
        return false;
      }
      
      // Save cookies for future requests
      const cookies = response.headers.get('set-cookie');
      if (cookies) {
        this.cookies = cookies;
        this.isLoggedIn = true;
        return true;
      } else {
        console.error('No cookies received from qBittorrent login');
        this.isLoggedIn = false;
        return false;
      }
    } catch (error) {
      console.error('Error logging in to qBittorrent:', error);
      this.isLoggedIn = false;
      return false;
    }
  }

  /**
   * Make an authenticated request to the qBittorrent API
   * @param {string} endpoint - API endpoint path
   * @param {Object} options - Request options
   * @returns {Promise<any>} API response
   */
  async makeRequest(endpoint, options = {}) {
    // Always get latest credentials
    this.updateCredentials();
    
    if (!this.baseUrl) {
      throw new Error('qBittorrent not configured');
    }
    
    // Login if not already logged in
    if (!this.isLoggedIn) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('Failed to log in to qBittorrent');
      }
    }
    
    try {
      const url = new URL(`${this.baseUrl}/api/v2/${endpoint}`);
      
      const fetchOptions = {
        ...options,
        headers: {
          ...options.headers,
          'Cookie': this.cookies
        }
      };
      
      console.log(`Making request to qBittorrent at ${url.toString()}`);
      
      const response = await fetch(url.toString(), fetchOptions);
      
      // Handle 403 by trying to login again
      if (response.status === 403) {
        console.log('qBittorrent session expired, logging in again...');
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('Failed to re-login to qBittorrent');
        }
        
        // Retry the request with new cookies
        fetchOptions.headers.Cookie = this.cookies;
        const retryResponse = await fetch(url.toString(), fetchOptions);
        
        if (!retryResponse.ok) {
          throw new Error(`qBittorrent API error after re-login: ${retryResponse.status} ${retryResponse.statusText}`);
        }
        
        const contentType = retryResponse.headers.get('content-type');
        return contentType && contentType.includes('application/json')
          ? retryResponse.json()
          : retryResponse.text();
      }
      
      if (!response.ok) {
        throw new Error(`qBittorrent API error: ${response.status} ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      return contentType && contentType.includes('application/json')
        ? response.json()
        : response.text();
    } catch (error) {
      console.error('Error making qBittorrent request:', error);
      throw error;
    }
  }

  /**
   * Get qBittorrent application version
   * @returns {Promise<string>} App version
   */
  async getAppVersion() {
    return this.makeRequest('app/version');
  }

  /**
   * Get qBittorrent application preferences
   * @returns {Promise<Object>} App preferences
   */
  async getAppPreferences() {
    return this.makeRequest('app/preferences');
  }

  /**
   * Get torrent list with download progress
   * @param {string} filter - Optional filter (all, downloading, seeding, completed, etc.)
   * @returns {Promise<Array>} List of torrents
   */
  async getTorrents(filter = 'all') {
    return this.makeRequest(`torrents/info?filter=${filter}`);
  }

  /**
   * Get torrent properties
   * @param {string} hash - Torrent hash
   * @returns {Promise<Object>} Torrent properties
   */
  async getTorrentProperties(hash) {
    return this.makeRequest(`torrents/properties?hash=${hash}`);
  }

  /**
   * Format torrent data for display in Discord
   * @param {Array} torrents - Torrent data from qBittorrent
   * @returns {Array<Object>} Formatted torrent data
   */
  formatTorrentData(torrents) {
    if (!torrents || !Array.isArray(torrents)) {
      return [];
    }
    
    return torrents.map(torrent => {
      // Get state emoji
      let stateEmoji = '⚪';
      if (torrent.state === 'downloading') stateEmoji = '⬇️';
      else if (torrent.state === 'uploading' || torrent.state === 'seeding') stateEmoji = '⬆️';
      else if (torrent.state === 'pausedDL' || torrent.state === 'pausedUP') stateEmoji = '⏸️';
      else if (torrent.state === 'queuedDL' || torrent.state === 'queuedUP') stateEmoji = '⏳';
      else if (torrent.state === 'checkingDL' || torrent.state === 'checkingUP') stateEmoji = '🔍';
      else if (torrent.state === 'stalledDL' || torrent.state === 'stalledUP') stateEmoji = '⚠️';
      else if (torrent.state === 'error') stateEmoji = '❌';
      else if (torrent.state === 'missingFiles') stateEmoji = '❓';
      else if (torrent.state.includes('complete')) stateEmoji = '✅';
      
      // Format size
      const totalSize = this.formatBytes(torrent.size);
      
      // Format progress
      const progress = Math.round(torrent.progress * 100);
      
      // Format speeds
      const dlSpeed = this.formatBytes(torrent.dlspeed) + '/s';
      const upSpeed = this.formatBytes(torrent.upspeed) + '/s';
      
      // Format ETA
      const eta = torrent.eta === 8640000 ? 'Unknown' : this.formatEta(torrent.eta);
      
      // Format ratio
      const ratio = torrent.ratio.toFixed(2);
      
      return {
        name: torrent.name,
        hash: torrent.hash,
        state: torrent.state,
        stateEmoji,
        progress,
        progressBar: this.createProgressBar(torrent.progress),
        totalSize,
        downloadSpeed: dlSpeed,
        uploadSpeed: upSpeed,
        eta,
        ratio,
        category: torrent.category || 'None',
        addedOn: new Date(torrent.added_on * 1000).toLocaleString(),
        completedOn: torrent.completion_on ? new Date(torrent.completion_on * 1000).toLocaleString() : 'N/A'
      };
    });
  }

  /**
   * Format bytes to human-readable size
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * Format seconds to human-readable time
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time
   */
  formatEta(seconds) {
    if (seconds < 0) return 'Unknown';
    
    const days = Math.floor(seconds / (24 * 60 * 60));
    seconds -= days * 24 * 60 * 60;
    
    const hours = Math.floor(seconds / (60 * 60));
    seconds -= hours * 60 * 60;
    
    const minutes = Math.floor(seconds / 60);
    seconds -= minutes * 60;
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  /**
   * Create a text-based progress bar
   * @param {number} progress - Progress from 0 to 1
   * @returns {string} Text progress bar
   */
  createProgressBar(progress) {
    const length = 10;
    const filled = Math.round(progress * length);
    const empty = length - filled;
    
    return '▓'.repeat(filled) + '░'.repeat(empty);
  }
}

// Export a singleton instance
const qBittorrentService = new QBittorrentService();
export default qBittorrentService;
