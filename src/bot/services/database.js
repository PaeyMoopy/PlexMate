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


export function updateDashboardConfig(config) {
  console.log('Dashboard functionality has been removed');
  return true;
}

export function getDashboardConfig() {
  console.log('Dashboard functionality has been removed');
  return null;
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
