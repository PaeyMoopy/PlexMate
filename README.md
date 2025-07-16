# PlexMate

A Discord bot for managing media requests and subscriptions with Plex and Overseerr integration. Enhance your media server with easy request management, availability notifications, and user mapping.

<a href="https://www.paypal.com/ncp/payment/DKGKXXEYNDS7S" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

[![Docker](https://img.shields.io/badge/Docker-Available-blue)](https://hub.docker.com/r/pattymurph/plexmate)
[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2)](https://discord.com/developers/applications)

## Features

- Request movies and TV shows through Discord
- Subscribe to media releases and get notifications when content is available
- Intelligent availability detection with Sonarr/Radarr integration
- Receive notifications for Plex webhook events
- Get Discord notifications for Overseerr web requests
- Personalized Overseerr integration with user mapping
- Clean and intuitive interface with pagination and reactions

Some Screenshots:

![image](https://github.com/user-attachments/assets/dec9b301-b8e7-4dcc-947b-fc725a8b3d8a)

![image](https://github.com/user-attachments/assets/8cc97267-b19a-431a-87fa-a1373272c60d)

![image](https://github.com/user-attachments/assets/f8d41dc0-e4f1-403b-b119-b4f1a5e335cf)

![image](https://github.com/user-attachments/assets/9017eaeb-3c96-40bd-8a6f-c0c76175a731)

## Prerequisites

- Docker and Docker Compose installed on your system
- Discord bot token (instructions below)
- Overseerr instance with API access
- TMDB API key
- Optional but recommended: Sonarr and Radarr instances for enhanced availability checking

## Deployment Guide

### Step 1: Create a Discord Bot

Before setting up PlexMate, you need to create a Discord bot:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give your bot a name (e.g., "PlexMate")
3. Navigate to the "Bot" tab and click "Add Bot"
4. Under the "Privileged Gateway Intents" section, enable:
   - MESSAGE CONTENT INTENT
   - SERVER MEMBERS INTENT
5. Copy your bot token (click "Reset Token" if needed)
6. Navigate to "OAuth2" > "URL Generator"
7. Select the following scopes:
   - `bot`
   - `applications.commands`
8. Select the following bot permissions:
   - Send Messages
   - Read Message History
   - Embed Links
   - Add Reactions
   - Read Message History
9. Copy the generated URL and open it in your browser to add the bot to your server

### Step 2: Get Required API Keys

#### Overseerr API Key
1. Log in to your Overseerr instance as an admin
2. Go to Settings > General
3. Create a new API key
4. Copy the API key for use in your configuration

#### TMDB API Key
1. Create an account on [The Movie Database](https://www.themoviedb.org/)
2. Go to your account settings > API
3. Request an API key for developer use
4. Copy your API key for use in your configuration

### Step 3: Set Up Docker Deployment

1. Create a directory for PlexMate:
   ```bash
   mkdir plexmate
   cd plexmate
   ```

2. Create a `docker-compose.yml` file with the following content:
   ```yaml
   version: '3'
   services:
     plexmate:
       image: pattymurph/plexmate:latest
       container_name: plexmate
       restart: unless-stopped
       ports:
         - "5000:5000"
       volumes:
         - ./data:/app/data
       environment:
         - TZ=America/New_York
         - DISCORD_TOKEN=${DISCORD_TOKEN}
         - ALLOWED_CHANNEL_ID=${ALLOWED_CHANNEL_ID}
         - ADMIN_CHANNEL_ID=${ADMIN_CHANNEL_ID}
         - OVERSEERR_URL=${OVERSEERR_URL}
         - OVERSEERR_API_KEY=${OVERSEERR_API_KEY}
         - OVERSEERR_USER_MAP=${OVERSEERR_USER_MAP}
         - OVERSEERR_FALLBACK_ID=${OVERSEERR_FALLBACK_ID}
         - TMDB_API_KEY=${TMDB_API_KEY}
         - SONARR_URL=${SONARR_URL}
         - SONARR_API_KEY=${SONARR_API_KEY}
         - RADARR_URL=${RADARR_URL}
         - RADARR_API_KEY=${RADARR_API_KEY}
         - WEBHOOK_PORT=5000
   ```

3. Create a `.env` file in the same directory with your configuration:
   ```
   # Discord configuration
   DISCORD_TOKEN=your_discord_token_here
   ALLOWED_CHANNEL_ID=your_channel_id_here
   ADMIN_CHANNEL_ID=your_admin_channel_id_here

   # Overseerr configuration
   OVERSEERR_URL=https://your.overseerr.domain
   OVERSEERR_API_KEY=your_overseerr_api_key_here
   # User map format: {"overseerr_id":"discord_id", "overseerr_id2":"discord_id2"}
   OVERSEERR_USER_MAP={"1":"discord_user_id_1","2":"discord_user_id_2"}
   OVERSEERR_FALLBACK_ID=1

   # TMDB configuration
   TMDB_API_KEY=your_tmdb_api_key_here

   # Webhook configuration (optional)
   WEBHOOK_PORT=5000

   # Optional - Sonarr/Radarr configuration for enhanced status reporting
   SONARR_URL=http://your-sonarr-instance:8989
   SONARR_API_KEY=your_sonarr_api_key
   RADARR_URL=http://your-radarr-instance:7878
   RADARR_API_KEY=your_radarr_api_key
   ```

4. Start the PlexMate bot:
   ```bash
   docker compose up -d
   ```

5. View logs to verify everything is working:
   ```bash
   docker compose logs -f
   ```

## Managing Your PlexMate Instance

### Updating PlexMate

```bash
# Pull the latest image
docker pull pattymurph/plexmate:latest

# Restart the container with the new image
docker compose down
docker compose up -d
```

### Viewing Logs

```bash
# View logs in real-time
docker compose logs -f

# View only the last 100 lines
docker compose logs --tail=100
```

### Stopping PlexMate

```bash
docker compose down
```

## Available Commands

PlexMate supports the following commands in your Discord server:

| Command | Description |
|---------|-------------|
| `!help` | Shows all available commands and their usage |
| `!request [title] (movie|tv)` | Search and request movies or TV shows. Add (movie) or (tv) to filter results |
| `!subscribe [title] [-e|-episode]` | Subscribe to get notified when content becomes available. Use -e or -episode flag for TV shows to get notifications for new episodes |
| `!list` | View your current subscriptions |
| `!unsubscribe` | Remove a subscription (supports pagination for users with many subscriptions) |
| `!mapping` | Admin command to manage Discord to Overseerr user mappings (only available in admin channel) |

## Multi-Channel Setup

PlexMate supports a multi-channel setup for better organization and security:

- **Regular Channel** (set by `ALLOWED_CHANNEL_ID`): All users can use standard commands
- **Admin Channel** (set by `ADMIN_CHANNEL_ID`): Admin-only commands are restricted to this channel
- Receive notifications for Plex webhook events
- Get Discord notifications for Overseerr web requests
- Personalized Overseerr integration with user mapping
- Local SQLite database for easy setup and maintenance

## Quick Start with Docker

```bash
# 1. Create a directory for PlexMate
mkdir plexmate
cd plexmate
```

```bash
# 2. Create docker-compose.yml and .env files (as shown in the Deployment Guide)
# Use your favorite text editor to create these files
```

```bash
# 3. Start the bot
docker compose up -d
```

```bash
# 4. View logs
docker compose logs -f
```

> **Notes on Environment Variables:**
> - The `OVERSEERR_USER_MAP` must be valid JSON with the format `{"overseerr_id":"discord_id"}`
> - Some variables like `WEBHOOK_PORT` and `OVERSEERR_FALLBACK_ID` have default values if not specified
> - All environment variables referenced in `docker-compose.yml` will be loaded from your `.env` file

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
- Check for updates on startup (silent, console-only)

## Multi-Channel Setup

PlexMate v1.0 introduces a multi-channel setup for better organization and security:

### Regular Channel
- Specified by `ALLOWED_CHANNEL_ID` in your `.env` file
- All users can use standard commands like `!request`, `!subscribe`, etc.
- Keeps media-related discussions in a dedicated channel

### Admin Channel
- Specified by `ADMIN_CHANNEL_ID` in your `.env` file
- Admin-only commands like `!mapping` are only available in this channel
- Uses Discord's built-in permission system to control access
- Server admins can configure channel permissions to restrict who can use admin commands

This design allows for better organization and security while simplifying bot configuration.

## Automatic Updates

PlexMate includes a built-in update system that checks for new versions from your GitHub repository:

### Features
- Silently checks for updates when the bot starts
- No notifications are sent to Discord users
- All updates are handled via command line

### Commands
```bash
# Check if an update is available
npm run update:check

# Apply available updates automatically
npm run update:apply
```

### Requirements
- The bot must be installed via Git
- Your repository must use semantic versioning in package.json
- The repository must have the correct GitHub owner and name configured in `src/bot/commands/update.js`

### Update Process
When using `npm run update:apply`:
1. Checks for new versions via GitHub releases API
2. Performs `git pull` to fetch the latest code
3. Runs `npm install` to install any new dependencies
4. Logs the results to the console
5. Requires a restart of the bot to apply changes

## Environment Variables

```env
# Discord Bot Configuration
DISCORD_TOKEN=           # Your Discord bot token
ALLOWED_CHANNEL_ID=      # Channel ID where bot commands are allowed
ADMIN_CHANNEL_ID=        # Channel ID where admin commands are allowed (mapping, etc.)

# Overseerr Configuration
OVERSEERR_URL=          # Your Overseerr instance URL
OVERSEERR_API_KEY=      # Your Overseerr API key
# Map Overseerr web users to Discord users for notifications
# Format: {"overseerr_user_id":"discord_user_id"}
OVERSEERR_USER_MAP=     # e.g., {"1":"123456789"}
OVERSEERR_FALLBACK_ID=  # Default ID to use for requests when no mapping exists (defaults to 1 if not set)

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
- `!unsubscribe` - View and remove subscriptions with an interactive paginated menu
  - Navigate through your subscriptions with ⬅️ and ➡️ reactions
  - Select a subscription to unsubscribe using the number reactions (1️⃣-5️⃣)
  - Each page displays up to 5 subscriptions for easy navigation

### Utilities
- `!commands` - List all available commands and their usage

## User Mapping

PlexMate supports bi-directional integration with Overseerr:
1. Discord users with Overseerr accounts can make requests using their Overseerr ID
2. Overseerr web users can receive Discord notifications for their requests
3. Users without mappings will still work using a fallback Overseerr ID

### Admin Commands for Mapping

Authorized users can manage user mappings directly through Discord in the admin channel:

```
!mapping <discord_user_id> <overseerr_user_id>
```

Example: `!mapping 265316362900078592 1`

This command updates the bot's configuration with the new mapping, enabling the user to receive notifications for their Overseerr requests.

You can also configure mappings directly in your `.env` file:
```env
OVERSEERR_USER_MAP={"overseerr_id1":"discord_id1","overseerr_id2":"discord_id2"}
```

### Fallback Overseerr ID

When a Discord user doesn't have a mapping to an Overseerr account, the bot uses a fallback ID to make requests. You can configure this with:

```env
OVERSEERR_FALLBACK_ID=1  # Replace with your preferred default Overseerr user ID
```

If not specified, it defaults to user ID 1, which is typically the admin account in Overseerr. Set this to an account that has appropriate request permissions.

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
   - Look for errors in the logs:
     - Docker: `docker compose logs -f`
     - PM2: `npx pm2 logs`

3. **User mapping not working**
   - Ensure OVERSEERR_USER_MAP is in valid JSON format
   - Double-check that Overseerr user IDs match the ones in your Overseerr installation
   - Verify Discord user IDs are correct (enable Developer Mode in Discord settings to copy IDs)

4. **Bot not starting automatically**
   - Docker: Make sure to include `restart: unless-stopped` in your docker-compose.yml
   - PM2: Run `npx pm2 startup` and follow the instructions, then run `npx pm2 save`
   - Check for error logs:
     - Docker: `docker compose logs -f`
     - PM2: `npx pm2 logs`

5. **Docker container failing to start**
   - Ensure your .env file is properly formatted and contains all required values
   - Check container logs: `docker compose logs -f`
   - Validate your volume paths in docker-compose.yml
