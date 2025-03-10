import { Client, GatewayIntentBits, Events } from 'discord.js';
import { handleRequest } from './commands/request.js';
import { handleSubscribe } from './commands/subscribe.js';
import { handleList } from './commands/list.js';
import { handleUnsubscribe } from './commands/unsubscribe.js';
import { handleCommands } from './commands/commands.js';
import { setupWebhookServer } from './webhooks/plex.js';
import { startRequestChecking } from './services/overseerrRequests.js';
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
    console.log('OVERSEERR_USER_MAP: ' + process.env.OVERSEERR_USER_MAP);

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

    client.once(Events.ClientReady, () => {
      console.log('PlexMate is ready!');
      setupWebhookServer();
      startRequestChecking(); // Start checking for Overseerr requests
    });

    client.on(Events.MessageCreate, async (message) => {
      if (message.author.bot) return;

      // Check if the message is in the allowed channel
      if (message.channel.id !== process.env.ALLOWED_CHANNEL_ID) return;

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
            await handleCommands(message);
            break;
        }
      } catch (error) {
        console.error('Error handling command:', error);
        await message.reply('An error occurred while processing your command. Please try again later.')
          .catch(console.error);
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