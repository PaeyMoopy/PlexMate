import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, '..', '..', '..', 'data', 'bot.db');
const db = new Database(dbPath);

// Initialize database with required tables
db.exec(`
  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id TEXT NOT NULL,
    media_id TEXT NOT NULL,
    media_type TEXT NOT NULL,
    media_title TEXT NOT NULL,
    episode_subscription BOOLEAN NOT NULL DEFAULT 0,
    last_notified_season INTEGER,
    last_notified_episode INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, media_id)
  )
`);

// Add new tables for statistics
db.exec(`
  CREATE TABLE IF NOT EXISTS download_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    media_type TEXT NOT NULL,
    title TEXT NOT NULL,
    quality TEXT,
    size TEXT,
    download_client TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data JSON
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS watch_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT NOT NULL,
    title TEXT NOT NULL,
    media_type TEXT NOT NULL,
    duration INTEGER,
    watched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    platform TEXT,
    quality TEXT,
    session_id TEXT
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS active_streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE,
    user TEXT NOT NULL,
    title TEXT NOT NULL,
    media_type TEXT NOT NULL,
    progress REAL,
    quality TEXT,
    device TEXT,
    bandwidth INTEGER,
    is_transcoding BOOLEAN,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS dashboard_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id TEXT,
    channel_id TEXT,
    update_interval INTEGER DEFAULT 60000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Prepare statements for better performance
const addSubscriptionStmt = db.prepare(`
  INSERT OR REPLACE INTO subscriptions (
    user_id, media_id, media_type, media_title, episode_subscription
  ) VALUES (?, ?, ?, ?, ?)
`);

const getSubscriptionsStmt = db.prepare(`
  SELECT * FROM subscriptions WHERE user_id = ?
`);

const getSubscriptionByTitleStmt = db.prepare(`
  SELECT * FROM subscriptions 
  WHERE media_title LIKE ? 
  AND media_type = ?
`);

const removeSubscriptionStmt = db.prepare(`
  DELETE FROM subscriptions 
  WHERE user_id = ? AND media_id = ?
`);

const updateSubscriptionStmt = db.prepare(`
  UPDATE subscriptions 
  SET last_notified_season = ?, 
      last_notified_episode = ? 
  WHERE user_id = ? AND media_id = ?
`);

// Prepare statements for download history
const addDownloadHistoryStmt = db.prepare(`
  INSERT INTO download_history (
    event_type, source, media_type, title, quality, size, download_client, data
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

const getRecentDownloadsStmt = db.prepare(`
  SELECT * FROM download_history 
  ORDER BY timestamp DESC 
  LIMIT ?
`);

// Prepare statements for watch history
const addWatchHistoryStmt = db.prepare(`
  INSERT INTO watch_history (
    user, title, media_type, duration, platform, quality, session_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const getRecentWatchHistoryStmt = db.prepare(`
  SELECT * FROM watch_history
  ORDER BY watched_at DESC
  LIMIT ?
`);

const getWatchStatsByUserStmt = db.prepare(`
  SELECT user, COUNT(*) as count, SUM(duration) as total_duration
  FROM watch_history 
  WHERE watched_at >= datetime('now', ?) 
  GROUP BY user
  ORDER BY count DESC
`);

const getWatchStatsByMediaTypeStmt = db.prepare(`
  SELECT media_type, COUNT(*) as count, SUM(duration) as total_duration
  FROM watch_history 
  WHERE watched_at >= datetime('now', ?) 
  GROUP BY media_type
  ORDER BY count DESC
`);

// Prepare statements for active streams
const upsertActiveStreamStmt = db.prepare(`
  INSERT INTO active_streams (
    session_id, user, title, media_type, progress, quality, device, bandwidth, is_transcoding, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(session_id) DO UPDATE SET
    progress = excluded.progress,
    updated_at = excluded.updated_at
`);

const getActiveStreamsStmt = db.prepare(`
  SELECT * FROM active_streams 
  WHERE updated_at >= datetime('now', '-5 minutes')
  ORDER BY updated_at DESC
`);

const removeOldStreamsStmt = db.prepare(`
  DELETE FROM active_streams
  WHERE updated_at < datetime('now', '-10 minutes')
`);

// Prepare statements for dashboard config
const upsertDashboardConfigStmt = db.prepare(`
  INSERT INTO dashboard_config (
    message_id, channel_id, update_interval, updated_at
  ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    message_id = excluded.message_id,
    channel_id = excluded.channel_id,
    update_interval = excluded.update_interval,
    updated_at = excluded.updated_at
`);

const getDashboardConfigStmt = db.prepare(`
  SELECT * FROM dashboard_config 
  ORDER BY updated_at DESC 
  LIMIT 1
`);

/**
 * Add a new subscription to the database
 */
export function addSubscription(userId, mediaId, mediaType, mediaTitle, episodeSubscription = false) {
  try {
    addSubscriptionStmt.run(userId, mediaId, mediaType, mediaTitle, episodeSubscription ? 1 : 0);
    return true;
  } catch (error) {
    console.error('Error adding subscription:', error);
    return false;
  }
}

/**
 * Get all subscriptions for a user
 */
export function getSubscriptions(userId) {
  try {
    return getSubscriptionsStmt.all(userId);
  } catch (error) {
    console.error('Error getting subscriptions:', error);
    return [];
  }
}

/**
 * Get subscriptions by title (case-insensitive) and media type
 */
export function getSubscriptionByTitle(title, mediaType) {
  try {
    return getSubscriptionByTitleStmt.all(title, mediaType);
  } catch (error) {
    console.error('Error getting subscription by title:', error);
    return [];
  }
}

/**
 * Remove a subscription from the database
 */
export function removeSubscription(userId, mediaId) {
  try {
    const result = removeSubscriptionStmt.run(userId, mediaId);
    return result.changes > 0;
  } catch (error) {
    console.error('Error removing subscription:', error);
    return false;
  }
}

/**
 * Update the last notified season/episode for a subscription
 */
export function updateSubscription(userId, mediaId, season, episode) {
  try {
    const result = updateSubscriptionStmt.run(season, episode, userId, mediaId);
    return result.changes > 0;
  } catch (error) {
    console.error('Error updating subscription:', error);
    return false;
  }
}

/**
 * Add a new download event to history
 */
export function addDownloadHistory(eventType, source, mediaType, title, quality, size, downloadClient, data = {}) {
  try {
    const jsonData = JSON.stringify(data);
    addDownloadHistoryStmt.run(eventType, source, mediaType, title, quality, size, downloadClient, jsonData);
    return true;
  } catch (error) {
    console.error('Error adding download history:', error);
    return false;
  }
}

/**
 * Get recent downloads
 */
export function getRecentDownloads(limit = 20) {
  try {
    const downloads = getRecentDownloadsStmt.all(limit);
    return downloads.map(download => {
      try {
        download.data = JSON.parse(download.data);
      } catch (e) {
        download.data = {};
      }
      return download;
    });
  } catch (error) {
    console.error('Error getting recent downloads:', error);
    return [];
  }
}

/**
 * Add a watch event to history
 */
export function addWatchHistory(user, title, mediaType, duration, platform, quality, sessionId) {
  try {
    addWatchHistoryStmt.run(user, title, mediaType, duration, platform, quality, sessionId);
    return true;
  } catch (error) {
    console.error('Error adding watch history:', error);
    return false;
  }
}

/**
 * Get recent watch history
 */
export function getRecentWatchHistory(limit = 20) {
  try {
    return getRecentWatchHistoryStmt.all(limit);
  } catch (error) {
    console.error('Error getting recent watch history:', error);
    return [];
  }
}

/**
 * Get watch stats by user
 */
export function getWatchStatsByUser(timeRange = '-7 days') {
  try {
    return getWatchStatsByUserStmt.all(timeRange);
  } catch (error) {
    console.error('Error getting watch stats by user:', error);
    return [];
  }
}

/**
 * Get watch stats by media type
 */
export function getWatchStatsByMediaType(timeRange = '-7 days') {
  try {
    return getWatchStatsByMediaTypeStmt.all(timeRange);
  } catch (error) {
    console.error('Error getting watch stats by media type:', error);
    return [];
  }
}

/**
 * Update or insert an active stream
 */
export function upsertActiveStream(sessionId, user, title, mediaType, progress, quality, device, bandwidth, isTranscoding) {
  try {
    upsertActiveStreamStmt.run(
      sessionId, user, title, mediaType, progress, quality, device, bandwidth, isTranscoding ? 1 : 0
    );
    return true;
  } catch (error) {
    console.error('Error upserting active stream:', error);
    return false;
  }
}

/**
 * Get active streams
 */
export function getActiveStreams() {
  try {
    return getActiveStreamsStmt.all();
  } catch (error) {
    console.error('Error getting active streams:', error);
    return [];
  }
}

/**
 * Clean up old streams
 */
export function cleanupOldStreams() {
  try {
    return removeOldStreamsStmt.run();
  } catch (error) {
    console.error('Error cleaning up old streams:', error);
    return { changes: 0 };
  }
}

/**
 * Update dashboard configuration
 */
export function updateDashboardConfig(config) {
  try {
    // Handle both object format and individual parameters for backward compatibility
    if (typeof config === 'object') {
      const messageId = config.message_id;
      const channelId = config.channel_id;
      const updateInterval = config.interval || 60000;
      
      console.log('Updating dashboard config with:', messageId, channelId, updateInterval);
      upsertDashboardConfigStmt.run(messageId, channelId, updateInterval);
    } else {
      // For backward compatibility if called with separate parameters
      const messageId = arguments[0];
      const channelId = arguments[1];
      const updateInterval = arguments[2] || 60000;
      
      console.log('Updating dashboard config (legacy) with:', messageId, channelId, updateInterval);
      upsertDashboardConfigStmt.run(messageId, channelId, updateInterval);
    }
    return true;
  } catch (error) {
    console.error('Error updating dashboard config:', error);
    return false;
  }
}

/**
 * Get dashboard configuration
 */
export function getDashboardConfig() {
  try {
    return getDashboardConfigStmt.get();
  } catch (error) {
    console.error('Error getting dashboard config:', error);
    return null;
  }
}

/**
 * Check if a watch history entry already exists for a session ID
 */
export function checkWatchHistoryExists(sessionId) {
  try {
    const checkStmt = db.prepare('SELECT id FROM watch_history WHERE session_id = ?');
    return checkStmt.get(sessionId);
  } catch (error) {
    console.error('Error checking watch history:', error);
    return null;
  }
}

/**
 * Check if a download history entry already exists for a source and title
 */
export function checkDownloadHistoryExists(source, title) {
  try {
    const checkStmt = db.prepare('SELECT id FROM download_history WHERE source = ? AND title = ? LIMIT 1');
    return checkStmt.get(source, title);
  } catch (error) {
    console.error('Error checking download history:', error);
    return null;
  }
}
