#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { createSpinner } from 'nanospinner';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');
const dataDir = path.join(__dirname, 'data');

console.log(chalk.blue.bold('┌───────────────────────────────────────┐'));
console.log(chalk.blue.bold('│  PlexMate - Docker Setup Wizard       │'));
console.log(chalk.blue.bold('└───────────────────────────────────────┘'));
console.log('');

async function main() {
  // Check if data directory exists
  const dataDirSpinner = createSpinner('Checking data directory...').start();
  try {
    await fs.access(dataDir);
    dataDirSpinner.success({ text: 'Data directory exists!' });
  } catch (error) {
    dataDirSpinner.info({ text: 'Data directory not found. Creating...' });
    try {
      await fs.mkdir(dataDir, { recursive: true });
      console.log(chalk.green('✓ Data directory created successfully!'));
    } catch (error) {
      console.error(chalk.red(`Error creating data directory: ${error.message}`));
      process.exit(1);
    }
  }

  // Check if .env file exists
  let envContent = '';
  let envExists = false;

  const envSpinner = createSpinner('Checking environment configuration...').start();
  try {
    await fs.access(envPath);
    envExists = true;
    envContent = await fs.readFile(envPath, 'utf8');
    envSpinner.success({ text: '.env file exists!' });
  } catch (error) {
    envSpinner.info({ text: '.env file not found.' });
    try {
      envContent = await fs.readFile(envExamplePath, 'utf8');
      console.log(chalk.green('Loaded template from .env.example'));
    } catch (err) {
      console.error(chalk.red(`Error reading .env.example: ${err.message}`));
      process.exit(1);
    }
  }

  if (envExists) {
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'An existing .env file was found. Do you want to reconfigure it?',
        default: false,
      }
    ]);

    if (!overwrite) {
      console.log(chalk.yellow('Using existing .env file. Skipping configuration.'));
      return showDockerInstructions();
    }
  }

  console.log(chalk.blue('\n📋 Let\'s set up your PlexMate configuration:'));
  
  // Discord configuration
  const discordConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'token',
      message: 'Enter your Discord bot token:',
      validate: input => input ? true : 'This field is required',
    },
    {
      type: 'input',
      name: 'channelId',
      message: 'Enter the channel ID where bot commands are allowed:',
      validate: input => input ? true : 'This field is required',
    },
    {
      type: 'input',
      name: 'adminChannelId',
      message: 'Enter the admin channel ID for bot management:',
      validate: input => input ? true : 'This field is required',
    }
  ]);

  // Overseerr configuration
  const overseerrConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: 'Enter your Overseerr URL (e.g., https://overseerr.yourdomain.com):',
      validate: input => input ? true : 'This field is required',
    },
    {
      type: 'input',
      name: 'apiKey',
      message: 'Enter your Overseerr API key:',
      validate: input => input ? true : 'This field is required',
    },
    {
      type: 'input',
      name: 'userMap',
      message: 'Enter Overseerr to Discord user mappings in JSON format (e.g., {"1":"123456789","2":"987654321"}):',
      default: '{"1":"123456789"}',
      validate: input => {
        try {
          JSON.parse(input.replace(/'/g, '"'));
          return true;
        } catch (e) {
          return 'Invalid JSON format';
        }
      },
      filter: input => input.replace(/'/g, '"')
    },
    {
      type: 'input',
      name: 'fallbackId',
      message: 'Enter fallback Overseerr user ID:',
      default: '1',
      validate: input => !isNaN(parseInt(input)) ? true : 'Must be a number',
    }
  ]);

  // TMDB configuration
  const tmdbConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'apiKey',
      message: 'Enter your TMDB API key:',
      validate: input => input ? true : 'This field is required',
    }
  ]);

  // Sonarr and Radarr configuration
  const arrConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'sonarrUrl',
      message: 'Enter your Sonarr URL (e.g., http://192.168.1.100:8989):',
      default: '',
    },
    {
      type: 'input',
      name: 'sonarrApiKey',
      message: 'Enter your Sonarr API key:',
      default: '',
    },
    {
      type: 'input',
      name: 'radarrUrl',
      message: 'Enter your Radarr URL (e.g., http://192.168.1.100:7878):',
      default: '',
    },
    {
      type: 'input',
      name: 'radarrApiKey',
      message: 'Enter your Radarr API key:',
      default: '',
    }
  ]);

  // Webhook configuration
  const webhookConfig = await inquirer.prompt([
    {
      type: 'input',
      name: 'port',
      message: 'Enter webhook port number:',
      default: '5000',
      validate: input => !isNaN(parseInt(input)) ? true : 'Must be a number',
    }
  ]);
  
  // Generate environment config
  const envVars = {
    'DISCORD_TOKEN': discordConfig.token,
    'ALLOWED_CHANNEL_ID': discordConfig.channelId,
    'ADMIN_CHANNEL_ID': discordConfig.adminChannelId,
    'OVERSEERR_URL': overseerrConfig.url,
    'OVERSEERR_API_KEY': overseerrConfig.apiKey,
    'OVERSEERR_USER_MAP': overseerrConfig.userMap,
    'OVERSEERR_FALLBACK_ID': overseerrConfig.fallbackId,
    'TMDB_API_KEY': tmdbConfig.apiKey,
    'SONARR_URL': arrConfig.sonarrUrl,
    'SONARR_API_KEY': arrConfig.sonarrApiKey,
    'RADARR_URL': arrConfig.radarrUrl,
    'RADARR_API_KEY': arrConfig.radarrApiKey,
    'WEBHOOK_PORT': webhookConfig.port
  };
  
  // Create new env content with user inputs
  let newEnvContent = envContent;
  
  for (const [key, value] of Object.entries(envVars)) {
    // Replace existing values or add new ones
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(newEnvContent)) {
      newEnvContent = newEnvContent.replace(regex, `${key}=${value}`);
    } else {
      newEnvContent += `\n${key}=${value}`;
    }
  }
  
  // Write to .env file
  const writeSpinner = createSpinner('Saving configuration...').start();
  try {
    await fs.writeFile(envPath, newEnvContent);
    writeSpinner.success({ text: 'Configuration saved successfully!' });
  } catch (error) {
    writeSpinner.error({ text: `Failed to save configuration: ${error.message}` });
    process.exit(1);
  }
  
  showDockerInstructions();
}

function showDockerInstructions() {
  console.log('');
  console.log(chalk.blue.bold('┌───────────────────────────────────────┐'));
  console.log(chalk.blue.bold('│             Next Steps                │'));
  console.log(chalk.blue.bold('└───────────────────────────────────────┘'));
  console.log('');
  console.log(`1. To start PlexMate with Docker, run: ${chalk.green('docker compose up -d')}`);
  console.log(`2. To view logs, run: ${chalk.green('docker compose logs -f')}`);
  console.log(`3. To stop PlexMate, run: ${chalk.green('docker compose down')}`);
  console.log('');
  console.log(chalk.blue('Bot Requirements:'));
  console.log(`- Your Discord bot needs ${chalk.yellow('SERVER MEMBERS INTENT')} enabled in the Discord Developer Portal`);
  console.log(`- Bot requires ${chalk.yellow('MESSAGE CONTENT INTENT')} to process commands`);
  console.log(`- Bot needs ${chalk.yellow('ADMINISTRATOR')} permission in your Discord server`);
  console.log('');
  console.log(chalk.gray('For more information, see the README.md file'));
}

main().catch(error => {
  console.error(chalk.red(`Setup failed: ${error.message}`));
});
