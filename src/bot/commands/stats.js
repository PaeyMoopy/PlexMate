import { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import tautulliService from '../services/tautulli.js';
import arrService from '../services/arr.js';
import downloadClientFactory from '../services/downloadClient.js';
import * as database from '../services/database.js';

// Statistics dashboard update interval in ms (default: 1 minute)
const UPDATE_INTERVAL = parseInt(process.env.DASHBOARD_UPDATE_INTERVAL || '60000', 10);

// Store active dashboards to update them periodically
const activeDashboards = new Map();

/**
 * Handler for the stats command
 * Shows the statistics dashboard in the admin channel
 */
export async function handleStats(message, args = []) {
  try {
    // Verify this is being run in the admin channel
    if (message.channel.id !== process.env.ADMIN_CHANNEL_ID) {
      return await message.reply('This command is only available in the admin channel.');
    }

    const subCommand = args[0]?.toLowerCase();

    switch (subCommand) {
      case 'streams':
        await showStreamStats(message);
        break;
      case 'downloads':
        await showDownloadStats(message);
        break;
      case 'history':
        await showHistoryStats(message, args.slice(1));
        break;
      case 'dashboard':
        await createDashboard(message);
        break;
      case 'stop':
        await stopDashboard(message);
        break;
      default:
        await showHelp(message);
        break;
    }
  } catch (error) {
    console.error('Error handling stats command:', error);
    await message.reply('An error occurred while processing the stats command. Check the logs for details.');
  }
}

/**
 * Show the help message for the stats command
 */
async function showHelp(message) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Statistics Commands')
    .setColor(0x00BFFF)
    .setDescription('The following commands are available for viewing server statistics:')
    .addFields(
      { name: '!stats streams', value: 'Show current active streams' },
      { name: '!stats downloads', value: 'Show current downloads' },
      { name: '!stats history [days]', value: 'Show watch/download history (default: 7 days)' },
      { name: '!stats dashboard', value: 'Create an auto-updating dashboard' },
      { name: '!stats stop', value: 'Stop the auto-updating dashboard' }
    )
    .setFooter({ text: 'PlexMate Admin Dashboard' })
    .setTimestamp();

  await message.reply({ embeds: [embed] });
}

/**
 * Show current active streams stats
 */
async function showStreamStats(message) {
  await message.channel.sendTyping();
  
  try {
    const activity = await tautulliService.getActivity();
    const streamData = tautulliService.formatStreamData(activity);
    
    if (!streamData || streamData.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📊 Current Streams')
        .setColor(0x00BFFF)
        .setDescription('No active streams at the moment.')
        .setFooter({ text: 'Updated' })
        .setTimestamp();
      
      return await message.reply({ embeds: [embed] });
    }
    
    // Create embed with stream information
    const embed = new EmbedBuilder()
      .setTitle(`📊 Current Streams (${streamData.length})`)
      .setColor(0x00BFFF)
      .setFooter({ text: 'Updated' })
      .setTimestamp();
    
    // Add each stream as a field
    streamData.forEach((stream, index) => {
      const progressBar = createProgressBar(stream.progress);
      const fieldValue = [
        `${progressBar} (${stream.progress}%)`,
        `${stream.quality} | ${stream.streamEmoji} ${stream.transcodeReason}`,
        `Device: ${stream.device}`,
        `Time Remaining: ${stream.timeRemaining}`
      ].join('\n');
      
      embed.addFields({
        name: `${stream.mediaTypeEmoji} ${stream.title} (${stream.user})`,
        value: fieldValue
      });
    });
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error getting stream stats:', error);
    await message.reply('Failed to retrieve stream information. Make sure Tautulli is properly configured.');
  }
}

/**
 * Show current download stats
 */
