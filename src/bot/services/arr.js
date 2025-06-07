import fetch from 'node-fetch';

/**
 * Service for interacting with Sonarr and Radarr APIs
 */
class ArrService {
  constructor() {
    // Initial configuration will be updated with the latest env vars on each API call
    this.sonarrApiVersion = 'v3'; // Default version
    this.radarrApiVersion = 'v3'; // Default version
    
    // Log configuration status
    this.checkConfiguration();
  }
  
  /**
   * Check and log the configuration status
   */
  checkConfiguration() {
    // Get latest environment variables
    this.sonarrUrl = process.env.SONARR_URL;
    this.sonarrApiKey = process.env.SONARR_API_KEY;
    this.radarrUrl = process.env.RADARR_URL;
    this.radarrApiKey = process.env.RADARR_API_KEY;
    
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
      // Always get the latest configuration from environment variables
      this.checkConfiguration();
      
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
   * Format queue items for display
   */
  formatQueueItems(queue, type) {
    if (!queue || !queue.records) {
      return [];
    }
    
    return queue.records.map(item => {
      // Calculate progress if available
      const progress = item.status === 'downloading' && item.size > 0 
        ? Math.round(((item.size - item.sizeleft) / item.size) * 100) 
        : 0;
      
      // Format media title based on type
      let title = '';
      let mediaType = '';
      
      if (type === 'sonarr') {
        // Try to get title from series object first
        title = item.series?.title;
        
        // If no title but we have a download title, try to extract a better title
        if ((!title || title === 'Unknown Show') && item.title) {
          // Log the item for debugging
          console.log(`Extracting TV show title from: ${item.title}`);
          
          // Extract TV show info from download name
          // Common patterns for TV: Show.Name.S01E01.Episode.Name.etc
          const downloadTitle = item.title;
          
          // Try to find season/episode pattern like S01E01
          const episodeMatch = downloadTitle.match(/S\d+E\d+/i);
          
          // Get the part before the episode if found
          let cleanTitle = downloadTitle;
          if (episodeMatch) {
            cleanTitle = downloadTitle.split(episodeMatch[0])[0];
          } else {
            // If no episode indicator found, just take first few parts
            const parts = downloadTitle.split('.');
            cleanTitle = parts.slice(0, Math.min(3, parts.length)).join('.');
          }
          
          // Replace dots with spaces and clean up
          cleanTitle = cleanTitle.replace(/\./g, ' ').trim();
          
          title = cleanTitle;
        }
        
        // Add episode info if available
        if (item.episode) {
          title += ` - S${item.episode.seasonNumber.toString().padStart(2, '0')}E${item.episode.episodeNumber.toString().padStart(2, '0')}`;
          title += ` - ${item.episode.title}`;
        } else if (item.title && item.title.match(/S\d+E\d+/i)) {
          // Try to extract episode number from title
          const match = item.title.match(/(S\d+E\d+)/i);
          if (match) {
            title += ` - ${match[1]}`;
          }
        }
        
        // Make sure we have a title
        title = title || 'Unknown Show';
        mediaType = 'TV Show';
      } else {
        // For movies, first try to get the title from movie metadata
        title = item.movie?.title;
        
        // If no title but we have a download title, try to extract a better title
        if ((!title || title === 'Unknown Movie') && item.title) {
          // Log the item for debugging
          console.log(`Extracting title from: ${item.title}`);
          
          // Extract a cleaner title from the download name
          // Common patterns: Movie.Name.YEAR.QUALITY.etc or Movie.Name.YEAR.etc
          const downloadTitle = item.title;
          
          // Extract year if present (YYYY format)
          const yearMatch = downloadTitle.match(/\.(\d{4})\./);
          const year = yearMatch ? yearMatch[1] : '';
          
          // Get the part before the year, replace dots with spaces, and clean up
          let cleanTitle = downloadTitle;
          if (yearMatch) {
            cleanTitle = downloadTitle.split(yearMatch[0])[0];
          } else {
            // If no year found, just take the first few segments
            const parts = downloadTitle.split('.');
            cleanTitle = parts.slice(0, Math.min(4, parts.length)).join('.');
          }
          
          // Replace dots with spaces and clean up
          cleanTitle = cleanTitle.replace(/\./g, ' ').trim();
          
          // Add year if found
          title = cleanTitle + (year ? ` (${year})` : '');
        }
        
        // If we still don't have a title, try using downloadTitle as a backup
        if ((!title || title === 'Unknown Movie') && item.downloadTitle) {
          // Similar process as above but using downloadTitle
          const downloadTitle = item.downloadTitle;
          
          const yearMatch = downloadTitle.match(/\.(\d{4})\./);
          const year = yearMatch ? yearMatch[1] : '';
          
          let cleanTitle = downloadTitle;
          if (yearMatch) {
            cleanTitle = downloadTitle.split(yearMatch[0])[0];
          } else {
            const parts = downloadTitle.split('.');
            cleanTitle = parts.slice(0, Math.min(4, parts.length)).join('.');
          }
          
          cleanTitle = cleanTitle.replace(/\./g, ' ').trim();
          title = cleanTitle + (year ? ` (${year})` : '');
        }
        
        // Fall back to Unknown if we still couldn't get a title
        title = title || 'Unknown Movie';
        
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
   * Check if a movie has been downloaded in Radarr
   * @param {number} tmdbId - TMDB ID of the movie
   * @returns {Promise<Object>} Movie download status information
   */
  async checkRadarrMovieStatus(tmdbId) {
    try {
      // Always get the latest configuration from environment variables
      this.checkConfiguration();
      
      if (!this.radarrUrl || !this.radarrApiKey) {
        console.log('Radarr not configured, cannot check movie status');
        return { configured: false, status: 'unknown' };
      }
      
      if (!tmdbId || isNaN(tmdbId)) {
        throw new Error('Invalid TMDB ID');
      }
      
      console.log(`Checking Radarr status for TMDB ID: ${tmdbId}`);
      
      // Get ALL movies from Radarr library
      const allMovies = await this.makeRequest('radarr', 'movie');
      console.log(`Found ${allMovies.length} movies in Radarr library`);
      
      // Find the movie by TMDB ID in the library
      const radarrMovie = allMovies.find(m => m.tmdbId === parseInt(tmdbId));
      
      if (!radarrMovie) {
        console.log(`Movie with TMDB ID ${tmdbId} not found in Radarr library`);
        
        // Check if the movie exists in TMDB at least
        try {
          const movieResponse = await this.makeRequest('radarr', `movie/lookup/tmdb?tmdbId=${tmdbId}`);
          if (movieResponse && movieResponse.length) {
            // Movie exists in TMDB but not in Radarr
            return { 
              configured: true, 
              exists: false, 
              status: 'not_in_library',
              title: movieResponse[0].title,
              year: movieResponse[0].year
            };
          }
        } catch (error) {
          console.error('Error looking up movie in TMDB:', error.message);
        }
        
        return { configured: true, exists: false, status: 'not_found' };
      }
      
      // Check if the movie has been downloaded by looking at hasFile property
      const hasFile = radarrMovie.hasFile === true;
      const monitored = radarrMovie.monitored === true;
      
      // Get queued downloads for this movie if it exists but doesn't have a file
      let queueItems = [];
      if (!hasFile && monitored) {
        try {
          const queue = await this.getRadarrQueue();
          queueItems = queue.filter(item => item.movieId === radarrMovie.id);
        } catch (error) {
          console.error('Error checking Radarr queue:', error);
        }
      }
      
      return {
        configured: true,
        exists: true,
        monitored: monitored,
        hasFile: hasFile,
        status: hasFile ? 'downloaded' : (monitored ? 'monitored' : 'unmonitored'),
        queueStatus: queueItems.length > 0 ? 'downloading' : 'not_downloading',
        queueItems: queueItems,
        title: radarrMovie.title,
        year: radarrMovie.year
      };
    } catch (error) {
      console.error('Error checking Radarr movie status:', error);
      return { configured: true, error: error.message, status: 'error' };
    }
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
