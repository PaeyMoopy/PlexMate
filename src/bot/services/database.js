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

// Dashboard configuration table has been removed

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
  SELECT DISTINCT user, title, media_type, platform, quality, watched_at, session_id
  FROM watch_history
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
 * Get recent downloads with additional logging
 */
export function getRecentDownloads(limit = 20) {
  try {
    console.log(`Getting recent downloads with limit: ${limit}`);
    const downloads = getRecentDownloadsStmt.all(limit);
    console.log(`Found ${downloads.length} download history entries`);
    
    // Log total entries in the table for debugging
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM download_history');
    const count = countStmt.get();
    console.log(`Total entries in download_history table: ${count.total}`);
    
    // Parse JSON data in download entries
    const result = downloads.map(download => {
      try {
        download.data = JSON.parse(download.data);
      } catch (e) {
        download.data = {};
      }
      return download;
    });
    
    return result;
  } catch (error) {
    console.error('Error getting recent downloads:', error);
    return [];
  }
}

/**
 * Get distinct downloads for display
 */
export function getDistinctRecentDownloads(limit = 10) {
  try {
    console.log(`Getting distinct recent downloads with limit: ${limit}`);
    const stmt = db.prepare(`
      SELECT DISTINCT title, media_type, quality, source, MAX(timestamp) as timestamp 
      FROM download_history 
      GROUP BY title 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    const downloads = stmt.all(limit);
    console.log(`Found ${downloads.length} distinct download history entries`);
    
    return downloads;
  } catch (error) {
    console.error('Error getting distinct download history:', error);
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
 * Get recent watch history with additional logging
 */
export function getRecentWatchHistory(limit = 20) {
  try {
    console.log(`Getting recent watch history with limit: ${limit}`);
    const result = getRecentWatchHistoryStmt.all(limit);
    console.log(`Found ${result.length} watch history entries`);
    
    // Log total entries in the table for debugging
    const countStmt = db.prepare('SELECT COUNT(*) as total FROM watch_history');
    const count = countStmt.get();
    console.log(`Total entries in watch_history table: ${count.total}`);
    
    return result;
  } catch (error) {
    console.error('Error getting recent watch history:', error);
    return [];
  }
}

/**
 * Get all watch history entries
 */
export function getAllWatchHistory() {
  try {
    const query = db.prepare('SELECT * FROM watch_history ORDER BY watched_at DESC');
    return query.all();
  } catch (error) {
    console.error('Error retrieving all watch history:', error);
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
 * Update dashboard configuration - stubbed function for compatibility
 * This function is kept as a stub to prevent errors if it's called from elsewhere
 */
export function updateDashboardConfig(config) {
  console.log('Dashboard functionality has been removed');
  return true;
}

/**
 * Get dashboard configuration - stubbed function for compatibility
 * This function is kept as a stub to prevent errors if it's called from elsewhere
 */
export function getDashboardConfig() {
  console.log('Dashboard functionality has been removed');
  return null;
}

/**
 * Check if a watch history entry already exists for a session ID
 */
export function checkWatchHistoryExists(sessionId) {
  try {
    const checkStmt = db.prepare('SELECT id FROM watch_history WHERE session_id = ?');
    console.log(`Checking if watch history exists for session ID: ${sessionId}`);
    return checkStmt.get(sessionId);
  } catch (error) {
    console.error('Error checking watch history:', error);
    return null;
  }
}

/**
 * Check if a watch history entry already exists for user and title
 * This is a backup method when session IDs are not reliable
 */
export function checkWatchHistoryExistsByUserAndTitle(user, title, mediaType) {
  try {
    const checkStmt = db.prepare('SELECT id FROM watch_history WHERE user = ? AND title = ? AND media_type = ? AND watched_at > datetime("now", "-1 hour") LIMIT 1');
    console.log(`Checking if watch history exists for user: ${user}, title: ${title}, mediaType: ${mediaType}`);
    return checkStmt.get(user, title, mediaType);
  } catch (error) {
    console.error('Error checking watch history by user and title:', error);
    return null;
  }
}

/**
 * Check if a download history entry already exists for a source and title
 */
export function checkDownloadHistoryExists(source, title) {
  try {
    const checkStmt = db.prepare('SELECT id FROM download_history WHERE source = ? AND title = ? AND timestamp > datetime("now", "-1 hour") LIMIT 1');
    console.log(`Checking if download history exists for source: ${source}, title: ${title}`);
    return checkStmt.get(source, title);
  } catch (error) {
    console.error('Error checking download history:', error);
    return null;
  }
}

/**
 * Check if a watch history entry already exists for user and title within recent timeframe
 */
export function checkRecentWatchHistoryExists(user, title, mediaType, hoursWindow = 2) {
  try {
    const checkStmt = db.prepare(
      'SELECT id FROM watch_history WHERE user = ? AND title = ? AND media_type = ? AND watched_at > datetime("now", ?) LIMIT 1'
    );
    const timeWindow = `-${hoursWindow} hours`;
    console.log(`Checking if recent watch history exists for user: ${user}, title: ${title}, within ${hoursWindow} hours`);
    return checkStmt.get(user, title, mediaType, timeWindow);
  } catch (error) {
    console.error('Error checking recent watch history:', error);
    return null;
  }
}

/**
 * Check if a download history entry already exists for a source and title within recent timeframe
 */
export function checkRecentDownloadHistoryExists(source, title, hoursWindow = 2) {
  try {
    const checkStmt = db.prepare('SELECT id FROM download_history WHERE source = ? AND title = ? AND timestamp > datetime("now", ?) LIMIT 1');
    const timeWindow = `-${hoursWindow} hours`;
    console.log(`Checking if download history exists for source: ${source}, title: ${title}, within ${hoursWindow} hours`);
    return checkStmt.get(source, title, timeWindow);
  } catch (error) {
    console.error('Error checking download history:', error);
    return null;
  }
}
