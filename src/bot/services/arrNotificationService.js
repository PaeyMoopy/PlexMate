import fetch from 'node-fetch';
import { client } from '../index.js';
import { EmbedBuilder } from 'discord.js';
import * as database from './database.js';

/**
 * Service for monitoring Sonarr and Radarr for media availability and sending notifications
 * This service provides an alternative to Tautulli webhooks for Jellyfin/Emby users
 */
class ArrNotificationService {
  constructor() {
    this.sonarrUrl = process.env.SONARR_URL;
    this.sonarrApiKey = process.env.SONARR_API_KEY;
    this.radarrUrl = process.env.RADARR_URL;
    this.radarrApiKey = process.env.RADARR_API_KEY;
    this.monitorInterval = parseInt(process.env.MONITOR_INTERVAL || '15', 10);
    this.lastSonarrCheck = 0; // timestamp of last check
    this.lastRadarrCheck = 0; // timestamp of last check
    this.processedHistory = new Set(); // store processed history IDs to avoid duplicates
    
    // Maximum number of history items to fetch (defaults to last 30)
    this.historyLimit = 30;
  }

  /**
   * Start monitoring Sonarr and Radarr for completed downloads
   * @returns {void}
   */
  startMonitoring() {
    console.log(`Starting Sonarr/Radarr monitoring (interval: ${this.monitorInterval} minutes)`);
    
    // Initial check
    this.checkForCompletedDownloads();
    
    // Set up regular interval checking
    setInterval(() => {
      this.checkForCompletedDownloads();
    }, this.monitorInterval * 60 * 1000);
  }

  /**
   * Check both Sonarr and Radarr for completed downloads
   * @returns {Promise<void>}
   */
  async checkForCompletedDownloads() {
    try {
      console.log('Checking Sonarr and Radarr for completed downloads...');
      
      if (this.sonarrUrl && this.sonarrApiKey) {
        await this.checkSonarrHistory();
      }
      
      if (this.radarrUrl && this.radarrApiKey) {
        await this.checkRadarrHistory();
      }
    } catch (error) {
      console.error('Error checking for completed downloads:', error);
    }
  }

