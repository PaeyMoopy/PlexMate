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
  // Check if this is a message or an interaction
  const isInteraction = message.isButton?.();
  
  try {
    // Determine the proper channel ID
    const channelId = isInteraction ? message.channel.id : message.channel.id;
    
    // Verify this is being run in the admin channel
    if (channelId !== process.env.ADMIN_CHANNEL_ID) {
      // Use the appropriate reply method
      if (isInteraction) {
        // For interactions that have been deferred, we use editReply
        if (message.deferred) {
          return await message.editReply('This command is only available in the admin channel.');
        } else {
          return await message.reply({ content: 'This command is only available in the admin channel.', ephemeral: true });
        }
      } else {
        return await message.reply('This command is only available in the admin channel.');
      }
    }
    
    // Handle button interactions
    if (isInteraction) {
      const buttonId = message.customId;
      
      // Handle different button actions
      switch (buttonId) {
        case 'dashboard_refresh':
          try {
            // Just refresh the current dashboard
            return await refreshDashboard(message);
          } catch (error) {
            console.error('Error refreshing dashboard:', error);
            return await message.reply({ content: 'Failed to refresh dashboard.', ephemeral: true });
          }
          
        case 'dashboard_streams':
          // Only defer if not already replied to
          if (!message.deferred && !message.replied) {
            await message.deferReply().catch(() => {
              console.log('Could not defer reply - interaction may already be replied to');
            });
          }
          return await showStreamStats(message);
          
        case 'dashboard_downloads':
          // Only defer if not already replied to
          if (!message.deferred && !message.replied) {
            await message.deferReply().catch(() => {
              console.log('Could not defer reply - interaction may already be replied to');
            });
          }
          return await showDownloadStats(message);
          
        case 'dashboard_history':
          // Only defer if not already replied to
          if (!message.deferred && !message.replied) {
            await message.deferReply().catch(() => {
              console.log('Could not defer reply - interaction may already be replied to');
            });
          }
          return await showHistoryStats(message);
          
        case 'dashboard_scroll':
          // Just refresh and scroll to bottom
          return await refreshDashboard(message, true);
          
        default:
          return await message.reply({ 
            content: 'Unknown button action.', 
            ephemeral: true 
          });
      }
    }
    
    // If no args provided, show help
    if (!args.length) {
      return await message.reply(
        '**Available Stats Commands:**\n' +
        '`!stats dashboard` - Create an auto-updating dashboard\n' +
        '`!stats start` - Start the dashboard\n' +
        '`!stats stop` - Stop the dashboard\n' +
        '`!stats streams` - Show current streams\n' +
        '`!stats downloads` - Show current downloads\n' +
        '`!stats history` - Show recent history'
      );
    }
    
    const subcommand = args[0].toLowerCase();
    
    // Handle subcommands
    switch (subcommand) {
      case 'start':
      case 'dashboard':
        return await createDashboard(message);
      case 'stop':
        return await stopDashboard(message);
      case 'streams':
        return await showStreamStats(message);
      case 'downloads':
        return await showDownloadStats(message);
      case 'history':
        return await showHistoryStats(message);
      default:
        return await message.reply('Unknown subcommand. Use `!stats` to see available commands.');
    }
  } catch (error) {
    console.error('Error handling stats command:', error);
    try {
      if (isInteraction && message.deferred) {
        await message.editReply('An error occurred while processing the stats command.');
      } else if (isInteraction) {
        await message.reply({ 
          content: 'An error occurred while processing the stats command.',
          ephemeral: true 
        }).catch(e => console.error('Could not send error response:', e));
      } else {
        await message.reply('An error occurred while processing the stats command.');
      }
    } catch (err) {
      console.error('Failed to send error response:', err);
    }
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
  try {
    const isInteraction = message.isButton?.();
    
    // Create the streams embed
    const streamsEmbed = await createStreamsEmbed();
    
    // Send the streams info
    let sentMessage;
    if (isInteraction) {
      // For button interactions, we edit the deferred reply which is now non-ephemeral
      sentMessage = await message.editReply({ embeds: [streamsEmbed] });
      
      // Set a timeout to delete the message after 30 seconds
      setTimeout(() => {
        message.deleteReply().catch(err => {
          console.log('Could not delete streams stats message:', err.message);
        });
      }, 30000);
    } else {
      sentMessage = await message.channel.send({ embeds: [streamsEmbed] });
      
      // Auto-delete after 30 seconds
      setTimeout(() => {
        if (sentMessage.deletable) {
          sentMessage.delete().catch(err => {
            console.log('Could not delete streams stats message:', err.message);
          });
        }
      }, 30000);
    }
    
    return sentMessage;
  } catch (error) {
    console.error('Error showing stream stats:', error);
    if (message.isButton?.()) {
      await message.editReply('An error occurred while fetching stream stats.');
    } else {
      await message.reply('An error occurred while fetching stream stats.');
    }
  }
}

