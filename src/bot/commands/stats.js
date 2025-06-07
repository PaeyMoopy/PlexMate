/**
 * This file previously contained stats and dashboard functionality, which has been completely removed.
 * Only stub functions remain to maintain compatibility with imports elsewhere.
 */

/**
 * Handler for the stats command - now returns a message that the feature is removed
 */
export async function handleStats(message, args = []) {
  try {
    if (message && message.reply) {
      await message.reply('Stats functionality has been removed from PlexMate.');
    }
  } catch (error) {
    console.error('Error in handleStats stub:', error);
  }
}

/**
 * Initialize the stats module
 * This stub is only kept for backward compatibility
 */
export async function initStatsModule() {
  // Do nothing - functionality has been removed
  console.log('Stats module initialization skipped - functionality has been removed');
  return true;
}

/**
 * Stub for createDashboardEmbed functionality
 * This stub is only kept for backward compatibility
 */
export async function createDashboardEmbed() {
  // Return empty object
  return {};
}

/**
 * Stub for createDashboardControls functionality
 * This stub is only kept for backward compatibility
 */
export function createDashboardControls() {
  // Return empty array
  return [];
}
