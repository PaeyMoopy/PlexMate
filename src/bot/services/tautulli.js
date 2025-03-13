import fetch from 'node-fetch';

/**
 * Service for interacting with the Tautulli API to get Plex server statistics
 */
class TautulliService {
  constructor() {
    this.updateCredentials();
  }

  /**
   * Update credentials from environment variables
   * This ensures we always have the latest credentials
   */
  updateCredentials() {
    this.baseUrl = process.env.TAUTULLI_URL;
    this.apiKey = process.env.TAUTULLI_API_KEY;
    
    // If URL has trailing slash, remove it
    if (this.baseUrl && this.baseUrl.endsWith('/')) {
      this.baseUrl = this.baseUrl.slice(0, -1);
    }
    
    if (!this.baseUrl || !this.apiKey) {
      console.warn('Tautulli URL or API key not configured. Statistics features will be limited.');
    } else {
      console.log(`Tautulli configured with URL: ${this.baseUrl}`);
    }
  }

  /**
   * Make a request to the Tautulli API
   * @param {string} cmd - The API command to execute
   * @param {Object} params - Additional parameters for the API call
   * @returns {Promise<Object>} The API response
   */
  async makeRequest(cmd, params = {}) {
    // Always get the latest credentials
    this.updateCredentials();
    
    if (!this.baseUrl || !this.apiKey) {
      throw new Error('Tautulli not configured');
    }

    try {
      const url = new URL(`${this.baseUrl}/api/v2`);
      url.searchParams.append('apikey', this.apiKey);
      url.searchParams.append('cmd', cmd);
      
      // Add any additional parameters
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.append(key, value);
      }

      console.log(`Making Tautulli API request: ${cmd}`);
      
      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Tautulli API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.response.result !== 'success') {
        throw new Error(`Tautulli command failed: ${data.response.message}`);
      }

      return data.response.data;
    } catch (error) {
      console.error('Error making Tautulli request:', error);
      throw error;
    }
  }

  /**
   * Get current activity on the Plex server
   * @returns {Promise<Object>} Current activity data
   */
  async getActivity() {
    return this.makeRequest('get_activity');
  }

  /**
   * Get server information
   * @returns {Promise<Object>} Server information
   */
  async getServerInfo() {
    return this.makeRequest('get_servers_info');
  }

  /**
   * Get all time statistics from Tautulli
   * @returns {Promise<Object>} Statistics data
   */
  async getHomeStats() {
    return this.makeRequest('get_home_stats', { time_range: 30, stats_type: 'duration' });
  }

  /**
   * Get library details
   * @returns {Promise<Object>} Library data
   */
  async getLibraries() {
    return this.makeRequest('get_libraries');
  }

  /**
   * Get the watch history for a specific time period
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Watch history data
   */
  async getWatchHistory(days = 7) {
    return this.makeRequest('get_history', { length: 50, days: days });
  }

  /**
   * Get total watch statistics
   * @returns {Promise<Object>} Watch statistics
   */
  async getWatchStats() {
    const stats = await this.makeRequest('get_home_stats');
    return stats.filter(stat => 
      ['top_users', 'popular_movies', 'popular_tv'].includes(stat.stat_id)
    );
  }

  /**
   * Format stream data for display in Discord
   * @param {Object} activity - The activity data from Tautulli
   * @returns {Array<Object>} Formatted stream data
   */
  formatStreamData(activity) {
    if (!activity || !activity.sessions) {
      return [];
    }

    return activity.sessions.map(session => {
      // Calculate progress percentage
      const progress = Math.round((session.view_offset / session.duration) * 100) || 0;
      
      // Format quality and stream type
      const quality = session.video_resolution ? `${session.video_resolution}${session.video_full_resolution ? 'p' : ''}` : 'Unknown';
      const isTranscoding = session.transcode_decision !== 'direct play';
      
      // Format stream type emoji
      const streamEmoji = isTranscoding ? '🔄' : '⏯️';
      
      // Format time remaining
      const secondsLeft = Math.floor((session.duration - session.view_offset) / 1000);
      const hoursLeft = Math.floor(secondsLeft / 3600);
      const minutesLeft = Math.floor((secondsLeft % 3600) / 60);
      const timeRemaining = hoursLeft > 0 
        ? `${hoursLeft}h ${minutesLeft}m left` 
        : `${minutesLeft}m left`;
      
      // Get media type emojis
      const mediaTypeEmoji = session.media_type === 'episode' ? '📺' : 
                             session.media_type === 'movie' ? '🎬' : '🎭';
      
      // Format media title
      let title = '';
      if (session.media_type === 'episode') {
        title = `${session.grandparent_title} - S${session.parent_media_index}E${session.media_index}`;
      } else {
        title = session.title;
        if (session.year) title += ` (${session.year})`;
      }

      return {
        user: session.friendly_name,
        title,
        progress,
        quality,
        device: session.player,
        mediaType: session.media_type,
        mediaTypeEmoji,
        streamEmoji,
        timeRemaining,
        bandwidth: Math.round(session.bandwidth / 1000),
        isTranscoding,
        transcodeReason: session.transcode_decision || 'Direct Play'
      };
    });
  }
}

// Export a singleton instance
const tautulliService = new TautulliService();
export default tautulliService;