/**
 * Show current download stats
 */
async function showDownloadStats(message) {
  try {
    const isInteraction = message.isButton?.();
    
    // Create the downloads embed
    const downloadsEmbed = await createDownloadsEmbed();
    
    // Send the downloads info
    let sentMessage;
    if (isInteraction) {
      // For button interactions, we edit the deferred reply which is now non-ephemeral
      sentMessage = await message.editReply({ embeds: [downloadsEmbed] });
      
      // Set a timeout to delete the message after 30 seconds
      setTimeout(() => {
        message.deleteReply().catch(err => {
          console.log('Could not delete downloads stats message:', err.message);
        });
      }, 30000);
    } else {
      sentMessage = await message.channel.send({ embeds: [downloadsEmbed] });
      
      // Auto-delete after 30 seconds
      setTimeout(() => {
        if (sentMessage.deletable) {
          sentMessage.delete().catch(err => {
            console.log('Could not delete downloads stats message:', err.message);
          });
        }
      }, 30000);
    }
    
    return sentMessage;
  } catch (error) {
    console.error('Error showing download stats:', error);
    if (message.isButton?.()) {
      await message.editReply('An error occurred while fetching download stats.');
    } else {
      await message.reply('An error occurred while fetching download stats.');
    }
  }
}

/**
 * Show watch history stats
 */
async function showHistoryStats(message) {
  try {
    const isInteraction = message.isButton?.();
    
    // Create the history embed
    const historyEmbed = await createHistoryEmbed();
    
    // Send the history info
    let sentMessage;
    if (isInteraction) {
      // For button interactions, we edit the deferred reply which is now non-ephemeral
      sentMessage = await message.editReply({ embeds: [historyEmbed] });
      
      // Set a timeout to delete the message after 30 seconds
      setTimeout(() => {
        message.deleteReply().catch(err => {
          console.log('Could not delete history stats message:', err.message);
        });
      }, 30000);
    } else {
      sentMessage = await message.channel.send({ embeds: [historyEmbed] });
      
      // Auto-delete after 30 seconds
      setTimeout(() => {
        if (sentMessage.deletable) {
          sentMessage.delete().catch(err => {
            console.log('Could not delete history stats message:', err.message);
          });
        }
      }, 30000);
    }
    
    return sentMessage;
  } catch (error) {
    console.error('Error showing history stats:', error);
    if (message.isButton?.()) {
      await message.editReply('An error occurred while fetching history stats.');
    } else {
      await message.reply('An error occurred while fetching history stats.');
    }
  }
}

/**
 * Create an auto-updating dashboard
 */