async function showDownloadStats(message) {
  await message.channel.sendTyping();
  
  try {
    // Try to get data from multiple sources
    const sonarrQueue = await getSonarrQueue();
    const radarrQueue = await getRadarrQueue();
    const downloadClientData = await getDownloadClientData();
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle('📊 Current Downloads')
      .setColor(0x00BFFF)
      .setFooter({ text: 'Updated' })
      .setTimestamp();
    
    let hasContent = false;
    
    // Add Sonarr data if available
    if (sonarrQueue && sonarrQueue.length > 0) {
      const fieldValue = sonarrQueue.map(item => {
        return `- ${item.title} (${item.progress}%) - ${item.quality}`;
      }).join('\n');
      
      embed.addFields({ name: '📺 TV Shows', value: fieldValue || 'No active downloads' });
      hasContent = true;
    }
    
    // Add Radarr data if available
    if (radarrQueue && radarrQueue.length > 0) {
      const fieldValue = radarrQueue.map(item => {
        return `- ${item.title} (${item.progress}%) - ${item.quality}`;
      }).join('\n');
      
      embed.addFields({ name: '🎬 Movies', value: fieldValue || 'No active downloads' });
      hasContent = true;
    }
    
    // Add download client data if available
    if (downloadClientData && downloadClientData.length > 0) {
      const activeDownloads = downloadClientData
        .filter(d => d.progress < 100 || (d.state && d.state.includes('download')))
        .slice(0, 5); // Limit to top 5
      
      if (activeDownloads.length > 0) {
        const clientType = downloadClientFactory.getClientType();
        const fieldValue = activeDownloads.map(download => {
          return `- ${download.name.substring(0, 30)}${download.name.length > 30 ? '...' : ''} (${download.progress}%)
            ${download.progressBar} | ${download.downloadSpeed || 'N/A'} | ETA: ${download.eta || download.timeLeft || 'N/A'}`;
        }).join('\n');
        
        embed.addFields({ 
          name: `⬇️ Download Details (${clientType})`, 
          value: '```' + fieldValue + '```' 
        });
        hasContent = true;
      }
    }
    
    if (!hasContent) {
      embed.setDescription('No active downloads currently.');
    }
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error getting download stats:', error);
    await message.reply('Failed to retrieve download information. Check your service configurations.');
  }
}

/**
 * Show watch history stats
 */
async function showHistoryStats(message, args) {
  await message.channel.sendTyping();
  
  const days = parseInt(args[0], 10) || 7;
  const timeRange = `-${days} days`;
  
  try {
    // Get stats from database
    const watchStats = database.getWatchStatsByUser(timeRange);
    const mediaTypeStats = database.getWatchStatsByMediaType(timeRange);
    const recentHistory = database.getRecentWatchHistory(10);
    const recentDownloads = database.getRecentDownloads(10);
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(`📊 History Stats (Last ${days} Days)`)
      .setColor(0x00BFFF)
      .setFooter({ text: 'PlexMate Admin Dashboard' })
      .setTimestamp();
    
    // Add watch stats by user
    if (watchStats && watchStats.length > 0) {
      const userStats = watchStats.map(stat => {
        const hours = Math.floor(stat.total_duration / 3600) || 0;
        const minutes = Math.floor((stat.total_duration % 3600) / 60) || 0;
        return `${stat.user}: ${stat.count} plays (${hours}h ${minutes}m)`;
      }).join('\n');
      
      embed.addFields({ name: '👥 Watch Stats by User', value: userStats || 'No watch data available' });
    } else {
      embed.addFields({ name: '👥 Watch Stats by User', value: 'No watch data available' });
    }
    
    // Add watch stats by media type
    if (mediaTypeStats && mediaTypeStats.length > 0) {
      const typeStats = mediaTypeStats.map(stat => {
        const hours = Math.floor(stat.total_duration / 3600) || 0;
        const minutes = Math.floor((stat.total_duration % 3600) / 60) || 0;
        const emoji = stat.media_type === 'movie' ? '🎬' : stat.media_type === 'episode' ? '📺' : '🎵';
        return `${emoji} ${stat.media_type}: ${stat.count} plays (${hours}h ${minutes}m)`;
      }).join('\n');
      
      embed.addFields({ name: '🎭 Watch Stats by Media Type', value: typeStats || 'No media type data available' });
    }
    
    // Add recent watch history
    if (recentHistory && recentHistory.length > 0) {
      const history = recentHistory.map(item => {
        const emoji = item.media_type === 'movie' ? '🎬' : item.media_type === 'episode' ? '📺' : '🎵';
        return `${emoji} ${item.title} (${item.user})`;
      }).join('\n');
      
      embed.addFields({ name: '🕒 Recent Watch History', value: history || 'No recent watch history' });
    }
    
    // Add recent download history
    if (recentDownloads && recentDownloads.length > 0) {
      const downloads = recentDownloads.map(item => {
        const emoji = item.media_type === 'movie' ? '🎬' : item.media_type === 'episode' ? '📺' : '📁';
        return `${emoji} ${item.title} (${item.event_type})`;
      }).join('\n');
      
      embed.addFields({ name: '⬇️ Recent Downloads', value: downloads || 'No recent downloads' });
    }
    
    await message.reply({ embeds: [embed] });
  } catch (error) {
    console.error('Error getting history stats:', error);
    await message.reply('Failed to retrieve history statistics from the database.');
  }
}

/**
 * Create an auto-updating dashboard
 */
