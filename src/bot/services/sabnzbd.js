import fetch from 'node-fetch';

/**
 * Service for interacting with the SABnzbd API
 */
class SABnzbdService {
  constructor() {
    this.baseUrl = process.env.DOWNLOAD_CLIENT_URL;
    this.apiKey = process.env.DOWNLOAD_CLIENT_API_KEY;
    
    if (!this.baseUrl || !this.apiKey) {
      console.warn('SABnzbd URL or API key not configured. Download statistics will be limited.');
    }
  }

  /**
   * Make a request to the SABnzbd API
   * @param {string} endpoint - API endpoint path
   * @param {Object} params - Request parameters
   * @returns {Promise<any>} API response
   */
  async makeRequest(endpoint, params = {}) {
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('SABnzbd not configured');
    }
    
    try {
      const url = new URL(`${this.baseUrl}/api`);
      
      // Add common parameters
      url.searchParams.append('output', 'json');
      url.searchParams.append('apikey', this.apiKey);
      url.searchParams.append('mode', endpoint);
      
      // Add custom parameters
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
      }
      
      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`SABnzbd API error: ${response.status} ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      console.error('Error making SABnzbd request:', error);
      throw error;
    }
  }

  /**
   * Get SABnzbd queue
   * @returns {Promise<Object>} Queue information
   */
  async getQueue() {
    return this.makeRequest('queue');
  }

  /**
   * Get SABnzbd history
   * @param {number} limit - Maximum number of history entries to retrieve
   * @returns {Promise<Object>} History information
   */
  async getHistory(limit = 30) {
    return this.makeRequest('history', { limit });
  }

  /**
   * Get SABnzbd status information
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    return this.makeRequest('qstatus');
  }

  /**
   * Format queue data for display in Discord
   * @param {Object} queueData - Queue data from SABnzbd
   * @returns {Array<Object>} Formatted queue data
   */
  formatQueueData(queueData) {
    if (!queueData || !queueData.queue || !queueData.queue.slots) {
      return [];
    }
    
    return queueData.queue.slots.map(job => {
      // Calculate progress
      const progress = Math.round(parseFloat(job.percentage) || 0);
      
      // Get state emoji
      let stateEmoji = '⚪';
      if (progress < 100 && job.status.toLowerCase() === 'downloading') stateEmoji = '⬇️';
      else if (progress === 100) stateEmoji = '✅';
      else if (job.status.toLowerCase() === 'paused') stateEmoji = '⏸️';
      else if (job.status.toLowerCase() === 'queued') stateEmoji = '⏳';
      else if (job.status.toLowerCase().includes('check')) stateEmoji = '🔍';
      else if (job.status.toLowerCase().includes('fail') || job.status.toLowerCase().includes('error')) stateEmoji = '❌';
      
      // Convert sizes
      const totalSize = this.formatBytes(parseInt(job.mb) * 1024 * 1024);
      
      return {
        name: job.filename,
        id: job.nzo_id,
        category: job.cat || 'None',
        state: job.status,
        stateEmoji,
        progress,
        progressBar: this.createProgressBar(progress / 100),
        totalSize,
        timeLeft: job.timeleft || 'unknown',
        downloadSpeed: job.speed ? `${job.speed}/s` : 'N/A',
        priority: job.priority,
        addedOn: job.added || 'unknown'
      };
    });
  }

  /**
   * Format history data for display in Discord
   * @param {Object} historyData - History data from SABnzbd
   * @returns {Array<Object>} Formatted history data
   */
  formatHistoryData(historyData) {
    if (!historyData || !historyData.history || !historyData.history.slots) {
      return [];
    }
    
    return historyData.history.slots.map(job => {
      // Get state emoji
      let stateEmoji = '✅';
      if (job.status.toLowerCase().includes('fail') || job.status.toLowerCase().includes('error')) {
        stateEmoji = '❌';
      }
      
      // Convert sizes
      const totalSize = this.formatBytes(parseInt(job.size) * 1024 * 1024);
      
      return {
        name: job.name,
        id: job.nzo_id,
        category: job.category || 'None',
        state: job.status,
        stateEmoji,
        totalSize,
        completedOn: job.completed || 'unknown',
        downloadTime: job.download_time || 'unknown'
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
const sabnzbdService = new SABnzbdService();
export default sabnzbdService;
