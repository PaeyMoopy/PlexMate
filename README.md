# PlexMate

A Discord bot for managing media requests and subscriptions with Plex and Overseerr integration.

## System Requirements

- **Node.js** (v18 or higher) - discord.js and several other dependencies require Node.js 18+
- **npm** (v8 or higher, normally included with Node.js)
- A Discord bot token
- Overseerr instance with API access
- TMDB API key

### Installing Node.js on Ubuntu

If you're running Ubuntu or another Debian-based system, you may need to update your Node.js version:

```bash
# Remove existing Node.js and related development packages (important to avoid conflicts)
sudo apt-get purge -y nodejs npm libnode-dev
sudo apt-get autoremove -y

# Add NodeSource repository for Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js 18
sudo apt-get install -y nodejs

# Verify installation
node -v  # Should show v18.x.x
npm -v   # Should show compatible npm version
```

Alternatively, you can use NVM (Node Version Manager) for easier Node.js version management:

```bash
# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

# Close and reopen your terminal or source your profile
source ~/.bashrc  # or source ~/.zshrc if using zsh

# Install Node.js 18
nvm install 18

# Use Node.js 18
nvm use 18

# Verify installation
node -v  # Should show v18.x.x
npm -v  # Should show compatible npm version
```

## Features

- Request movies and TV shows through Discord
- Subscribe to media releases and get notifications
- Receive notifications for Plex webhook events
- Get Discord notifications for Overseerr web requests
- Personalized Overseerr integration with user mapping
- Local SQLite database for easy setup and maintenance

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/PaeyMoopy/Plexcord.git

# 2. Navigate to project directory
cd Plexcord

# 3. Install dependencies
npm install

# 4. Run setup script (this will create .env template)
npm run setup

# 5. Edit .env with your credentials:
#    - DISCORD_TOKEN
#    - OVERSEERR_URL
#    - OVERSEERR_API_KEY
#    - TMDB_API_KEY
#    - ALLOWED_CHANNEL_ID
#    - OVERSEERR_USER_MAP (e.g., {"1":"123456789"})

# 6. Start the bot with PM2
npm run start:pm2

# To view logs
npx pm2 logs

# To stop the bot
npx pm2 stop all
```

## Setting Up Automatic Restart

To ensure your bot restarts automatically after system reboots or crashes:

```bash
# Save the current PM2 process list
npx pm2 save

# Generate startup script (follow the instructions displayed)
npx pm2 startup

# Configure restart behavior (restarts up to 10 times on failure)
npx pm2 restart plexmate --max-restarts 10
```

After running `npx pm2 startup`, PM2 will generate a command that you need to run with administrator privileges to complete the setup. Run this command, and your bot will automatically start when your system boots up.

## Creating a Discord Bot

Before you can run this application, you need to create a Discord bot in the Discord Developer Portal:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give your bot a name
3. Navigate to the "Bot" tab and click "Add Bot"
4. Under the "Privileged Gateway Intents" section, enable:
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
5. Copy your bot token (click "Reset Token" if needed)
6. Navigate to "OAuth2" > "URL Generator"
7. Select the following scopes:
   - `bot`
   - `applications.commands`
8. Select the following bot permissions:
   - Administrator (or more specific permissions: Send Messages, Read Message History, Embed Links)
9. Copy the generated URL and open it in your browser to add the bot to your server
10. Use the token in your `.env` file as `DISCORD_TOKEN`

## Overseerr API Setup

To connect to Overseerr:

1. Log in to your Overseerr instance as an admin
2. Go to Settings > General
3. Create a new API key
4. Copy the API key to your `.env` file as `OVERSEERR_API_KEY`
5. Add your Overseerr URL to `.env` as `OVERSEERR_URL` (e.g., `https://overseerr.yourdomain.com`)

## Setup Instructions

1. Clone the repository
2. Run the setup script:
   ```bash
   npm run setup
   ```