async function createDashboard(message) {
  try {
    // Check if a dashboard is already active
    const existingConfig = database.getDashboardConfig();
    if (existingConfig) {
      const channelId = existingConfig.channel_id;
      if (activeDashboards.has(channelId)) {
        return await message.reply('A dashboard is already active. Use `!stats stop` to stop it first.');
      }
    }
    
    // Send the initial message for the dashboard
    const embed = await createDashboardEmbed();
    const dashboardMsg = await message.channel.send({ embeds: [embed], components: createDashboardControls() });
    
    // Save dashboard configuration
    database.updateDashboardConfig(dashboardMsg.id, message.channel.id, UPDATE_INTERVAL);
    
    // Set up interval to update the dashboard
    const intervalId = setInterval(async () => {
      try {
        const updatedEmbed = await createDashboardEmbed();
        await dashboardMsg.edit({ embeds: [updatedEmbed], components: createDashboardControls() });
      } catch (error) {
        console.error('Error updating dashboard:', error);
        clearInterval(intervalId);
        activeDashboards.delete(message.channel.id);
      }
    }, UPDATE_INTERVAL);
    
    // Store active dashboard information
    activeDashboards.set(message.channel.id, {
      messageId: dashboardMsg.id,
      intervalId
    });
    
    await message.reply(`Dashboard created! It will update every ${UPDATE_INTERVAL / 1000} seconds.`);
  } catch (error) {
    console.error('Error creating dashboard:', error);
    await message.reply('Failed to create the dashboard. Check the logs for details.');
  }
}

/**
 * Stop an active dashboard
 */
async function stopDashboard(message) {
  try {
    if (!activeDashboards.has(message.channel.id)) {
      return await message.reply('No active dashboard found in this channel.');
    }
    
    const dashboard = activeDashboards.get(message.channel.id);
    clearInterval(dashboard.intervalId);
    activeDashboards.delete(message.channel.id);
    
    await message.reply('Dashboard stopped successfully.');
  } catch (error) {
    console.error('Error stopping dashboard:', error);
    await message.reply('Failed to stop the dashboard. Check the logs for details.');
  }
}

/**
 * Create the dashboard embed with all stats
 */
async function createDashboardEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('📊 Server Stats Dashboard')
    .setColor(0x00BFFF)
    .setFooter({ text: 'Auto-updating - PlexMate Admin Dashboard' })
    .setTimestamp();
  
  try {
    // Add stream stats
    const activity = await tautulliService.getActivity().catch(() => null);
    if (activity) {
      const streamData = tautulliService.formatStreamData(activity);
      const streamCount = streamData.length;
      const streamField = streamCount > 0
        ? streamData.map(stream => {
            return `${stream.mediaTypeEmoji} **${stream.title}** (${stream.user})
            ${createProgressBar(stream.progress)} ${stream.progress}% - ${stream.quality}`;
          }).join('\n\n')
        : 'No active streams';
      
      embed.addFields({ name: `🎬 Active Streams (${streamCount})`, value: streamField });
    } else {
      embed.addFields({ name: '🎬 Active Streams', value: 'Could not connect to Tautulli' });
    }
    
    // Add download stats
    try {
      const sonarrQueue = await getSonarrQueue();
      const radarrQueue = await getRadarrQueue();
      
      const tvCount = sonarrQueue?.length || 0;
      const movieCount = radarrQueue?.length || 0;
      
      // Create download sections
      if (tvCount > 0 || movieCount > 0) {
        let downloadField = '';
        
        if (tvCount > 0) {
          downloadField += '**📺 TV Shows**\n' + sonarrQueue.map(item => {
            return `- ${item.title} (${item.progress}%)`;
          }).join('\n') + '\n\n';
        }
        
        if (movieCount > 0) {
          downloadField += '**🎬 Movies**\n' + radarrQueue.map(item => {
            return `- ${item.title} (${item.progress}%)`;
          }).join('\n');
        }
        
        embed.addFields({ name: `⬇️ Current Downloads (${tvCount + movieCount})`, value: downloadField });
      } else {
        embed.addFields({ name: '⬇️ Current Downloads', value: 'No active downloads' });
      }
    } catch (error) {
      embed.addFields({ name: '⬇️ Current Downloads', value: 'Failed to retrieve download information' });
    }
    
    // Add recent history stats
    try {
      const recentHistory = database.getRecentWatchHistory(5);
      const recentDownloads = database.getRecentDownloads(5);
      
      let historyField = '';
      
      if (recentHistory && recentHistory.length > 0) {
        historyField += '**🕒 Recent Views**\n' + recentHistory.map(item => {
          const emoji = item.media_type === 'movie' ? '🎬' : item.media_type === 'episode' ? '📺' : '🎵';
          return `${emoji} ${item.title} (${item.user})`;
        }).join('\n') + '\n\n';
      } else {
        historyField += '**🕒 Recent Views**\nNo recent views\n\n';
      }
      
      if (recentDownloads && recentDownloads.length > 0) {
        historyField += '**📥 Recent Downloads**\n' + recentDownloads.map(item => {
          const emoji = item.media_type === 'movie' ? '🎬' : item.media_type === 'episode' ? '📺' : '📁';
          return `${emoji} ${item.title} (${item.event_type})`;
        }).join('\n');
      } else {
        historyField += '**📥 Recent Downloads**\nNo recent downloads';
      }
      
      embed.addFields({ name: '📚 Recent Activity', value: historyField });
    } catch (error) {
      embed.addFields({ name: '📚 Recent Activity', value: 'Failed to retrieve recent activity' });
    }
  } catch (error) {
    console.error('Error creating dashboard embed:', error);
    embed.setDescription('An error occurred while creating the dashboard. Check the logs for details.');
  }
  
  return embed;
}

