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
        '`!stats history` - Show recent history\n' +
        '`!stats addsample` - Add sample history data'
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
      case 'addsample':
        return await addSampleHistoryData(message);
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
 * Create the streams embed
 */
async function createStreamsEmbed() {
  try {
    // Get current streams from Tautulli
    const activity = await tautulliService.getActivity();
    const streams = tautulliService.formatStreamData(activity);
    
    // Store all streams in history - don't filter by progress
    if (streams && streams.length > 0) {
      streams.forEach(stream => {
        // Check if this session has already been recorded to avoid duplicates
        const existingRecord = database.checkWatchHistoryExists(stream.sessionId);
        if (!existingRecord) {
          console.log(`Recording stream in history: ${stream.title} (${stream.progress}% complete)`);
          database.addWatchHistory(
            stream.user,
            stream.title,
            stream.mediaType,
            stream.duration || 0,
            stream.player || 'Unknown',
            stream.quality || 'Unknown',
            stream.sessionId
          );
        }
      });
    }
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle('📊 Current Streams')
      .setColor(0x00BFFF)
      .setFooter({ text: 'Updated' })
      .setTimestamp();
    
    if (!streams || streams.length === 0) {
      embed.setDescription('No active streams currently.');
      return embed;
    }
    
    // Add streams to the embed
    const fieldValue = streams.map(stream => {
      return `**${stream.user}** is ${stream.state} **${stream.title}**
      🎞️ ${stream.quality} | ⏲️ ${stream.progress}% | 📱 ${stream.player} ${stream.isTranscoding ? '(⚙️ transcoding)' : ''}`;
    }).join('\n\n');
    
    embed.setDescription(fieldValue);
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
      
      // Record streams to history during dashboard refresh
      if (streamData && streamData.length > 0) {
        streamData.forEach(stream => {
          // Check if this session has already been recorded to avoid duplicates
          const existingRecord = database.checkWatchHistoryExists(stream.sessionId);
          if (!existingRecord) {
            console.log(`Dashboard refresh: Recording stream in history: ${stream.title}`);
            database.addWatchHistory(
              stream.user,
              stream.title,
              stream.mediaType,
              stream.duration || 0,
              stream.player || 'Unknown',
              stream.quality || 'Unknown',
              stream.sessionId
            );
          }
        });
      }
      
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
      
      // Record downloads to history during dashboard refresh
      // Sonarr TV Shows
      if (sonarrQueue && sonarrQueue.length > 0) {
        sonarrQueue.forEach(item => {
          // Check if this download has already been recorded
          const existingRecord = database.checkDownloadHistoryExists('sonarr', item.title);
          if (!existingRecord) {
            console.log(`Dashboard refresh: Recording TV download in history: ${item.title}`);
            database.addDownloadHistory(
              'download',
              'sonarr',
              'episode',
              item.title,
              item.quality || 'Unknown',
              item.size ? formatBytes(item.size) : 'Unknown',
              'download_in_progress',
              JSON.stringify({ id: item.id })
            );
          }
        });
      }
      
      // Radarr Movies
      if (radarrQueue && radarrQueue.length > 0) {
        radarrQueue.forEach(item => {
          // Check if this download has already been recorded
          const existingRecord = database.checkDownloadHistoryExists('radarr', item.title);
          if (!existingRecord) {
            console.log(`Dashboard refresh: Recording movie download in history: ${item.title}`);
            database.addDownloadHistory(
              'download',
              'radarr',
              'movie',
              item.title,
              item.quality || 'Unknown',
              item.size ? formatBytes(item.size) : 'Unknown',
              'download_in_progress',
              JSON.stringify({ id: item.id })
            );
          }
        });
      }
      
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
    console.log('Refreshing dashboard, activeDashboards:', Array.from(activeDashboards.keys()));
    
    // First check if there's a dashboard in the current channel using our internal tracking
    const channelId = message.channel.id;
    console.log('Current channel ID:', channelId);
    
    // Get the dashboard config from database first for reference
    const dashboardConfig = database.getDashboardConfig();
    console.log('Dashboard config from database:', dashboardConfig);
    
    if (activeDashboards.has(channelId)) {
      const dashboard = activeDashboards.get(channelId);
      console.log('Found dashboard in memory:', dashboard);
      
      try {
        const dashboardMessage = await message.channel.messages.fetch(dashboard.messageId);
        if (dashboardMessage) {
          const updatedEmbed = await createDashboardEmbed();
          await dashboardMessage.edit({ embeds: [updatedEmbed], components: createDashboardControls() });
          
          // Send ephemeral acknowledgment for refresh button
          await message.reply({ content: 'Dashboard refreshed!', ephemeral: true });
          return;
        }
      } catch (err) {
        console.error('Could not find dashboard message in memory, trying database:', err);
      }
    } else {
      console.log('No dashboard found in memory for channel:', channelId);
    }
    
    // If we get here, we need to check the database
    if (!dashboardConfig) {
      // Create a new dashboard instead of just showing an error
      console.log('No dashboard config found in database, creating a new one');
      await message.reply({ content: 'No active dashboard found. Creating a new one...', ephemeral: true });
      return await createDashboard(message);
    }
    
    console.log('Using dashboard config from database:', dashboardConfig);
    const configChannelId = dashboardConfig.channel_id;
    
    // If the config has a different channel ID than current channel, warn the user
    if (configChannelId !== channelId) {
      console.log(`Dashboard is in a different channel. Config channel: ${configChannelId}, Current channel: ${channelId}`);
      await message.reply({ 
        content: `Dashboard is in a different channel. Please go to <#${configChannelId}> to use it.`,
        ephemeral: true 
      });
      return;
    }
    
    try {
      const dashboardChannel = message.channel;
      const dashboardMessage = await dashboardChannel.messages.fetch(dashboardConfig.message_id);
      
      if (!dashboardMessage) {
        console.log('Dashboard message not found in channel, creating a new one');
        await message.reply({ content: 'Dashboard message not found. Creating a new one...', ephemeral: true });
        return await createDashboard(message);
      }
      
      const updatedEmbed = await createDashboardEmbed();
      await dashboardMessage.edit({ embeds: [updatedEmbed], components: createDashboardControls() });
      
      // Add dashboard to active trackers if it's not there
      if (!activeDashboards.has(channelId)) {
        console.log('Adding dashboard to active trackers');
        const intervalId = setInterval(async () => {
          try {
            const updatedEmbed = await createDashboardEmbed();
            await dashboardMessage.edit({ embeds: [updatedEmbed], components: createDashboardControls() });
          } catch (error) {
            console.error('Error updating dashboard:', error);
            clearInterval(intervalId);
            activeDashboards.delete(channelId);
          }
        }, UPDATE_INTERVAL);
        
        activeDashboards.set(channelId, {
          messageId: dashboardMessage.id,
          intervalId
        });
      }
      
      // Send a confirmation
      await message.reply({ content: 'Dashboard refreshed!', ephemeral: true });
    } catch (error) {
      console.error('Error finding or updating dashboard message:', error);
      await message.reply({ content: 'Dashboard message not found. Creating a new one...', ephemeral: true });
      return await createDashboard(message);
    }
  } catch (error) {
    console.error('Error refreshing dashboard:', error);
    await message.reply({ content: 'Failed to refresh dashboard. Check the logs for details.', ephemeral: true });
  }
}

