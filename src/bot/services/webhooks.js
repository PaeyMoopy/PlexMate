import * as database from './database.js';

/**
 * Service for handling webhooks from Sonarr and Radarr
 */
class WebhookService {
  constructor() {
    // No webhook secret needed as everything is locally hosted
  }

  /**
   * Process a webhook from Sonarr
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processSonarrWebhook(payload) {
    try {
      if (!payload || !payload.eventType) {
        console.error('Invalid Sonarr webhook payload');
        return false;
      }

      const { eventType } = payload;
      console.log(`Processing Sonarr webhook: ${eventType}`);

      // Handle different event types
      switch (eventType) {
        case 'Grab':
          return this.processSonarrGrab(payload);
        case 'Download':
          return this.processSonarrDownload(payload);
        case 'EpisodeFileDelete':
          return this.processSonarrDelete(payload);
        case 'SeriesDelete':
          return this.processSonarrSeriesDelete(payload);
        default:
          console.log(`Unhandled Sonarr event type: ${eventType}`);
          return true; // Not an error, just not handling this event
      }
    } catch (error) {
      console.error('Error processing Sonarr webhook:', error);
      return false;
    }
  }

  /**
   * Process a webhook from Radarr
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processRadarrWebhook(payload) {
    try {
      if (!payload || !payload.eventType) {
        console.error('Invalid Radarr webhook payload');
        return false;
      }

      const { eventType } = payload;
      console.log(`Processing Radarr webhook: ${eventType}`);

      // Handle different event types
      switch (eventType) {
        case 'Grab':
          return this.processRadarrGrab(payload);
        case 'Download':
          return this.processRadarrDownload(payload);
        case 'MovieFileDelete':
          return this.processRadarrDelete(payload);
        case 'MovieDelete':
          return this.processRadarrMovieDelete(payload);
        default:
          console.log(`Unhandled Radarr event type: ${eventType}`);
          return true; // Not an error, just not handling this event
      }
    } catch (error) {
      console.error('Error processing Radarr webhook:', error);
      return false;
    }
  }

  /**
   * Process a Sonarr grab event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processSonarrGrab(payload) {
    try {
      const { series, episodes, release } = payload;
      
      if (!series || !episodes || !episodes.length) {
        console.error('Invalid Sonarr grab payload structure');
        return false;
      }

      const episodeNumbers = episodes.map(ep => `S${ep.seasonNumber.toString().padStart(2, '0')}E${ep.episodeNumber.toString().padStart(2, '0')}`).join(' ');
      const title = `${series.title} - ${episodeNumbers}`;
      const quality = release?.quality || 'Unknown';
      const size = release?.size ? this.formatBytes(release.size) : 'Unknown';
      const downloadClient = release?.downloadClient || 'Unknown';

      // Add to download history
      database.addDownloadHistory(
        'grab', 
        'sonarr', 
        'episode', 
        title, 
        quality, 
        size, 
        downloadClient, 
        {
          seriesId: series.id,
          episodeIds: episodes.map(ep => ep.id),
          releaseData: release
        }
      );

      console.log(`Recorded Sonarr grab: ${title}`);
      return true;
    } catch (error) {
      console.error('Error processing Sonarr grab:', error);
      return false;
    }
  }

  /**
   * Process a Sonarr download event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processSonarrDownload(payload) {
    try {
      const { series, episodes, episodeFile, isUpgrade } = payload;
      
      if (!series || !episodes || !episodes.length) {
        console.error('Invalid Sonarr download payload structure');
        return false;
      }

      const episodeNumbers = episodes.map(ep => `S${ep.seasonNumber.toString().padStart(2, '0')}E${ep.episodeNumber.toString().padStart(2, '0')}`).join(' ');
      const title = `${series.title} - ${episodeNumbers}`;
      const quality = episodeFile?.quality?.quality?.name || 'Unknown';
      const size = episodeFile?.size ? this.formatBytes(episodeFile.size) : 'Unknown';

      // Add to download history
      database.addDownloadHistory(
        isUpgrade ? 'upgrade' : 'download', 
        'sonarr', 
        'episode', 
        title, 
        quality, 
        size, 
        'completed', 
        {
          seriesId: series.id,
          episodeIds: episodes.map(ep => ep.id),
          episodeFileId: episodeFile?.id,
          isUpgrade
        }
      );

      console.log(`Recorded Sonarr download: ${title}`);
      return true;
    } catch (error) {
      console.error('Error processing Sonarr download:', error);
      return false;
    }
  }

  /**
   * Process a Sonarr delete event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processSonarrDelete(payload) {
    try {
      const { series, episodeFile } = payload;
      
      if (!series) {
        console.error('Invalid Sonarr delete payload structure');
        return false;
      }

      const title = series.title + (episodeFile ? ` - Episode File ${episodeFile.id}` : '');

      // Add to download history
      database.addDownloadHistory(
        'delete', 
        'sonarr', 
        'episode', 
        title, 
        episodeFile?.quality?.quality?.name || 'Unknown', 
        episodeFile?.size ? this.formatBytes(episodeFile.size) : 'Unknown', 
        'deleted', 
        {
          seriesId: series.id,
          episodeFileId: episodeFile?.id
        }
      );

      console.log(`Recorded Sonarr delete: ${title}`);
      return true;
    } catch (error) {
      console.error('Error processing Sonarr delete:', error);
      return false;
    }
  }

  /**
   * Process a Sonarr series delete event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processSonarrSeriesDelete(payload) {
    try {
      const { series } = payload;
      
      if (!series) {
        console.error('Invalid Sonarr series delete payload structure');
        return false;
      }

      // Add to download history
      database.addDownloadHistory(
        'delete', 
        'sonarr', 
        'series', 
        series.title, 
        'N/A', 
        'N/A', 
        'deleted', 
        {
          seriesId: series.id
        }
      );

      console.log(`Recorded Sonarr series delete: ${series.title}`);
      return true;
    } catch (error) {
      console.error('Error processing Sonarr series delete:', error);
      return false;
    }
  }

  /**
   * Process a Radarr grab event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processRadarrGrab(payload) {
    try {
      const { movie, remoteMovie, release } = payload;
      
      if (!movie) {
        console.error('Invalid Radarr grab payload structure');
        return false;
      }

      const title = movie.title + (movie.year ? ` (${movie.year})` : '');
      const quality = release?.quality || 'Unknown';
      const size = release?.size ? this.formatBytes(release.size) : 'Unknown';
      const downloadClient = release?.downloadClient || 'Unknown';

      // Add to download history
      database.addDownloadHistory(
        'grab', 
        'radarr', 
        'movie', 
        title, 
        quality, 
        size, 
        downloadClient, 
        {
          movieId: movie.id,
          tmdbId: movie.tmdbId,
          imdbId: remoteMovie?.imdbId,
          releaseData: release
        }
      );

      console.log(`Recorded Radarr grab: ${title}`);
      return true;
    } catch (error) {
      console.error('Error processing Radarr grab:', error);
      return false;
    }
  }

  /**
   * Process a Radarr download event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processRadarrDownload(payload) {
    try {
      const { movie, remoteMovie, movieFile, isUpgrade } = payload;
      
      if (!movie) {
        console.error('Invalid Radarr download payload structure');
        return false;
      }

      const title = movie.title + (movie.year ? ` (${movie.year})` : '');
      const quality = movieFile?.quality?.quality?.name || 'Unknown';
      const size = movieFile?.size ? this.formatBytes(movieFile.size) : 'Unknown';

      // Add to download history
      database.addDownloadHistory(
        isUpgrade ? 'upgrade' : 'download', 
        'radarr', 
        'movie', 
        title, 
        quality, 
        size, 
        'completed', 
        {
          movieId: movie.id,
          tmdbId: movie.tmdbId,
          imdbId: remoteMovie?.imdbId,
          movieFileId: movieFile?.id,
          isUpgrade
        }
      );

      console.log(`Recorded Radarr download: ${title}`);
      return true;
    } catch (error) {
      console.error('Error processing Radarr download:', error);
      return false;
    }
  }

  /**
   * Process a Radarr delete event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processRadarrDelete(payload) {
    try {
      const { movie, movieFile } = payload;
      
      if (!movie) {
        console.error('Invalid Radarr delete payload structure');
        return false;
      }

      const title = movie.title + (movie.year ? ` (${movie.year})` : '');

      // Add to download history
      database.addDownloadHistory(
        'delete', 
        'radarr', 
        'movie', 
        title, 
        movieFile?.quality?.quality?.name || 'Unknown', 
        movieFile?.size ? this.formatBytes(movieFile.size) : 'Unknown', 
        'deleted', 
        {
          movieId: movie.id,
          movieFileId: movieFile?.id
        }
      );

      console.log(`Recorded Radarr delete: ${title}`);
      return true;
    } catch (error) {
      console.error('Error processing Radarr delete:', error);
      return false;
    }
  }

  /**
   * Process a Radarr movie delete event
   * @param {Object} payload - Webhook payload
   * @returns {boolean} Success
   */
  processRadarrMovieDelete(payload) {
    try {
      const { movie } = payload;
      
      if (!movie) {
        console.error('Invalid Radarr movie delete payload structure');
        return false;
      }

      const title = movie.title + (movie.year ? ` (${movie.year})` : '');

      // Add to download history
      database.addDownloadHistory(
        'delete', 
        'radarr', 
        'movie', 
        title, 
        'N/A', 
        'N/A', 
        'deleted', 
        {
          movieId: movie.id
        }
      );

      console.log(`Recorded Radarr movie delete: ${title}`);
      return true;
    } catch (error) {
      console.error('Error processing Radarr movie delete:', error);
      return false;
    }
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
}

// Export a singleton instance
const webhookService = new WebhookService();
export default webhookService;