  /**
   * Check Sonarr history for recently completed downloads and notify subscribers
   * @returns {Promise<void>}
   */
  async checkSonarrHistory() {
    try {
      const currentTime = Date.now();
      const url = `${this.sonarrUrl}/api/v3/history?page=1&pageSize=${this.historyLimit}&sortKey=date&sortDirection=desc&eventType=downloadFolderImported`;
      
      const response = await fetch(url, {
        headers: {
          'X-Api-Key': this.sonarrApiKey,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Sonarr API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Process only new items since last check
      for (const item of data.records) {
        const itemTime = new Date(item.date).getTime();
        const uniqueId = `sonarr-${item.id}`;
        
        // Skip items we've already processed
        if (this.processedHistory.has(uniqueId)) {
          continue;
        }
        
        // Skip older items on first run to avoid notification spam
        if (this.lastSonarrCheck === 0 && (currentTime - itemTime) > 30 * 60 * 1000) { // Skip items older than 30 minutes on first run
          this.processedHistory.add(uniqueId);
          continue;
        }
        
        // Skip items older than last check
        if (itemTime <= this.lastSonarrCheck) {
          continue;
        }
        
        await this.processSonarrDownload(item);
        this.processedHistory.add(uniqueId);
        
        // Limit the size of processedHistory to prevent memory leaks
        if (this.processedHistory.size > 1000) {
          // Convert to array, slice, and convert back to set
          const historyArray = [...this.processedHistory];
          this.processedHistory = new Set(historyArray.slice(historyArray.length - 500));
        }
      }
      
      this.lastSonarrCheck = currentTime;
    } catch (error) {
      console.error('Error checking Sonarr history:', error);
    }
  }
  
  /**
   * Process a Sonarr download and notify subscribers
   * @param {Object} item - Sonarr history item
   * @returns {Promise<void>}
   */
  async processSonarrDownload(item) {
    try {
      // Extract details from Sonarr history item
      const { series, episode, episodeTitle, seasonNumber, episodeNumber, quality } = item;
      
      if (!series || !episode) {
        console.error('Invalid Sonarr history item structure');
        return;
      }
      
      const showTitle = series.title;
      const episodeInfo = `S${seasonNumber.toString().padStart(2, '0')}E${episodeNumber.toString().padStart(2, '0')}`;
      const title = `${showTitle} - ${episodeInfo}`;
      
      // Find subscribers for this show
      const subscribers = database.findSubscriptionsByTitle(showTitle, 'tv');
      
      if (!subscribers || !subscribers.length) {
        console.log(`No subscribers found for ${showTitle}`);
        return;
      }
      
      console.log(`Found ${subscribers.length} subscriber(s) for ${showTitle}`);
      
      // Handle episode subscriptions
      for (const sub of subscribers) {
        try {
          if (sub.episode_subscription) {
            // This is an episode-specific subscription
            const episodesToCheck = this.parseEpisodeRanges(sub.episode_numbers);
            
            // Check if this episode matches subscription
            if (episodesToCheck.includes(episodeNumber) && sub.season_number === seasonNumber) {
              await this.sendEpisodeNotification(sub.user_id, showTitle, episodeInfo, episodeTitle, quality?.quality?.name || 'Unknown');
              
              // Update subscription to mark episode as notified
              database.updateSubscription(
                sub.user_id, 
                sub.media_id, 
                {
                  // Remove this episode from the subscription list
                  episode_numbers: this.removeFromEpisodeRange(sub.episode_numbers, episodeNumber)
                }
              );
            }
          } else {
            // This is a season subscription (notify for new seasons)
            if (seasonNumber === 1 && episodeNumber === 1) {
              // Only notify for first episode of first season for "release" subscriptions
              await this.sendNewSeasonNotification(sub.user_id, showTitle, 1);
              
              // Remove the subscription since it's a "release" subscription
              database.removeSubscription(sub.user_id, sub.media_id);
            }
          }
        } catch (error) {
          console.error(`Error processing subscription for ${sub.user_id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing Sonarr download:', error);
    }
  }
  
  /**
   * Check Radarr history for recently completed downloads and notify subscribers
   * @returns {Promise<void>}
   */
  async checkRadarrHistory() {
    try {
      const currentTime = Date.now();
      const url = `${this.radarrUrl}/api/v3/history?page=1&pageSize=${this.historyLimit}&sortKey=date&sortDirection=desc&eventType=downloadFolderImported`;
      
      const response = await fetch(url, {
        headers: {
          'X-Api-Key': this.radarrApiKey,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Radarr API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Process only new items since last check
      for (const item of data.records) {
        const itemTime = new Date(item.date).getTime();
        const uniqueId = `radarr-${item.id}`;
        
        // Skip items we've already processed
        if (this.processedHistory.has(uniqueId)) {
          continue;
        }
        
        // Skip older items on first run to avoid notification spam
        if (this.lastRadarrCheck === 0 && (currentTime - itemTime) > 30 * 60 * 1000) { // Skip items older than 30 minutes on first run
          this.processedHistory.add(uniqueId);
          continue;
        }
        
        // Skip items older than last check
        if (itemTime <= this.lastRadarrCheck) {
          continue;
        }
        
        await this.processRadarrDownload(item);
        this.processedHistory.add(uniqueId);
        
        // Limit the size of processedHistory to prevent memory leaks
        if (this.processedHistory.size > 1000) {
          // Convert to array, slice, and convert back to set
          const historyArray = [...this.processedHistory];
          this.processedHistory = new Set(historyArray.slice(historyArray.length - 500));
        }
      }
      
      this.lastRadarrCheck = currentTime;
    } catch (error) {
      console.error('Error checking Radarr history:', error);
    }
  }
  
  /**
   * Process a Radarr download and notify subscribers
   * @param {Object} item - Radarr history item
   * @returns {Promise<void>}
   */
  async processRadarrDownload(item) {
    try {
      // Extract details from Radarr history item
      const { movie, quality } = item;
      
      if (!movie) {
        console.error('Invalid Radarr history item structure');
        return;
      }
      
      const movieTitle = movie.title + (movie.year ? ` (${movie.year})` : '');
      
      // Find subscribers for this movie
      const subscribers = database.findSubscriptionsByTitle(movie.title, 'movie');
      
      if (!subscribers || !subscribers.length) {
        console.log(`No subscribers found for ${movieTitle}`);
        return;
      }
      
      console.log(`Found ${subscribers.length} subscriber(s) for ${movieTitle}`);
      
      // Notify all subscribers
      for (const sub of subscribers) {
        try {
          await this.sendMovieNotification(sub.user_id, movieTitle, quality?.quality?.name || 'Unknown');
          
          // Remove the subscription after notification
          database.removeSubscription(sub.user_id, sub.media_id);
        } catch (error) {
          console.error(`Error processing subscription for ${sub.user_id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing Radarr download:', error);
    }
  }
  
  /**
   * Send notification for a new episode
   * @param {string} userId - Discord user ID
   * @param {string} showTitle - Show title
   * @param {string} episodeInfo - Episode identifier (e.g., S01E01)
   * @param {string} episodeTitle - Episode title
   * @param {string} quality - Quality of the download
   * @returns {Promise<void>}
   */
  async sendEpisodeNotification(userId, showTitle, episodeInfo, episodeTitle, quality) {
    try {
      const user = await client.users.fetch(userId);
      
      const embed = new EmbedBuilder()
        .setTitle('New Episode Available! 🎬')
        .setDescription(`**${showTitle}** - ${episodeInfo}${episodeTitle ? `: ${episodeTitle}` : ''}`)
        .setColor(0x00ff00)
        .setFooter({ text: `Quality: ${quality}` })
        .setTimestamp();
      
      await user.send({ embeds: [embed] });
      console.log(`Sent episode notification to ${userId} for ${showTitle} ${episodeInfo}`);
    } catch (error) {
      console.error(`Error sending episode notification to ${userId}:`, error);
    }
  }
  
  /**
   * Send notification for a new movie
   * @param {string} userId - Discord user ID
   * @param {string} movieTitle - Movie title with year
   * @param {string} quality - Quality of the download
   * @returns {Promise<void>}
   */
  async sendMovieNotification(userId, movieTitle, quality) {
    try {
      const user = await client.users.fetch(userId);
      
      const embed = new EmbedBuilder()
        .setTitle('New Movie Available! 🍿')
        .setDescription(`**${movieTitle}** is now available to watch!`)
        .setColor(0x00ff00)
        .setFooter({ text: `Quality: ${quality}` })
        .setTimestamp();
      
      await user.send({ embeds: [embed] });
      console.log(`Sent movie notification to ${userId} for ${movieTitle}`);
    } catch (error) {
      console.error(`Error sending movie notification to ${userId}:`, error);
    }
  }
  
  /**
   * Send notification for a new season
   * @param {string} userId - Discord user ID
   * @param {string} showTitle - Show title
   * @param {number} seasonNumber - Season number
   * @returns {Promise<void>}
   */
  async sendNewSeasonNotification(userId, showTitle, seasonNumber) {
    try {
      const user = await client.users.fetch(userId);
      
      const embed = new EmbedBuilder()
        .setTitle('New Season Available! 🎉')
        .setDescription(`**${showTitle} - Season ${seasonNumber}** is now available to watch!`)
        .setColor(0x00ff00)
        .setTimestamp();
      
      await user.send({ embeds: [embed] });
      console.log(`Sent new season notification to ${userId} for ${showTitle} S${seasonNumber}`);
    } catch (error) {
      console.error(`Error sending new season notification to ${userId}:`, error);
    }
  }
  
  /**
   * Helper function to parse episode ranges like "1-6,18,20"
   * @param {string} rangeString - Episode range string
   * @returns {number[]} Array of episode numbers
   */
  parseEpisodeRanges(rangeString) {
    if (!rangeString) return [];
    
    const episodes = [];
    const ranges = rangeString.split(',');
    
    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(num => parseInt(num, 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            episodes.push(i);
          }
        }
      } else {
        const episode = parseInt(range, 10);
        if (!isNaN(episode)) {
          episodes.push(episode);
        }
      }
    }
    
    return episodes;
  }
  
  /**
   * Helper function to remove an episode from an episode range string
   * @param {string} rangeString - Episode range string
   * @param {number} episodeToRemove - Episode number to remove
   * @returns {string} Updated range string
   */
  removeFromEpisodeRange(rangeString, episodeToRemove) {
    if (!rangeString) return '';
    
    // Parse the current range into an array of numbers
    const episodes = this.parseEpisodeRanges(rangeString);
    
    // Remove the episode
    const updatedEpisodes = episodes.filter(ep => ep !== episodeToRemove);
    
    // If no episodes left, subscription is complete
    if (updatedEpisodes.length === 0) {
      return '';
    }
    
    // Convert back to a range string (simple list for now)
    return updatedEpisodes.join(',');
  }
}

// Export a singleton instance
const arrNotificationService = new ArrNotificationService();
export default arrNotificationService;