/**
 * Create dashboard control buttons
 */
function createDashboardControls() {
  const refreshButton = new ButtonBuilder()
    .setCustomId('dashboard_refresh')
    .setLabel('Refresh Now')
    .setStyle(ButtonStyle.Primary)
    .setEmoji('🔄');
  
  const streamsButton = new ButtonBuilder()
    .setCustomId('dashboard_streams')
    .setLabel('Show Streams')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📊');
  
  const downloadsButton = new ButtonBuilder()
    .setCustomId('dashboard_downloads')
    .setLabel('Show Downloads')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('⬇️');
  
  const historyButton = new ButtonBuilder()
    .setCustomId('dashboard_history')
    .setLabel('Show History')
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📚');
  
  const row = new ActionRowBuilder().addComponents(
    refreshButton, streamsButton, downloadsButton, historyButton
  );
  
  return [row];
}

/**
 * Helper function to get Sonarr queue formatted data
 */
async function getSonarrQueue() {
  try {
    const queue = await arrService.getSonarrQueue();
    return arrService.formatQueueItems(queue, 'sonarr');
  } catch (error) {
    console.error('Error getting Sonarr queue:', error);
    return [];
  }
}

/**
 * Helper function to get Radarr queue formatted data
 */
async function getRadarrQueue() {
  try {
    const queue = await arrService.getRadarrQueue();
    return arrService.formatQueueItems(queue, 'radarr');
  } catch (error) {
    console.error('Error getting Radarr queue:', error);
    return [];
  }
}

/**
 * Helper function to get download client formatted data
 */
async function getDownloadClientData() {
  try {
    return await downloadClientFactory.getDownloads();
  } catch (error) {
    console.error('Error getting download client data:', error);
    return [];
  }
}

/**
 * Create a text-based progress bar
 */
function createProgressBar(progress) {
  const barLength = 15;
  const filledLength = Math.round((progress / 100) * barLength);
  const emptyLength = barLength - filledLength;
  
  return `[${'█'.repeat(filledLength)}${' '.repeat(emptyLength)}]`;
}

/**
 * Initialize the stats module by checking for existing dashboards
 * and restoring them if needed
 */
export async function initStatsModule(client) {
  try {
    const config = database.getDashboardConfig();
    if (config) {
      const channel = client.channels.cache.get(config.channel_id);
      if (channel) {
        try {
          // Try to fetch the existing message
          const dashboardMsg = await channel.messages.fetch(config.message_id);
          if (dashboardMsg) {
            console.log('Restoring stats dashboard...');
            
            // Update the dashboard
            const embed = await createDashboardEmbed();
            await dashboardMsg.edit({ embeds: [embed], components: createDashboardControls() });
            
            // Set up interval to update the dashboard
            const intervalId = setInterval(async () => {
              try {
                const updatedEmbed = await createDashboardEmbed();
                await dashboardMsg.edit({ embeds: [updatedEmbed], components: createDashboardControls() });
              } catch (error) {
                console.error('Error updating dashboard:', error);
                clearInterval(intervalId);
                activeDashboards.delete(channel.id);
              }
            }, config.update_interval || UPDATE_INTERVAL);
            
            // Store active dashboard information
            activeDashboards.set(channel.id, {
              messageId: dashboardMsg.id,
              intervalId
            });
            
            console.log('Dashboard restored successfully!');
          }
        } catch (error) {
          console.error('Failed to restore dashboard:', error);
        }
      }
    }
  } catch (error) {
    console.error('Error initializing stats module:', error);
  }
}
