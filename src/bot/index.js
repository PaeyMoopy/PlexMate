import { Client, GatewayIntentBits, Events } from 'discord.js';
import { handleRequest } from './commands/request.js';
import { handleSubscribe } from './commands/subscribe.js';
import { handleList } from './commands/list.js';
import { handleUnsubscribe } from './commands/unsubscribe.js';
import { handleCommands } from './commands/commands.js';
import { handleMapping } from './commands/mapping.js';
import { handleStats, initStatsModule, createDashboardEmbed, createDashboardControls } from './commands/stats.js';
import { checkForUpdates } from './commands/update.js';
import { setupWebhookServer } from './webhooks/plex.js';
import { startRequestChecking } from './services/overseerrRequests.js';
import * as database from './services/database.js';
import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

let client;

async function startBot() {
  try {
    // Load environment variables - try multiple paths to find .env
    const envPaths = [
      '.env',
      '../.env',
      '../../.env',
      resolve(process.cwd(), '.env'),
      resolve(process.cwd(), '../.env'),
      '/root/plexassistant/Plexcord/.env'
    ];

    let envLoaded = false;
    for (const path of envPaths) {
      if (existsSync(path)) {
        console.log(`Loading environment from: ${path}`);
        config({ path });
        envLoaded = true;
        break;
      }
    }

    if (!envLoaded) {
      console.log('Could not find .env file, attempting to load from process.env directly');
    }

    // Print all environment variables for debugging (mask sensitive ones)
    console.log('Environment variables loaded:');
    console.log('DISCORD_TOKEN: ' + (process.env.DISCORD_TOKEN ? '********' : 'undefined'));
    console.log('OVERSEERR_URL: ' + process.env.OVERSEERR_URL);
    console.log('OVERSEERR_API_KEY: ' + (process.env.OVERSEERR_API_KEY ? '********' : 'undefined'));
    console.log('TMDB_API_KEY: ' + (process.env.TMDB_API_KEY ? '********' : 'undefined'));
    console.log('WEBHOOK_PORT: ' + process.env.WEBHOOK_PORT);
    console.log('ALLOWED_CHANNEL_ID: ' + process.env.ALLOWED_CHANNEL_ID);
    console.log('ADMIN_CHANNEL_ID: ' + process.env.ADMIN_CHANNEL_ID);
    console.log('OVERSEERR_USER_MAP: ' + process.env.OVERSEERR_USER_MAP);
    console.log('OVERSEERR_FALLBACK_ID: ' + (process.env.OVERSEERR_FALLBACK_ID || '1 (default)'));
    console.log('TAUTULLI_URL: ' + process.env.TAUTULLI_URL);
    console.log('TAUTULLI_API_KEY: ' + (process.env.TAUTULLI_API_KEY ? '********' : 'undefined'));
    console.log('SONARR_URL: ' + process.env.SONARR_URL);
    console.log('SONARR_API_KEY: ' + (process.env.SONARR_API_KEY ? '********' : 'undefined'));
    console.log('RADARR_URL: ' + process.env.RADARR_URL);
    console.log('RADARR_API_KEY: ' + (process.env.RADARR_API_KEY ? '********' : 'undefined'));
    console.log('DOWNLOAD_CLIENT: ' + process.env.DOWNLOAD_CLIENT);
    console.log('DOWNLOAD_CLIENT_URL: ' + process.env.DOWNLOAD_CLIENT_URL);
    console.log('DOWNLOAD_CLIENT_USERNAME: ' + (process.env.DOWNLOAD_CLIENT_USERNAME ? '********' : 'undefined'));
    console.log('DOWNLOAD_CLIENT_PASSWORD: ' + (process.env.DOWNLOAD_CLIENT_PASSWORD ? '********' : 'undefined'));
    console.log('DOWNLOAD_CLIENT_API_KEY: ' + (process.env.DOWNLOAD_CLIENT_API_KEY ? '********' : 'undefined'));
    console.log('QBITTORRENT_URL: ' + process.env.QBITTORRENT_URL);
    console.log('QBITTORRENT_USERNAME: ' + (process.env.QBITTORRENT_USERNAME ? '********' : 'undefined'));
    console.log('QBITTORRENT_PASSWORD: ' + (process.env.QBITTORRENT_PASSWORD ? '********' : 'undefined'));
    console.log('DASHBOARD_UPDATE_INTERVAL: ' + process.env.DASHBOARD_UPDATE_INTERVAL);
    console.log('WEBHOOK_SECRET: ' + (process.env.WEBHOOK_SECRET ? '********' : 'undefined'));
    
    // Ensure environment variables are set using the correct URL format
    // Remove trailing slashes from URLs to prevent double slashes in API requests
    if (process.env.SONARR_URL && process.env.SONARR_URL.endsWith('/')) {
      process.env.SONARR_URL = process.env.SONARR_URL.slice(0, -1);
      console.log('Normalized SONARR_URL:', process.env.SONARR_URL);
    }
    
    if (process.env.RADARR_URL && process.env.RADARR_URL.endsWith('/')) {
      process.env.RADARR_URL = process.env.RADARR_URL.slice(0, -1);
      console.log('Normalized RADARR_URL:', process.env.RADARR_URL);
    }
    
    if (process.env.DOWNLOAD_CLIENT_URL && process.env.DOWNLOAD_CLIENT_URL.endsWith('/')) {
      process.env.DOWNLOAD_CLIENT_URL = process.env.DOWNLOAD_CLIENT_URL.slice(0, -1);
      console.log('Normalized DOWNLOAD_CLIENT_URL:', process.env.DOWNLOAD_CLIENT_URL);
    }
    
    // If using qBittorrent with generic variables, set the specific ones
    if (process.env.DOWNLOAD_CLIENT?.toLowerCase() === 'qbittorrent' && 
        !process.env.QBITTORRENT_URL && process.env.DOWNLOAD_CLIENT_URL) {
      process.env.QBITTORRENT_URL = process.env.DOWNLOAD_CLIENT_URL;
      process.env.QBITTORRENT_USERNAME = process.env.DOWNLOAD_CLIENT_USERNAME;
      process.env.QBITTORRENT_PASSWORD = process.env.DOWNLOAD_CLIENT_PASSWORD;
      console.log('Set QBITTORRENT variables from DOWNLOAD_CLIENT variables');
    }

    // Validate required settings
    const requiredSettings = [
      'DISCORD_TOKEN',
      'OVERSEERR_URL',
      'OVERSEERR_API_KEY',
      'TMDB_API_KEY',
      'ALLOWED_CHANNEL_ID',
      'OVERSEERR_USER_MAP'
    ];

    const missingSettings = requiredSettings.filter(setting => !process.env[setting]);
    if (missingSettings.length > 0) {
      throw new Error(`Missing required environment variables: ${missingSettings.join(', ')}`);
    }

    // Validate OVERSEERR_USER_MAP is valid JSON
    try {
      const userMap = JSON.parse(process.env.OVERSEERR_USER_MAP);
      if (typeof userMap !== 'object' || userMap === null) {
        throw new Error('OVERSEERR_USER_MAP must be a JSON object');
      }
    } catch (error) {
      throw new Error('OVERSEERR_USER_MAP must be a valid JSON string. Format: {"overseerr_id":"discord_id"}');
    }

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildEmojisAndStickers
      ],
      failIfNotExists: false,
      retryLimit: 5,
      presence: {
        status: 'online'
      }
    });

    // Handle connection errors
    client.on('error', error => {
      console.error('Discord client error:', error);
      // Attempt to reconnect after a delay
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        client.login(process.env.DISCORD_TOKEN).catch(console.error);
      }, 5000);
    });

    client.on('disconnect', () => {
      console.log('Discord client disconnected');
      // Attempt to reconnect after a delay
      setTimeout(() => {
        console.log('Attempting to reconnect...');
        client.login(process.env.DISCORD_TOKEN).catch(console.error);
      }, 5000);
    });

    client.once(Events.ClientReady, async () => {
      console.log('PlexMate is ready!');
      setupWebhookServer();
      startRequestChecking(); // Start checking for Overseerr requests
      
      // Initialize stats module for dashboard
      await initStatsModule(client);

      // Check for updates on startup (silent, just logs to console)
      const updateInfo = await checkForUpdates();
      if (updateInfo.hasUpdate) {
        console.log(`A new version of PlexMate is available! Current: ${updateInfo.currentVersion}, Latest: ${updateInfo.latestVersion}`);
        console.log('Run npm run update:apply to update your bot automatically.');
        console.log(`Changes in the new version:\n${updateInfo.changes}`);
      } else {
        console.log(`PlexMate is up to date (version ${updateInfo.currentVersion})`);
      }
    });

    client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;
      
      // Check if message is in allowed channel or admin channel
      const isAllowedChannel = message.channel.id === process.env.ALLOWED_CHANNEL_ID;
      const isAdminChannel = message.channel.id === process.env.ADMIN_CHANNEL_ID;
      
      // Only proceed if message is in allowed channel or admin channel
      if (!isAllowedChannel && !isAdminChannel) {
        return;
      }

      const args = message.content.split(' ');
      const command = args[0].toLowerCase();

      try {
        switch (command) {
          case '!request':
            await handleRequest(message, args.slice(1).join(' '));
            break;
          case '!subscribe':
            await handleSubscribe(message, args.slice(1).join(' '));
            break;
          case '!list':
            await handleList(message);
            break;
          case '!unsubscribe':
            await handleUnsubscribe(message);
            break;
          case '!commands':
          case '!help':
            await handleCommands(message);
            break;
          case '!mapping':
            // Admin-only command - check if user is in admin channel
            if (isAdminChannel) {
              await handleMapping(message, args.slice(1));
            } else {
              await message.reply('This command is only available in the admin channel.');
            }
            break;
          case '!stats':
            // Admin-only command - check if user is in admin channel
            if (isAdminChannel) {
              await handleStats(message, args.slice(1));
            } else {
              await message.reply('This command is only available in the admin channel.');
            }
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('Error handling command:', error);
        await message.reply('An error occurred while processing your command. Please try again later.')
          .catch(console.error);
      }
    });

    // Handle button interactions for stats dashboard
    client.on(Events.InteractionCreate, async (interaction) => {
      if (!interaction.isButton()) return;
      
      const { customId } = interaction;
      
      // Handle dashboard button clicks
      if (customId.startsWith('dashboard_')) {
        try {
          // Defer reply to avoid interaction timeout
          await interaction.deferReply({ ephemeral: true });
          
          switch (customId) {
            case 'dashboard_refresh':
              // Get dashboard config
              const dashboardConfig = database.getDashboardConfig();
              if (!dashboardConfig) {
                return await interaction.editReply('No active dashboard found.');
              }
              
              // Refresh the dashboard directly
              const dashboardChannel = client.channels.cache.get(dashboardConfig.channel_id);
              if (!dashboardChannel) {
                return await interaction.editReply('Dashboard channel not found.');
              }
              
              try {
                const dashboardMessage = await dashboardChannel.messages.fetch(dashboardConfig.message_id);
                const embed = await createDashboardEmbed();
                await dashboardMessage.edit({ 
                  embeds: [embed], 
                  components: createDashboardControls() 
                });
                await interaction.editReply('Dashboard refreshed!');
              } catch (err) {
                console.error('Error refreshing dashboard:', err);
                await interaction.editReply('Failed to refresh dashboard.');
              }
              break;
              
            case 'dashboard_scroll':
              // Get dashboard config
              const config = database.getDashboardConfig();
              if (!config) {
                return await interaction.editReply('No active dashboard found.');
              }
              
              // Send a new dashboard to the bottom of the channel
              const channel = client.channels.cache.get(config.channel_id);
              if (!channel) {
                return await interaction.editReply('Dashboard channel not found.');
              }
              
              try {
                // Create a new dashboard embed
                const embed = await createDashboardEmbed();
                
                // Send a new dashboard message
                const newDashboardMessage = await channel.send({
                  embeds: [embed],
                  components: createDashboardControls()
                });
                
                // Update the dashboard config with the new message ID
                database.updateDashboardConfig({
                  message_id: newDashboardMessage.id,
                  channel_id: channel.id,
                  user_id: interaction.user.id,
                  interval: config.interval,
                  last_updated: Date.now()
                });
                
                // Try to delete the old dashboard message
                try {
                  const oldMessage = await channel.messages.fetch(config.message_id);
                  if (oldMessage) {
                    await oldMessage.delete().catch(err => {
                      console.log('Could not delete old dashboard message:', err.message);
                    });
                  }
                } catch (err) {
                  console.log('Could not fetch old dashboard message:', err.message);
                }
                
                await interaction.editReply('Dashboard moved to bottom of chat!');
              } catch (err) {
                console.error('Error moving dashboard:', err);
                await interaction.editReply('Failed to move dashboard to bottom.');
              }
              break;
              
            case 'dashboard_streams':
              await handleStats(interaction, ['streams']);
              break;
              
            case 'dashboard_downloads':
              await handleStats(interaction, ['downloads']);
              break;
              
            case 'dashboard_history':
              await handleStats(interaction, ['history']);
              break;
              
            default:
              await interaction.editReply('Unknown button action.');
              break;
          }
        } catch (error) {
          console.error('Error handling dashboard button:', error);
          await interaction.editReply('An error occurred while processing this action.')
            .catch(console.error);
        }
      }
    });

    // Initial login
    await client.login(process.env.DISCORD_TOKEN);
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Start the bot
startBot();

// Export for use in other modules
export { client };