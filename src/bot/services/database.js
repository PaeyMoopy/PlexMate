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
