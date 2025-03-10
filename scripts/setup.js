import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { Client, GatewayIntentBits } from 'discord.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function validateDiscordToken(token) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  try {
    await client.login(token);
    await client.destroy(); // Clean shutdown
    return true;
  } catch (error) {
    if (error.code === 'TokenInvalid') {
      console.error('\nERROR: Invalid Discord token. Please check your token and try again.');
      console.error('You can get a new token from the Discord Developer Portal:');
      console.error('https://discord.com/developers/applications\n');
    }
    return false;
  }
}

async function setup() {
  try {
    console.log('Starting setup...');

    // Create data directory
    const dataDir = join(__dirname, '..', 'data');
    if (!existsSync(dataDir)) {
      console.log('Creating data directory...');
      mkdirSync(dataDir);
    }

    // Check if .env exists
    if (!existsSync('.env')) {
      console.log('Creating .env file...');
      const envTemplate = `# Discord Bot Configuration
DISCORD_TOKEN=           # Your Discord bot token
ALLOWED_CHANNEL_ID=      # Channel ID where bot commands are allowed

# Overseerr Configuration
OVERSEERR_URL=          # Your Overseerr instance URL (e.g., http://localhost:5055)
OVERSEERR_API_KEY=      # Your Overseerr API key
OVERSEERR_USER_MAP=     # Map Overseerr IDs to Discord IDs, e.g., {"1":"123456789"}

# TMDB Configuration
TMDB_API_KEY=           # Your TMDB API key

# Webhook Configuration (for Plex notifications)
WEBHOOK_PORT=5000       # Port for webhook server`;
      
      writeFileSync('.env', envTemplate);
      console.log('\nCreated .env file template.');
      console.log('Please fill in your values and run setup again.');
      process.exit(1);
    }

    // Load and validate environment variables
    console.log('Loading environment variables...');
    const envResult = config();
    if (!envResult.parsed) {
      throw new Error('Failed to parse .env file');
    }

    // Required environment variables
    const requiredVars = [
      'DISCORD_TOKEN',
      'OVERSEERR_URL',
      'OVERSEERR_API_KEY',
      'TMDB_API_KEY',
      'WEBHOOK_PORT',
      'ALLOWED_CHANNEL_ID',
      'OVERSEERR_USER_MAP'
    ];

    const missingVars = requiredVars.filter(varName => !envResult.parsed[varName]);
    if (missingVars.length > 0) {
      console.error('\nMissing required environment variables:');
      missingVars.forEach(varName => console.error(`- ${varName}`));
      console.error('\nPlease add these variables to your .env file and run setup again.');
      process.exit(1);
    }

    // Validate Discord token
    console.log('\nValidating Discord token...');
    const isValidToken = await validateDiscordToken(envResult.parsed.DISCORD_TOKEN);
    if (!isValidToken) {
      process.exit(1);
    }
    console.log('Discord token is valid!');

    // Validate OVERSEERR_USER_MAP is valid JSON
    try {
      const userMap = JSON.parse(envResult.parsed.OVERSEERR_USER_MAP);
      if (typeof userMap !== 'object' || userMap === null) {
        throw new Error('OVERSEERR_USER_MAP must be a JSON object');
      }
    } catch (error) {
      console.error('\nERROR: Invalid OVERSEERR_USER_MAP format');
      console.error('It must be a valid JSON object mapping Overseerr IDs to Discord IDs');
      console.error('Example: {"1":"123456789","2":"987654321"}');
      process.exit(1);
    }

    // Validate OVERSEERR_URL format
    try {
      new URL(envResult.parsed.OVERSEERR_URL);
    } catch (error) {
      console.error('\nERROR: Invalid OVERSEERR_URL format');
      console.error('It must be a valid URL (e.g., http://localhost:5055)');
      process.exit(1);
    }

    console.log('\nSetup completed successfully! ✨');
    console.log('You can now start the bot with: npm run start:pm2');

  } catch (error) {
    console.error('\nSetup failed:', error.message);
    process.exit(1);
  }
}

setup();