async function createDashboard(message) {
  try {
    // Determine if this is a message or interaction
    const isInteraction = message.isButton?.();
    const channel = isInteraction ? message.channel : message.channel;
    
    // Check if a dashboard is already active
    const existingConfig = database.getDashboardConfig();
    if (existingConfig) {
      const channelId = existingConfig.channel_id;
      if (activeDashboards.has(channelId)) {
        // Use appropriate reply method
        if (isInteraction) {
          if (message.deferred) {
            return await message.editReply('A dashboard is already active. Use `!stats stop` to stop it first.');
          } else {
            return await message.reply({ content: 'A dashboard is already active. Use `!stats stop` to stop it first.', ephemeral: true });
          }
        } else {
          return await message.reply('A dashboard is already active. Use `!stats stop` to stop it first.');
        }
      }
    }
    
    // Send the initial message for the dashboard
    const embed = await createDashboardEmbed();
    const dashboardMsg = await channel.send({ embeds: [embed], components: createDashboardControls() });
    
    // Save dashboard configuration
    database.updateDashboardConfig(dashboardMsg.id, channel.id, UPDATE_INTERVAL);
    
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
    }, UPDATE_INTERVAL);
    
    // Store active dashboard information
    activeDashboards.set(channel.id, {
      messageId: dashboardMsg.id,
      intervalId
    });
    
    return dashboardMsg;
  } catch (error) {
    console.error('Error creating dashboard:', error);
    
    // Use appropriate error handling based on message type
    const isInteraction = message.isButton?.();
    if (isInteraction) {
      if (message.deferred) {
        await message.editReply('Failed to create the dashboard. Check the logs for details.');
      } else {
        await message.reply({ content: 'Failed to create the dashboard. Check the logs for details.', ephemeral: true });
      }
    } else {
      await message.reply('Failed to create the dashboard. Check the logs for details.');
    }
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
    
  const scrollButton = new ButtonBuilder()
    .setCustomId('dashboard_scroll')
    .setLabel('Scroll')
    .setStyle(ButtonStyle.Success)
    .setEmoji('⏬');
  
  const row = new ActionRowBuilder().addComponents(
    refreshButton, streamsButton, downloadsButton, historyButton, scrollButton
  );
  
  return [row];
}

// Export for direct access in other modules
export { createDashboardEmbed, createDashboardControls };

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

/**
 * Refresh the dashboard
 */
async function refreshDashboard(message, scroll = false) {
  try {
    const dashboardConfig = database.getDashboardConfig();
    if (!dashboardConfig) {
      return await message.reply('No active dashboard found.');
    }
    
    const dashboardChannel = message.client.channels.cache.get(dashboardConfig.channel_id);
    if (!dashboardChannel) {
      return await message.reply('Dashboard channel not found.');
    }
    
    const dashboardMessage = await dashboardChannel.messages.fetch(dashboardConfig.message_id);
    if (!dashboardMessage) {
      return await message.reply('Dashboard message not found.');
    }
    
    const updatedEmbed = await createDashboardEmbed();
    await dashboardMessage.edit({ embeds: [updatedEmbed], components: createDashboardControls() });
    
    if (scroll) {
      await dashboardChannel.send({ content: `Refreshed dashboard! <#${dashboardChannel.id}>` });
    }
  } catch (error) {
    console.error('Error refreshing dashboard:', error);
    await message.reply('Failed to refresh dashboard. Check the logs for details.');
  }
}

/**
 * Create the streams embed
 */
async function createStreamsEmbed() {
  try {
    // Check if this is an interaction and if we can send typing indicator
    const activity = await tautulliService.getActivity();
    const streamData = tautulliService.formatStreamData(activity);
    
    if (!streamData || streamData.length === 0) {
      const embed = new EmbedBuilder()
        .setTitle('📊 Current Streams')
        .setColor(0x00BFFF)
        .setDescription('No active streams at the moment.')
        .setFooter({ text: 'Updated' })
        .setTimestamp();
      
      return embed;
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
    
    return embed;
  } catch (error) {
    console.error('Error creating streams embed:', error);
    const embed = new EmbedBuilder()
      .setTitle('📊 Current Streams')
      .setColor(0x00BFFF)
      .setDescription('Failed to retrieve stream information. Check the logs for details.')
      .setFooter({ text: 'Updated' })
      .setTimestamp();
    
    return embed;
  }
}

/**
 * Create the downloads embed
 */
async function createDownloadsEmbed() {
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
    
    return embed;
  } catch (error) {
    console.error('Error creating downloads embed:', error);
    const embed = new EmbedBuilder()
      .setTitle('📊 Current Downloads')
      .setColor(0x00BFFF)
      .setDescription('Failed to retrieve download information. Check the logs for details.')
      .setFooter({ text: 'Updated' })
      .setTimestamp();
    
    return embed;
  }
}

/**
 * Create the history embed
 */
