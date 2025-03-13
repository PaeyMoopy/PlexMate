import express from 'express';
import webhookService from '../bot/services/webhooks.js';
import tautulliService from '../bot/services/tautulli.js';
import * as database from '../bot/services/database.js';

const router = express.Router();

/**
 * Route to handle Sonarr webhooks
 */
router.post('/sonarr', express.json(), async (req, res) => {
  try {
    const { body } = req;
    
    // Process the webhook
    const success = webhookService.processSonarrWebhook(body);
    
    if (success) {
      res.status(200).json({ status: 'success' });
    } else {
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  } catch (error) {
    console.error('Error processing Sonarr webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Route to handle Radarr webhooks
 */
router.post('/radarr', express.json(), async (req, res) => {
  try {
    const { body } = req;
    
    // Process the webhook
    const success = webhookService.processRadarrWebhook(body);
    
    if (success) {
      res.status(200).json({ status: 'success' });
    } else {
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  } catch (error) {
    console.error('Error processing Radarr webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Route to handle Tautulli webhooks
 * This receives play, stop, pause, resume, etc. events from Tautulli
 */
router.post('/tautulli', express.json(), async (req, res) => {
  try {
    const { body } = req;
    
    // Check if valid payload
    if (!body || !body.event) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    // Process different event types
    const event = body.event;
    console.log(`Received Tautulli webhook: ${event}`);
    
    switch (event) {
      case 'media.play':
      case 'media.resume':
        // Update active streams when media starts or resumes
        if (body.session_id && body.user) {
          database.upsertActiveStream(
            body.session_id,
            body.user,
            body.full_title || body.title,
            body.media_type,
            body.progress_percent || 0,
            body.quality || 'Unknown',
            body.player || 'Unknown',
            body.bandwidth || 0,
            body.transcode_decision === 'transcode'
          );
        }
        break;
        
      case 'media.stop':
      case 'media.pause':
        // Update active stream progress on pause/stop
        if (body.session_id && body.user) {
          database.upsertActiveStream(
            body.session_id,
            body.user,
            body.full_title || body.title,
            body.media_type,
            body.progress_percent || 0,
            body.quality || 'Unknown',
            body.player || 'Unknown',
            body.bandwidth || 0,
            body.transcode_decision === 'transcode'
          );
        }
        
        // For stop event, add watch history
        if (event === 'media.stop' && body.watched_status === 1) {
          database.addWatchHistory(
            body.user,
            body.full_title || body.title,
            body.media_type,
            body.duration || 0,
            body.player || 'Unknown',
            body.quality || 'Unknown',
            body.session_id
          );
        }
        break;
        
      default:
        // Ignore other event types
        break;
    }
    
    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Error processing Tautulli webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
