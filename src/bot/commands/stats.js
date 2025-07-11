// Minimal stubs for removed functionality
export async function handleStats(message, args = []) {
  try {
    if (message && message.reply) {
      await message.reply('Stats functionality has been removed from PlexMate.');
    }
  } catch (error) {
    console.error('Error in handleStats:', error);
  }
}

export async function initStatsModule() {
  return true;
}

export async function createDashboardEmbed() {
  return {};
}

export function createDashboardControls() {
  return [];
}
