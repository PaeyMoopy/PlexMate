#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { createSpinner } from 'nanospinner';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

// Promisify exec for async/await usage
const execPromise = promisify(exec);

// Load environment variables
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

console.log(chalk.blue.bold('┌───────────────────────────────────────┐'));
console.log(chalk.blue.bold('│  PlexMate - Setup Wizard         │'));
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
  const envSpinner = createSpinner('Checking environment configuration...').start();
  let envExists = true;
  try {
    await fs.access(envPath);
    envSpinner.success({ text: '.env file exists!' });
  } catch (error) {
    envExists = false;
    envSpinner.info({ text: '.env file not found.' });
    
    try {
      const envExampleContent = await fs.readFile(envExamplePath, 'utf8');
      await fs.writeFile(envPath, envExampleContent);
      console.log(chalk.green('✓ Created .env file from template. Please edit it with your configuration.'));
    } catch (err) {
      console.error(chalk.red(`Error creating .env file: ${err.message}`));
    }
  }

  // Validate environment variables
  if (envExists) {
    const validateSpinner = createSpinner('Validating environment variables...').start();
    const requiredVars = [
      'DISCORD_TOKEN',
      'ALLOWED_CHANNEL_ID',
      'OVERSEERR_URL',
      'OVERSEERR_API_KEY',
      'OVERSEERR_USER_MAP',
      'TMDB_API_KEY',
    ];
    
    const missingVars = requiredVars.filter(varName => !process.env[varName]);
    
    if (missingVars.length === 0) {
      validateSpinner.success({ text: 'All required variables are present!' });
      
      // Validate OVERSEERR_USER_MAP format
      try {
        const userMap = process.env.OVERSEERR_USER_MAP;
        JSON.parse(userMap);
        console.log(chalk.green('✓ OVERSEERR_USER_MAP has valid JSON format.'));
      } catch (error) {
        console.error(chalk.red(`✗ OVERSEERR_USER_MAP has invalid JSON format. Please fix it.`));
        console.log(chalk.yellow(`Example: {"1":"265316362900078592","2":"123456789"}`));
      }
    } else {
      validateSpinner.warn({ text: `Missing required variables: ${missingVars.join(', ')}` });
      console.log(chalk.yellow('Please edit your .env file to add the missing variables.'));
    }
  }
  
  // Configure auto-start on system boot (Linux only)
  if (os.platform() === 'linux') {
    const autoStartSpinner = createSpinner('Configuring auto-start on system boot...').start();
    
    // Skip interactive prompt to avoid hanging - auto-configure instead
    console.log(chalk.yellow('To configure PM2 for auto-start on boot:'));
    console.log(chalk.cyan('1. Run: sudo pm2 startup'));
    console.log(chalk.cyan('2. Run: pm2 start ecosystem.config.cjs'));
    console.log(chalk.cyan('3. Run: pm2 save'));
    
    try {
      // Create PM2 ecosystem file if it doesn't exist
      const ecosystemPath = path.join(__dirname, 'ecosystem.config.cjs');
      try {
        await fs.access(ecosystemPath);
        console.log(chalk.green('✓ PM2 ecosystem file already exists.'));
      } catch (error) {
        // Create a basic ecosystem file
        const ecosystemContent = `module.exports = {
  apps: [{
    name: "plexmate",
    script: "src/bot/index.js",
    watch: false,
    max_memory_restart: "512M",
    env: {
      NODE_ENV: "production",
    },
    restart_delay: 3000,
    max_restarts: 10
  }]
};`;
        await fs.writeFile(ecosystemPath, ecosystemContent);
        console.log(chalk.green('✓ Created PM2 ecosystem file.'));
      }
      
      autoStartSpinner.success({ text: 'Auto-start configuration prepared!' });
    } catch (error) {
      autoStartSpinner.error({ text: `Failed to configure auto-start: ${error.message}` });
    }
  }

  // Final instructions
  console.log('');
  console.log(chalk.blue.bold('┌───────────────────────────────────────┐'));
  console.log(chalk.blue.bold('│             Next Steps                │'));
  console.log(chalk.blue.bold('└───────────────────────────────────────┘'));
  console.log('');
  console.log(`1. ${envExists ? 'Verify' : 'Edit'} your .env file with the proper credentials`);
  console.log(`2. Run the bot with: ${chalk.green('npm start')}`);
  console.log(`3. For production with auto-restart, use: ${chalk.green('npm run start:pm2')}`);
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