async function createHistoryEmbed() {
  try {
    const days = 7;
    const timeRange = `-${days} days`;
    
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
    
    // Add user stats if available
    if (watchStats && watchStats.length > 0) {
      const fieldValue = watchStats.map(stat => {
        return `${stat.username}: ${stat.count} views`;
      }).join('\n');
      
      embed.addFields({ name: '👥 User Activity', value: fieldValue || 'No activity' });
    }
    
    // Add media type stats if available
    if (mediaTypeStats && mediaTypeStats.length > 0) {
      const fieldValue = mediaTypeStats.map(stat => {
        const emoji = stat.mediaType === 'movie' ? '🎬' : stat.mediaType === 'episode' ? '📺' : '🎵';
        return `${emoji} ${stat.mediaType}: ${stat.count} views`;
      }).join('\n');
      
      embed.addFields({ name: '📊 Media Types', value: fieldValue || 'No activity' });
    }
    
    // Add recent views if available
    if (recentHistory && recentHistory.length > 0) {
      const fieldValue = recentHistory.map(item => {
        const emoji = item.media_type === 'movie' ? '🎬' : item.media_type === 'episode' ? '📺' : '🎵';
        return `${emoji} ${item.title} - ${item.username} (${item.date})`;
      }).join('\n');
      
      embed.addFields({ name: '🔍 Recent Views', value: fieldValue || 'No recent views' });
    }
    
    // Add recent downloads if available
    if (recentDownloads && recentDownloads.length > 0) {
      const fieldValue = recentDownloads.map(item => {
        const emoji = item.media_type === 'movie' ? '🎬' : item.media_type === 'episode' ? '📺' : '📁';
        return `${emoji} ${item.title} - ${item.quality} (${item.date})`;
      }).join('\n');
      
      embed.addFields({ name: '⬇️ Recent Downloads', value: fieldValue || 'No recent downloads' });
    }
    
    return embed;
  } catch (error) {
    console.error('Error creating history embed:', error);
    const embed = new EmbedBuilder()
      .setTitle('📊 History Stats')
      .setColor(0x00BFFF)
      .setDescription('Failed to retrieve history information. Check the logs for details.')
      .setFooter({ text: 'PlexMate Admin Dashboard' })
      .setTimestamp();
    
    return embed;
  }
}

/**
 * Create an auto-updating dashboard
 */
async function createDashboard(message) {
  try {
    // Determine if this is a message or interaction
    const isInteraction = message.isButton?.();
    const channel = isInteraction ? message.channel : message.channel;
    
    // Check if a dashboard is already active
    const existingConfig = database.getDashboardConfig();
    if (existingConfig) {
      const channelId = existingConfig.channel_id;
      if (activeDashboards.has(channelId)) {
        // Use appropriate reply method
        if (isInteraction) {
          if (message.deferred) {
            return await message.editReply('A dashboard is already active. Use `!stats stop` to stop it first.');
          } else {
            return await message.reply({ content: 'A dashboard is already active. Use `!stats stop` to stop it first.', ephemeral: true });
          }
        } else {
          return await message.reply('A dashboard is already active. Use `!stats stop` to stop it first.');
        }
      }
    }
    
    // Send the initial message for the dashboard
    const embed = await createDashboardEmbed();
    const dashboardMsg = await channel.send({ embeds: [embed], components: createDashboardControls() });
    
    // Save dashboard configuration
    database.updateDashboardConfig(dashboardMsg.id, channel.id, UPDATE_INTERVAL);
    
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
    }, UPDATE_INTERVAL);
    
    // Store active dashboard information
    activeDashboards.set(channel.id, {
      messageId: dashboardMsg.id,
      intervalId
    });
    
    return dashboardMsg;
  } catch (error) {
    console.error('Error creating dashboard:', error);
    
    // Use appropriate error handling based on message type
    const isInteraction = message.isButton?.();
    if (isInteraction) {
      if (message.deferred) {
        await message.editReply('Failed to create the dashboard. Check the logs for details.');
      } else {
        await message.reply({ content: 'Failed to create the dashboard. Check the logs for details.', ephemeral: true });
      }
    } else {
      await message.reply('Failed to create the dashboard. Check the logs for details.');
    }
  }
}
