# PlexMate

A Discord bot for managing media requests and subscriptions with Plex and Overseerr integration. Enhance your media server with easy request management, availability notifications, and user mapping.

<a href="https://www.paypal.com/ncp/payment/DKGKXXEYNDS7S" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: 41px !important;width: 174px !important;box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;-webkit-box-shadow: 0px 3px 2px 0px rgba(190, 190, 190, 0.5) !important;" ></a>

[![Docker](https://img.shields.io/badge/Docker-Available-blue)](https://hub.docker.com/r/pattymurph/plexmate)
[![Discord](https://img.shields.io/badge/Discord-Bot-5865F2)](https://discord.com/developers/applications)

## Features

- Request movies and TV shows through Discord
- Subscribe to media releases and get notifications when content is available
- Intelligent availability detection with Sonarr/Radarr integration
- Receive notifications for Plex webhook events via Tautulli
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
- Discord bot token
- Overseerr instance with API access
- TMDB API key
- Optional but recommended: Sonarr and Radarr instances for enhanced availability checking
- Optional: Tautulli for Plex webhook notifications

## Deployment

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
| !request [title] (movie\|tv) | Search and request movies or TV shows. Add `(movie)` or `(tv)` to filter results |
| !subscribe [title] [-e\|-episode] | Subscribe to get notified when content becomes available. Use `-e` or `-episode` flag for TV shows to get notifications for new episodes |
| `!list` | View your current subscriptions |
| `!unsubscribe` | Remove a subscription (supports pagination for users with many subscriptions) |
| `!mapping` | Admin command to manage Discord to Overseerr user mappings (only available in admin channel) |

## Advanced Configuration

### Multi-Channel Setup

PlexMate supports operating in multiple Discord channels:

- **Regular Channel**: Set with `ALLOWED_CHANNEL_ID` - where most users interact with the bot
- **Admin Channel**: Set with `ADMIN_CHANNEL_ID` - restricted to admins for configuration commands

## Important Notes

- The `OVERSEERR_USER_MAP` must be valid JSON with the format `{"overseerr_id":"discord_id"}`
- Some variables like `WEBHOOK_PORT` and `OVERSEERR_FALLBACK_ID` have default values if not specified
- All environment variables referenced in `docker-compose.yml` will be loaded from your `.env` file

## Service Setup

### Discord Bot Setup

To create a Discord bot:

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give your bot a name
3. Navigate to the "Bot" tab and click "Add Bot"
4. Under "Privileged Gateway Intents", enable MESSAGE CONTENT INTENT and SERVER MEMBERS INTENT
5. Copy your bot token for your `.env` file
6. Navigate to "OAuth2" > "URL Generator", select `bot` and `applications.commands` scopes
7. Select appropriate permissions: Send Messages, Read Message History, Embed Links, Add Reactions
8. Use the generated URL to add the bot to your server

### Overseerr API Setup

To connect to Overseerr:

1. Log in to your Overseerr instance as an admin
2. Go to Settings > General
3. Create a new API key
4. Copy the API key to your `.env` file as `OVERSEERR_API_KEY`
5. Add your Overseerr URL to `.env` as `OVERSEERR_URL` (e.g., `https://overseerr.yourdomain.com`)

### Tautulli Webhook Setup

To enable notifications when new content is available on your Plex server:

1. Log in to your Tautulli instance
2. Go to Settings > Notification Agents
3. Click "Add a new notification agent"
4. Select "Webhook" as the agent
5. Configure the webhook with these settings:
   - **Webhook URL**: `http://<your-plexmate-server>:5000/webhook` (use your actual server IP or hostname)
   - **Webhook Method**: POST
   - **Content Type**: application/json
   - **Trigger Options**: Enable "Recently Added"
6. For each enabled trigger, click the gear icon and ensure JSON data is being sent
7. Test the webhook to verify the connection

> **Note**: If you've changed the default webhook port in your `.env` file using `WEBHOOK_PORT`, make sure to use that port instead of the default 5000 in the webhook URL.



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

### User Mapping

PlexMate supports bi-directional integration with Overseerr:
1. Discord users with Overseerr accounts can make requests using their Overseerr ID
2. Overseerr web users can receive Discord notifications for their requests
3. Users without mappings will still work using a fallback Overseerr ID

#### Admin Commands for Mapping

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

#### Fallback Overseerr ID

When a Discord user doesn't have a mapping to an Overseerr account, the bot uses a fallback ID to make requests. You can configure this with:

```env
OVERSEERR_FALLBACK_ID=1  # Replace with your preferred default Overseerr user ID
```

If not specified, it defaults to user ID 1, which is typically the admin account in Overseerr. Set this to an account that has appropriate request permissions.

### Database

PlexMate uses a local SQLite database stored in `data/bot.db`, mounted as a volume in Docker. To backup your data, simply copy the `data/bot.db` file to a safe location.

## Troubleshooting

### Common Issues

1. **Bot not responding to commands**
   - Check that you've enabled MESSAGE CONTENT INTENT in the Discord Developer Portal
   - Verify your bot has proper permissions in the Discord server
   - Ensure commands are being used in the channel specified by ALLOWED_CHANNEL_ID

2. **Media requests failing**
   - Verify your Overseerr URL and API key are correct
   - Check that your TMDB API key is valid
   - Look for errors with `docker compose logs -f`

3. **User mapping not working**
   - Ensure OVERSEERR_USER_MAP is in valid JSON format
   - Double-check Overseerr user IDs and Discord user IDs

4. **Docker container failing to start**
   - Ensure your .env file is properly formatted and contains all required values
   - Check container logs with `docker compose logs -f`
   - Validate your volume paths in docker-compose.yml
   - Make sure to include `restart: unless-stopped` in docker-compose.yml for automatic restarts