3. Configure your `.env` file with required credentials (see Environment Variables section)
4. Start the bot:
   ```bash
   npm start
   ```

The bot will automatically:
- Create a `data` directory for the SQLite database
- Initialize the database schema on first run
- Handle all database migrations automatically
- Configure auto-start on system reboot (Linux only)

## Auto-Start on System Boot

The setup script will help you configure the bot to start automatically when your system reboots (Linux only). It will:

1. Check if PM2 is installed and install it if needed
2. Generate the startup command for your system
3. Create a PM2 ecosystem configuration file
4. Show you the final command to run as root

After setup, you need to:
1. Run the generated startup command as root (shown during setup)
2. Start the bot with `pm2 start ecosystem.config.cjs`
3. Save the PM2 process list with `pm2 save`

## Environment Variables

```env
# Discord Bot Configuration
DISCORD_TOKEN=           # Your Discord bot token
ALLOWED_CHANNEL_ID=      # Channel ID where bot commands are allowed

# Overseerr Configuration
OVERSEERR_URL=          # Your Overseerr instance URL
OVERSEERR_API_KEY=      # Your Overseerr API key
# Map Overseerr web users to Discord users for notifications
# Format: {"overseerr_user_id":"discord_user_id"}
OVERSEERR_USER_MAP=     # e.g., {"1":"123456789"}

# TMDB Configuration
TMDB_API_KEY=           # Your TMDB API key

# Webhook Configuration
WEBHOOK_PORT=5000      # Port for Plex webhook server
```

## Bot Commands

PlexMate provides several commands for interacting with your media server:

### Media Requests
- `!request <title>` - Search for a movie or TV show and request it
  - Example: `!request Dune`
  - After searching, the bot will display options and you can select one using reactions

### Subscriptions
- `!subscribe <title>` - Subscribe to a movie or TV show for notifications when it becomes available
  - Example: `!subscribe Stranger Things`
  - Add the `-e` flag to be notified about individual episodes: `!subscribe Stranger Things -e`

### Managing Subscriptions
- `!list` - View all your current subscriptions
- `!unsubscribe <title or ID>` - Remove a subscription
  - Example: `!unsubscribe Stranger Things`

### Utilities
- `!commands` - List all available commands and their usage

## User Mapping

PlexMate supports bi-directional integration with Overseerr:
1. Discord users with Overseerr accounts can make requests using their Overseerr ID
2. Overseerr web users can receive Discord notifications for their requests
3. Users without mappings will still work using a fallback Overseerr ID

Configure mappings in your `.env` file:
```env
OVERSEERR_USER_MAP={"overseerr_id1":"discord_id1","overseerr_id2":"discord_id2"}
```

## Database

PlexMate uses a local SQLite database stored in `data/bot.db`. This provides:
- Zero configuration required
- Automatic setup and initialization
- Easy backups (just copy the .db file)
- Works offline
- No external dependencies

To backup your data, simply copy the `data/bot.db` file to a safe location.

## Troubleshooting

### Common Issues

1. **Bot not responding to commands**
   - Check that you've enabled MESSAGE CONTENT INTENT in the Discord Developer Portal
   - Verify your bot has proper permissions in the Discord server
   - Ensure commands are being used in the channel specified by ALLOWED_CHANNEL_ID

2. **Media requests failing**
   - Verify your Overseerr URL and API key are correct
   - Check that your TMDB API key is valid
   - Look for errors in the bot logs: `npx pm2 logs`

3. **User mapping not working**
   - Ensure OVERSEERR_USER_MAP is in valid JSON format
   - Double-check that Overseerr user IDs match the ones in your Overseerr installation
   - Verify Discord user IDs are correct (enable Developer Mode in Discord settings to copy IDs)

4. **Bot not starting automatically**
   - On Linux, run `npx pm2 startup` and follow the instructions
   - After starting the bot, run `npx pm2 save` to save the current process list
   - Check the PM2 logs for any error messages: `npx pm2 logs`
