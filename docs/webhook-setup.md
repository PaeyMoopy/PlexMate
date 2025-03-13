# Webhook Setup Guide for PlexMate

This guide explains how to set up webhooks in Sonarr, Radarr, and Tautulli to work with the PlexMate bot and enable the statistics dashboard functionality.

## Prerequisites

1. PlexMate bot must be running with the webhook server enabled
2. You must have set the following environment variable:
   - `WEBHOOK_PORT` (default: 3000)
   - Other required API keys as specified in `.env.example`

## Download Client Configuration

PlexMate supports the following download clients:

### qBittorrent Setup

1. Set the following environment variables in your `.env` file:
   ```
   DOWNLOAD_CLIENT=qbittorrent
   DOWNLOAD_CLIENT_URL=http://your-qbittorrent-url:8080
   DOWNLOAD_CLIENT_USERNAME=your_qbittorrent_username
   DOWNLOAD_CLIENT_PASSWORD=your_qbittorrent_password
   ```

2. Make sure the WebUI is enabled in qBittorrent settings

### SABnzbd Setup

1. Set the following environment variables in your `.env` file:
   ```
   DOWNLOAD_CLIENT=sabnzbd
   DOWNLOAD_CLIENT_URL=http://your-sabnzbd-url:8080
   DOWNLOAD_CLIENT_API_KEY=your_sabnzbd_api_key
   ```

2. The API Key can be found in SABnzbd's Config > General section

## Setting Up Sonarr Webhooks

1. Log in to your Sonarr web interface
2. Go to **Settings** → **Connect**
3. Click the **+** button to add a new connection
4. Select **Webhook** from the list
5. Configure the webhook with the following settings:
   - **Name**: PlexMate
   - **On Grab**: Enabled ✓
   - **On Import/Upgrade**: Enabled ✓
   - **On Delete**: Enabled ✓
   - **On Series Delete**: Enabled ✓
   - **URL**: `http://your-server-ip:3000/api/webhooks/sonarr`
     - Replace `your-server-ip` with the IP address of the server running PlexMate
     - Replace `3000` with your `WEBHOOK_PORT` if different
   - **Method**: POST
6. Click **Test** to ensure the connection works
7. Click **Save**

## Setting Up Radarr Webhooks

1. Log in to your Radarr web interface
2. Go to **Settings** → **Connect**
3. Click the **+** button to add a new connection
4. Select **Webhook** from the list
5. Configure the webhook with the following settings:
   - **Name**: PlexMate
   - **On Grab**: Enabled ✓
   - **On Import/Upgrade**: Enabled ✓
   - **On Movie Delete**: Enabled ✓
   - **On Movie File Delete**: Enabled ✓
   - **URL**: `http://your-server-ip:3000/api/webhooks/radarr`
     - Replace `your-server-ip` with the IP address of the server running PlexMate
     - Replace `3000` with your `WEBHOOK_PORT` if different
   - **Method**: POST
6. Click **Test** to ensure the connection works
7. Click **Save**

## Setting Up Tautulli Webhooks

1. Log in to your Tautulli web interface
2. Go to **Settings** → **Notification Agents**
3. Click the **Add a new notification agent** button (+ icon)
4. Select **Webhook** from the list
5. Configure the webhook with the following settings:
   - **Webhook URL**: `http://your-server-ip:3000/api/webhooks/tautulli`
     - Replace `your-server-ip` with the IP address of the server running PlexMate
     - Replace `3000` with your `WEBHOOK_PORT` if different
   - **Webhook Method**: POST
   - **HTTP Headers**: 
     ```
     Content-Type: application/json
     ```

6. Go to the **Triggers** tab and enable the following triggers:
   - **Playback Start**
   - **Playback Stop**
   - **Playback Pause**
   - **Playback Resume**

7. Go to the **Data** tab and include the following parameters:
   - **JSON Data**: 
     ```json
     {
       "event": "{action}",
       "user": "{user}",
       "title": "{title}",
       "full_title": "{full_title}",
       "media_type": "{media_type}",
       "year": "{year}",
       "session_id": "{session_id}",
       "progress_percent": "{progress_percent}",
       "duration": "{duration}",
       "quality": "{quality_profile}",
       "bandwidth": "{bandwidth}",
       "player": "{player}",
       "transcode_decision": "{transcode_decision}",
       "watched_status": "{watched_status}"
     }
     ```

8. Click **Save**

## Verifying Webhook Setup

To verify that your webhooks are set up correctly:

1. In Sonarr/Radarr, you can use the **Test** button on the webhook configuration page
2. Check PlexMate logs for confirmation messages when webhooks are received
3. Run the `!stats` command in your Discord admin channel to see if data is being collected
4. Set up a dashboard with `!stats dashboard` to see real-time updates

## Troubleshooting

If webhooks are not working correctly:

1. Verify that the PlexMate bot is running and the webhook server is active
2. Check that the server IP address and port are correct
3. Check firewall settings to ensure the webhook port is accessible
4. Examine PlexMate logs for any error messages
5. Verify network connectivity between your applications and the PlexMate server