/**
 * Create the downloads embed
 */
async function createDownloadsEmbed() {
  try {
    // Fetch download data using existing helper functions
    const sonarrQueue = await getSonarrQueue();
    const radarrQueue = await getRadarrQueue();
    const downloadClientData = await getDownloadClientData();
    
    // Record all downloads for history - don't filter by progress
    // Sonarr TV Shows
    if (sonarrQueue && sonarrQueue.length > 0) {
      sonarrQueue.forEach(item => {
        // Check if this download has already been recorded
        const existingRecord = database.checkDownloadHistoryExists('sonarr', item.title);
        if (!existingRecord) {
          console.log(`Recording TV download in history: ${item.title} (${item.progress}% complete)`);
          database.addDownloadHistory(
            'download',
            'sonarr',
            'episode',
            item.title,
            item.quality || 'Unknown',
            item.size ? formatBytes(item.size) : 'Unknown',
            'download_in_progress',
            JSON.stringify({ id: item.id })
          );
        }
      });
    }
    
    // Radarr Movies
    if (radarrQueue && radarrQueue.length > 0) {
      radarrQueue.forEach(item => {
        // Check if this download has already been recorded
        const existingRecord = database.checkDownloadHistoryExists('radarr', item.title);
        if (!existingRecord) {
          console.log(`Recording movie download in history: ${item.title} (${item.progress}% complete)`);
          database.addDownloadHistory(
            'download',
            'radarr',
            'movie',
            item.title,
            item.quality || 'Unknown',
            item.size ? formatBytes(item.size) : 'Unknown',
            'download_in_progress',
            JSON.stringify({ id: item.id })
          );
        }
      });
    }
    
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
        return `- ${item.title} (${item.progress}%)`;
      }).join('\n');
      
      embed.addFields({ name: '📺 TV Shows', value: fieldValue || 'No active downloads' });
      hasContent = true;
    }
    
    // Add Radarr data if available
    if (radarrQueue && radarrQueue.length > 0) {
      const fieldValue = radarrQueue.map(item => {
        return `- ${item.title} (${item.progress}%)`;
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
    
    // Get stats from database with debug logging
    console.log(`Getting watch history stats for the last ${days} days...`);
    const watchStats = database.getWatchStatsByUser(timeRange);
    console.log('Watch stats by user:', watchStats);
    
    const mediaTypeStats = database.getWatchStatsByMediaType(timeRange);
    console.log('Media type stats:', mediaTypeStats);
    
    const recentHistory = database.getRecentWatchHistory(10);
    console.log('Recent watch history:', recentHistory);
    
    const recentDownloads = database.getRecentDownloads(10);
    console.log('Recent downloads:', recentDownloads);
    
    // Create the embed
    const embed = new EmbedBuilder()
      .setTitle(`📊 History Stats (Last ${days} Days)`)
      .setColor(0x00BFFF)
      .setFooter({ text: 'PlexMate Admin Dashboard' })
      .setTimestamp();
    
    let hasContent = false;
    
    // Add user stats if available
    if (watchStats && watchStats.length > 0) {
      const fieldValue = watchStats.map(stat => {
        // Handle different column names that might come from the database
        const username = stat.username || stat.user || 'Unknown';
        const count = stat.count || 0;
        return `${username}: ${count} views`;
      }).join('\n');
      
      embed.addFields({ name: '👥 User Activity', value: fieldValue || 'No activity' });
      hasContent = true;
    }
    
    // Add media type stats if available
    if (mediaTypeStats && mediaTypeStats.length > 0) {
      const fieldValue = mediaTypeStats.map(stat => {
        // Handle different column names that might come from the database
        const mediaType = stat.mediaType || stat.media_type || 'Unknown';
        const count = stat.count || 0;
        const emoji = mediaType === 'movie' ? '🎬' : mediaType === 'episode' ? '📺' : '🎵';
        return `${emoji} ${mediaType}: ${count} views`;
      }).join('\n');
      
      embed.addFields({ name: '📊 Media Types', value: fieldValue || 'No activity' });
      hasContent = true;
    }
    
    // Add recent views if available
    if (recentHistory && recentHistory.length > 0) {
      const fieldValue = recentHistory.map(item => {
        const mediaType = item.media_type || item.mediaType || 'Unknown';
        const username = item.user || item.username || 'Unknown';
        const date = item.watched_at ? new Date(item.watched_at).toLocaleDateString() : (item.date || 'Unknown date');
        const emoji = mediaType === 'movie' ? '🎬' : mediaType === 'episode' ? '📺' : '🎵';
        return `${emoji} ${item.title} - ${username} (${date})`;
      }).join('\n');
      
      embed.addFields({ name: '🔍 Recent Views', value: fieldValue || 'No recent views' });
      hasContent = true;
    }
    
    // Add recent downloads if available
    if (recentDownloads && recentDownloads.length > 0) {
      const fieldValue = recentDownloads.map(item => {
        const mediaType = item.media_type || item.mediaType || 'Unknown';
        const date = item.timestamp ? new Date(item.timestamp).toLocaleDateString() : (item.date || 'Unknown date');
        const emoji = mediaType === 'movie' ? '🎬' : mediaType === 'episode' ? '📺' : '📁';
        return `${emoji} ${item.title} - ${item.quality || 'Unknown quality'} (${date})`;
      }).join('\n');
      
      embed.addFields({ name: '⬇️ Recent Downloads', value: fieldValue || 'No recent downloads' });
      hasContent = true;
    }
    
    if (!hasContent) {
      embed.setDescription('No recent activity found. This could be because:\n1. No data has been recorded yet\n2. The database is not capturing events correctly\n\nTry using the bot more to generate data for the history.');
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
 * Add sample history data to help test the history display
 */
async function addSampleHistoryData(message) {
  try {
    // Add sample TV shows to watch history
    database.addWatchHistory(
      'PlexUser1',
      'Succession - S03E05 - Retirement Plans',
      'episode',
      45 * 60, // 45 minutes in seconds
      'Roku TV',
      '1080p',
      'sample_session_id_1'
    );
    database.addWatchHistory(
      'PlexUser2',
      'Arcane - S01E06 - When These Walls Come Tumbling Down',
      'episode',
      40 * 60, // 40 minutes in seconds
      'Web Browser',
      '4K',
      'sample_session_id_2'
    );
    
    // Add sample movies to watch history
    database.addWatchHistory(
      'PlexUser1',
      'Dune (2021)',
      'movie',
      155 * 60, // 2 hours 35 minutes in seconds
      'Apple TV',
      '4K HDR',
      'sample_session_id_3'
    );
    database.addWatchHistory(
      'PlexUser3',
      'The Batman (2022)',
      'movie',
      176 * 60, // 2 hours 56 minutes in seconds
      'Samsung TV',
      '1080p',
      'sample_session_id_4'
    );
    
    // Add sample music to watch history
    database.addWatchHistory(
      'PlexUser2',
      'Album: 1989 - Taylor Swift',
      'track',
      45 * 60, // 45 minutes total playtime
      'Mobile App',
      '320kbps',
      'sample_session_id_5'
    );
    
    // Add sample TV show downloads
    database.addDownloadHistory(
      'download',
      'sonarr',
      'episode',
      'The Last of Us - S01E09 - Look for the Light',
      '1080p WEB-DL',
      '2.5 GB',
      'qBittorrent',
      JSON.stringify({ id: 'sample_dl_id_1' })
    );
    database.addDownloadHistory(
      'download',
      'sonarr',
      'episode',
      'House of the Dragon - S01E10 - The Black Queen',
      '4K AMZN WEB-DL',
      '8.5 GB',
      'qBittorrent',
      JSON.stringify({ id: 'sample_dl_id_2' })
    );
    
    // Add sample movie downloads
    database.addDownloadHistory(
      'download',
      'radarr',
      'movie',
      'Oppenheimer (2023)',
      '4K HDR BluRay',
      '65 GB',
      'qBittorrent',
      JSON.stringify({ id: 'sample_dl_id_3' })
    );
    database.addDownloadHistory(
      'download',
      'radarr',
      'movie',
      'Barbie (2023)',
      '1080p WEB-DL',
      '12 GB',
      'qBittorrent',
      JSON.stringify({ id: 'sample_dl_id_4' })
    );
    
    await message.reply('✅ Sample history data added successfully! Run `!stats history` to view it.');
  } catch (error) {
    console.error('Error adding sample history data:', error);
    await message.reply('❌ Failed to add sample history data. Check the logs for details.');
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
    database.updateDashboardConfig({
      message_id: dashboardMsg.id,
      channel_id: channel.id,
      user_id: isInteraction ? message.user.id : message.author.id,
      interval: UPDATE_INTERVAL,
      last_updated: Date.now()
    });
    
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
 * Format bytes to a human-readable format
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'Unknown';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
