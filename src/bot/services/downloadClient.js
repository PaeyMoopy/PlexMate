import qBittorrentService from './qbittorrent.js';
import sabnzbdService from './sabnzbd.js';

/**
 * Factory for getting the appropriate download client service
 * based on the configuration in .env
 */
class DownloadClientFactory {
  constructor() {
    this.client = this.initializeClient();
  }

  /**
   * Initialize the appropriate download client based on configuration
   * @returns {Object} Download client service instance
   */
  initializeClient() {
    const clientType = process.env.DOWNLOAD_CLIENT?.toLowerCase() || '';
    
    console.log(`Initializing download client: ${clientType || 'none'}`);
    
    switch (clientType) {
      case 'qbittorrent':
        return qBittorrentService;
      case 'sabnzbd':
        return sabnzbdService;
      default:
        console.warn(`Unknown or missing download client type: ${clientType}. Using none.`);
        return {
          // Return a dummy client that provides error messages
          getDownloads: async () => {
            return { error: 'No download client configured' };
          },
          formatDownloadData: () => {
            return [];
          },
          formatBytes: (bytes) => {
            if (bytes === 0) return '0 Bytes';
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
          }
        };
    }
  }

  /**
   * Get the active download client instance
   * @returns {Object} Download client service
   */
  getClient() {
    return this.client;
  }

  /**
   * Get the type of the active download client
   * @returns {string} Download client type (qbittorrent, sabnzbd, or none)
   */
  getClientType() {
    return process.env.DOWNLOAD_CLIENT?.toLowerCase() || 'none';
  }

  /**
   * Get current downloads from the active client
   * @returns {Promise<Array>} List of downloads
   */
  async getDownloads() {
    try {
      const clientType = this.getClientType();
      
      if (clientType === 'qbittorrent') {
        const torrents = await this.client.getTorrents('downloading');
        return this.client.formatTorrentData(torrents);
      } else if (clientType === 'sabnzbd') {
        const queue = await this.client.getQueue();
        return this.client.formatQueueData(queue);
      } else {
        return [];
      }
    } catch (error) {
      console.error('Error getting downloads:', error);
      return [];
    }
  }

  /**
   * Get recent download history from the active client
   * @param {number} limit - Maximum number of history entries
   * @returns {Promise<Array>} Download history
   */
  async getHistory(limit = 10) {
    try {
      const clientType = this.getClientType();
      
      if (clientType === 'qbittorrent') {
        const torrents = await this.client.getTorrents('completed');
        return this.client.formatTorrentData(torrents).slice(0, limit);
      } else if (clientType === 'sabnzbd') {
        const history = await this.client.getHistory(limit);
        return this.client.formatHistoryData(history);
      } else {
        return [];
      }
    } catch (error) {
      console.error('Error getting download history:', error);
      return [];
    }
  }
}

// Export a singleton instance
const downloadClientFactory = new DownloadClientFactory();
export default downloadClientFactory;
