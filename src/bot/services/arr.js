import fetch from 'node-fetch';

/**
 * Service for interacting with Sonarr and Radarr APIs
 */
class ArrService {
  constructor() {
    // Initialize Sonarr configuration
    this.sonarrUrl = process.env.SONARR_URL;
    this.sonarrApiKey = process.env.SONARR_API_KEY;
    this.sonarrApiVersion = 'v3'; // Default version
    
    // Initialize Radarr configuration
    this.radarrUrl = process.env.RADARR_URL;
    this.radarrApiKey = process.env.RADARR_API_KEY;
    this.radarrApiVersion = 'v3'; // Default version
    
    if (!this.sonarrUrl || !this.sonarrApiKey) {
      console.warn('Sonarr not configured or environment variables not loaded. Related statistics features will be limited.');
    } else {
      console.log('Sonarr configured with URL:', this.sonarrUrl);
    }
    
    if (!this.radarrUrl || !this.radarrApiKey) {
      console.warn('Radarr not configured or environment variables not loaded. Related statistics features will be limited.');
    } else {
      console.log('Radarr configured with URL:', this.radarrUrl);
    }
  }

  /**
   * Make a request to a Sonarr or Radarr API
   * @param {string} type - 'sonarr' or 'radarr'
   * @param {string} endpoint - API endpoint to call
   * @param {Object} options - Request options
   * @returns {Promise<Object>} API response
   */
  async makeRequest(type, endpoint, options = {}) {
    try {
      const baseUrl = type === 'sonarr' ? this.sonarrUrl : this.radarrUrl;
      const apiKey = type === 'sonarr' ? this.sonarrApiKey : this.radarrApiKey;
      const apiVersion = type === 'sonarr' ? this.sonarrApiVersion : this.radarrApiVersion;
      
      if (!baseUrl || !apiKey) {
        console.error(`${type} not configured - missing URL or API key`);
        throw new Error(`${type} not configured`);
      }
      
      // Normalize the base URL to remove trailing slashes
      const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      console.log(`Using normalized ${type} URL: ${normalizedBaseUrl}`);
      
      // Build URL with more robust error handling
      let url;
      try {
        // Try standard API path format first
        url = new URL(`${normalizedBaseUrl}/api/${apiVersion}/${endpoint}`);
      } catch (e) {
        console.error(`Invalid ${type} URL:`, baseUrl);
        throw new Error(`Invalid ${type} URL: ${baseUrl}`);
      }
      
      const fetchOptions = {
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json'
        },
        ...options
      };
      
      console.log(`Making ${type} API request to: ${url.toString()}`);
      
      const response = await fetch(url.toString(), fetchOptions);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error details available');
        console.error(`${type} API error:`, response.status, response.statusText, errorText);
        
        // Try fallback to v1 API if v3 fails with 404
        if (response.status === 404 && apiVersion === 'v3') {
          console.log(`Trying fallback to v1 API for ${type}...`);
          if (type === 'sonarr') this.sonarrApiVersion = 'v1';
          else this.radarrApiVersion = 'v1';
          return this.makeRequest(type, endpoint, options);
        }
        
        throw new Error(`${type} API error: ${response.status} ${response.statusText}`);
      }
      
