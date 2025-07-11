import express from 'express';
import webhookService from '../bot/services/webhooks.js';
import * as database from '../bot/services/database.js';
import os from 'os';
import packageJson from '../../package.json' assert { type: 'json' };
const { version } = packageJson;

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
 * Health check endpoint for container health monitoring
 * Returns system status, uptime, memory usage, and version info
 */
router.get('/health', (req, res) => {
  try {
    // Get system information
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem()
    };
    
    // Format uptime as days, hours, minutes, seconds
    const days = Math.floor(uptime / 86400);
    const hours = Math.floor((uptime % 86400) / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);
    const formattedUptime = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    
    // Return health status and system info
    res.status(200).json({
      status: 'healthy',
      version: version || '1.0.0',
      uptime: formattedUptime,
      memory: {
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`
      },
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memory: {
          total: `${Math.round(systemMemory.total / 1024 / 1024)} MB`,
          free: `${Math.round(systemMemory.free / 1024 / 1024)} MB`,
          used: `${Math.round(systemMemory.used / 1024 / 1024)} MB`,
          usedPercent: `${Math.round((systemMemory.used / systemMemory.total) * 100)}%`
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error in health check endpoint:', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

export default router;
