# Webhook Setup Guide for PlexMate

This guide explains how to set up the required API connections and webhooks for PlexMate.

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

## API Configuration

### Sonarr API Setup

1. Set the following environment variables in your `.env` file:
   ```
   SONARR_URL=http://your-sonarr-url:8989
   SONARR_API_KEY=your_sonarr_api_key
   ```

2. You can find your API key in Sonarr under Settings > General

### Radarr API Setup

1. Set the following environment variables in your `.env` file:
   ```
   RADARR_URL=http://your-radarr-url:7878
   RADARR_API_KEY=your_radarr_api_key
   ```

2. You can find your API key in Radarr under Settings > General

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

## Verifying Setup

To verify that your setup is working correctly:

1. Check PlexMate logs for any warning or error messages
2. Run the `!stats` command in your Discord admin channel to see if data is being collected
3. Set up a dashboard with `!stats dashboard` to see real-time updates

## Troubleshooting

If you're experiencing issues:

1. Verify that your environment variables are correctly set in the `.env` file
2. Check that the URLs are accessible from the server running PlexMate
3. Ensure API keys have the correct permissions
4. Check PlexMate logs for any error messages
5. Restart the PlexMate service after making changes to the `.env` file