      return response.json();
    } catch (error) {
      console.error(`Error making ${type} request:`, error.message);
      throw error;
    }
  }
  
  /**
   * Get Sonarr queue
   * @returns {Promise<Array>} Queue items
   */
  async getSonarrQueue() {
    return this.makeRequest('sonarr', 'queue');
  }
  
  /**
   * Get Radarr queue
   * @returns {Promise<Array>} Queue items
   */
  async getRadarrQueue() {
    return this.makeRequest('radarr', 'queue');
  }
  
  /**
   * Get Sonarr calendar (upcoming/recent episodes)
   * @param {number} days - Days to look forward/back
   * @returns {Promise<Array>} Calendar items
   */
  async getSonarrCalendar(days = 7) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    
    const end = new Date();
    end.setDate(end.getDate() + days);
    
    const startDate = start.toISOString();
    const endDate = end.toISOString();
    
    return this.makeRequest('sonarr', `calendar?start=${startDate}&end=${endDate}`);
  }
  
  /**
   * Get Radarr calendar (upcoming/recent movies)
   * @param {number} days - Days to look forward/back
   * @returns {Promise<Array>} Calendar items
   */
  async getRadarrCalendar(days = 7) {
    const start = new Date();
    start.setDate(start.getDate() - days);
    
    const end = new Date();
    end.setDate(end.getDate() + days);
    
    const startDate = start.toISOString();
    const endDate = end.toISOString();
    
    return this.makeRequest('radarr', `calendar?start=${startDate}&end=${endDate}`);
  }
  
  /**
   * Get Sonarr history
   * @param {number} page - Page number
   * @param {number} pageSize - Items per page
   * @returns {Promise<Object>} History response
   */
  async getSonarrHistory(page = 1, pageSize = 20) {
    return this.makeRequest('sonarr', `history?page=${page}&pageSize=${pageSize}`);
  }
  
  /**
   * Get Radarr history
   * @param {number} page - Page number
   * @param {number} pageSize - Items per page
   * @returns {Promise<Object>} History response
   */
  async getRadarrHistory(page = 1, pageSize = 20) {
    return this.makeRequest('radarr', `history?page=${page}&pageSize=${pageSize}`);
  }
  
  /**
   * Get system status from Sonarr
   * @returns {Promise<Object>} System status
   */
  async getSonarrStatus() {
    return this.makeRequest('sonarr', 'system/status');
  }
  
  /**
   * Get system status from Radarr
   * @returns {Promise<Object>} System status
   */
  async getRadarrStatus() {
    return this.makeRequest('radarr', 'system/status');
  }
  
  /**
   * Format queue items for display in Discord
   * @param {Array} queue - Queue items from Sonarr or Radarr
   * @param {string} type - 'sonarr' or 'radarr'
   * @returns {Array<Object>} Formatted queue items
   */
  formatQueueItems(queue, type) {
    if (!queue || !queue.records) {
      return [];
    }
    
    return queue.records.map(item => {
      // Calculate progress if available
      const progress = item.status === 'downloading' && item.size > 0 
        ? Math.round((item.sizeleft / item.size) * 100) 
        : 0;
      
      // Format media title based on type
      let title = '';
      let mediaType = '';
      
      if (type === 'sonarr') {
        title = item.series?.title || 'Unknown Show';
        if (item.episode) {
          title += ` - S${item.episode.seasonNumber.toString().padStart(2, '0')}E${item.episode.episodeNumber.toString().padStart(2, '0')}`;
          title += ` - ${item.episode.title}`;
        }
        mediaType = 'TV Show';
      } else {
        title = item.movie?.title || 'Unknown Movie';
        if (item.movie?.year) {
          title += ` (${item.movie.year})`;
        }
        mediaType = 'Movie';
      }
      
      // Format size
      const size = item.size ? this.formatBytes(item.size) : 'Unknown';
      
      // Format quality and protocol
      const quality = item.quality?.quality?.name || 'Unknown';
      const protocol = item.protocol || 'Unknown';
      
      return {
        title,
        mediaType,
        status: item.status,
        progress,
        size,
        quality,
        protocol,
        estimatedCompletionTime: item.estimatedCompletionTime,
        downloadClient: item.downloadClient
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
   * Process a webhook payload from Radarr or Sonarr
   * @param {Object} payload - Webhook payload
   * @returns {Object} Processed event data
   */
  processWebhookPayload(payload) {
    const eventType = payload.eventType;
    const isRadarr = 'movie' in payload;
    
    // Basic validation
    if (!eventType) {
      return null;
    }
    
    // Common fields based on event type
    const result = {
      eventType,
      source: isRadarr ? 'Radarr' : 'Sonarr',
      timestamp: new Date().toISOString()
    };
    
    // Process based on event type
    switch (eventType) {
      case 'Grab':
        if (isRadarr) {
          // Radarr grab
          result.mediaType = 'movie';
          result.title = payload.movie?.title || 'Unknown Movie';
          result.year = payload.movie?.year;
          result.quality = payload.release?.quality;
          result.size = payload.release?.size ? this.formatBytes(payload.release.size) : 'Unknown';
        } else {
          // Sonarr grab
          result.mediaType = 'episode';
          result.title = payload.series?.title || 'Unknown Series';
          result.episodeTitle = payload.episodes?.[0]?.title || '';
          result.season = payload.episodes?.[0]?.seasonNumber;
          result.episode = payload.episodes?.[0]?.episodeNumber;
          result.quality = payload.release?.quality;
          result.size = payload.release?.size ? this.formatBytes(payload.release.size) : 'Unknown';
        }
        break;
        
      case 'Download':
        if (isRadarr) {
          // Radarr download
          result.mediaType = 'movie';
          result.title = payload.movie?.title || 'Unknown Movie';
          result.year = payload.movie?.year;
          result.quality = payload.movieFile?.quality;
          result.size = payload.movieFile?.size ? this.formatBytes(payload.movieFile.size) : 'Unknown';
        } else {
          // Sonarr download
          result.mediaType = 'episode';
          result.title = payload.series?.title || 'Unknown Series';
          result.episodeTitle = payload.episodes?.[0]?.title || '';
          result.season = payload.episodes?.[0]?.seasonNumber;
          result.episode = payload.episodes?.[0]?.episodeNumber;
          result.quality = payload.episodeFile?.quality;
          result.size = payload.episodeFile?.size ? this.formatBytes(payload.episodeFile.size) : 'Unknown';
        }
        result.isUpgrade = payload.isUpgrade || false;
        break;
        
      case 'Health':
        result.level = payload.level;
        result.message = payload.message;
        result.wikiUrl = payload.wikiUrl;
        break;
        
      default:
        // Handle other event types
        if (isRadarr) {
          result.mediaType = 'movie';
          result.title = payload.movie?.title || 'Unknown Movie';
          result.year = payload.movie?.year;
        } else {
          result.mediaType = 'series';
          result.title = payload.series?.title || 'Unknown Series';
        }
    }
    
    return result;
  }
}

// Export a singleton instance
const arrService = new ArrService();
export default arrService;
