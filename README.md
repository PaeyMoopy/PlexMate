# PlexMate

A Discord bot for managing media requests and subscriptions with Plex and Overseerr integration.

Using mapping you can enable users in Overseerr to recieve notifications when their requests are available, even if they didnt use "!request"!


Some Screenshots:

![image](https://github.com/user-attachments/assets/dec9b301-b8e7-4dcc-947b-fc725a8b3d8a)

![image](https://github.com/user-attachments/assets/8cc97267-b19a-431a-87fa-a1373272c60d)

![image](https://github.com/user-attachments/assets/f8d41dc0-e4f1-403b-b119-b4f1a5e335cf)

![image](https://github.com/user-attachments/assets/9017eaeb-3c96-40bd-8a6f-c0c76175a731)

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
git clone https://github.com/PaeyMoopy/PlexMate.git
```
```bash
# 2. Navigate to project directory
cd PlexMate
```
```bash
# 3. Install dependencies
npm install
```
```bash
# 4. Run setup script (this will create .env template)
npm run setup
```
# 5. Create .env with your credentials:
```bash
DISCORD_TOKEN=
OVERSEERR_URL=
OVERSEERR_API_KEY=
TMDB_API_KEY=
ALLOWED_CHANNEL_ID=
ADMIN_CHANNEL_ID=
OVERSEERR_USER_MAP=({"1":"123456789"},{"2":"987654321"})
# Format: {"overseerr_user_id":"discord_user_id"}
OVERSEERR_FALLBACK_ID=  # Default ID to use for requests when no mapping exists (defaults to 1 if not set)
# Format: {"overseerr_user_id":"discord_user_id"}
```
```bash
# 6. Start the bot with PM2
npm run start:pm2
```
```bash
# To view logs
npx pm2 logs
```
```bash
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

## Tautulli Webhook Setup

To receive notifications when new media is added to your Plex server, you need to configure Tautulli webhooks:

1. Access your Tautulli web interface
2. Go to Settings > Notification Agents
3. Click "Add a new notification agent" and select "Webhook"
4. Configure the webhook with the following settings:

### Configuration Tab
- **Webhook URL**: `http://your-server-ip:WEBHOOK_PORT/webhook` (replace with your server IP and the port specified in your .env file)
- **Webhook Method**: POST
- **Content Type**: application/json

### Triggers Tab
- Enable the **Recently Added** trigger

### Conditions Tab (Optional)
- Configure any additional filtering conditions if needed (e.g., specific libraries)

### Data Tab
- Under **JSON Data**, paste exactly the following:

```json
{
  "event": "library.new",
  "user": true,
  "owner": true,
  "Account": {
    "id": "{user_id}",
    "title": "{user}"
  },
  "Server": {
    "title": "{server_name}",
    "uuid": "{server_id}"
  },
  "Player": {
    "local": true,
    "publicAddress": "{public_ip}",
    "title": "{player_name}",
    "uuid": "{player_id}"
  },
  "Metadata": {
    "librarySectionType": "{library_type}",
    "ratingKey": "{rating_key}",
    "key": "{key}",
    "guid": "{guid}",
    "librarySectionID": "{section_id}",
    "type": "{type}",
    "title": "{title}",
    "grandparentTitle": "{grandparent_title}",
    "parentTitle": "{parent_title}",
    "summary": "{summary}",
    "index": "{episode_num}",
    "parentIndex": "{season_num}",
    "year": "{year}",
    "thumb": "{thumb}",
    "art": "{art}",
    "grandparentThumb": "{grandparent_thumb}",
    "grandparentArt": "{grandparent_art}",
    "addedAt": "{added_at}",
    "updatedAt": "{updated_at}"
  }
}
```

> **IMPORTANT**: The JSON structure must match exactly as shown above for the webhook to work properly.

5. Click "Save" to save your webhook configuration
6. Test the webhook by adding a new media item to your Plex library or using Tautulli's test feature

### Testing Your Webhook

After setting up the webhook:
1. In Tautulli, navigate to your configured webhook
2. Click the "Test Notifications" button (bell icon)
3. Select "Recently Added" from the dropdown menu
4. Check the bot logs for webhook receipt confirmation: `npx pm2 logs`

If configured correctly, the webhook should trigger the notification service in PlexMate.

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
   - Look for errors in the bot logs: `npx pm2 logs`

3. **User mapping not working**
   - Ensure OVERSEERR_USER_MAP is in valid JSON format
   - Double-check that Overseerr user IDs match the ones in your Overseerr installation
   - Verify Discord user IDs are correct (enable Developer Mode in Discord settings to copy IDs)

4. **Bot not starting automatically**
   - On Linux, run `npx pm2 startup` and follow the instructions
   - After starting the bot, run `npx pm2 save` to save the current process list
   - Check the PM2 logs for any error messages: `npx pm2 logs`
