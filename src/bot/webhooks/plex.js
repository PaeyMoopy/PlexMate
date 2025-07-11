import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { client } from '../index.js';
import { searchTMDB } from '../services/tmdb.js';
import { EmbedBuilder } from 'discord.js';
import { getSubscriptionByTitle, updateSubscription, removeSubscription } from '../services/database.js';
import webhookService from '../services/webhooks.js';
import * as database from '../services/database.js';
import webhookRoutes from '../../routes/webhooks.js';

export function setupWebhookServer() {
  const app = express();

  // Security middleware
  app.use(helmet());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
  app.use(limiter);

  // Body parser with size limit
  app.use(express.json({ limit: '1mb' }));

  // Store episode notifications to batch them
  const episodeNotifications = new Map(); // key: userId_showId, value: { episodes: [], timer, posterPath }

  // Helper function to normalize titles for flexible matching
  const normalizeTitle = (title) => {
    if (!title) return '';
    // Convert to lowercase, remove special characters, and trim spaces
    return title.toLowerCase()
               .replace(/[:;.,\-_!?]/g, ' ')  // Replace common punctuation with spaces
               .replace(/\s+/g, ' ')          // Replace multiple spaces with single space
               .trim();                        // Remove leading/trailing spaces
  };

  // Helper function to find subscriptions with flexible title matching
  const findSubscriptionsByTitle = (title, mediaType) => {
    // First try exact match
    const exactMatches = getSubscriptionByTitle(title, mediaType);
    if (exactMatches?.length) {
      console.log(`Found ${exactMatches.length} exact match subscription(s) for: ${title}`);
      return exactMatches;
    }
    
    // If no exact matches, get all subscriptions and filter with normalized matching
    console.log(`No exact matches for "${title}", trying flexible matching...`);
    
    // Get all subscriptions for the media type
    const allSubscriptions = getSubscriptionByTitle('%', mediaType);
    if (!allSubscriptions?.length) {
      console.log(`No subscriptions found for media type: ${mediaType}`);
      return [];
    }
    
    const normalizedSearchTitle = normalizeTitle(title);
    console.log(`Normalized search title: "${normalizedSearchTitle}"`);
    
    // Filter subscriptions using normalized title matching
    const flexibleMatches = allSubscriptions.filter(sub => {
      const normalizedSubTitle = normalizeTitle(sub.media_title);
      
      // Check if normalized titles are similar enough
      const isMatch = 
          normalizedSubTitle === normalizedSearchTitle ||
          normalizedSubTitle.includes(normalizedSearchTitle) || 
          normalizedSearchTitle.includes(normalizedSubTitle);
      
      if (isMatch) {
        console.log(`Flexible match found: "${sub.media_title}" ↔ "${title}"`);
      }
      
      return isMatch;
    });
    
    console.log(`Found ${flexibleMatches.length} flexible match subscription(s)`);
    return flexibleMatches;
  };

  // Helper function to parse episode ranges like "1-6,18,20"
  const parseEpisodeRanges = (rangeString) => {
    if (!rangeString) return [];
    
    const episodes = [];
    const ranges = rangeString.split(',');
    
    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(num => parseInt(num, 10));
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            episodes.push(i);
          }
        }
      } else {
        const episode = parseInt(range, 10);
        if (!isNaN(episode)) {
          episodes.push(episode);
        }
      }
    }
    
    return episodes;
  };

  const sendBatchedNotification = async (userId, showId) => {
    try {
      const notifications = episodeNotifications.get(`${userId}_${showId}`);
      if (!notifications || !notifications.episodes.length) return;

      // Get show details from subscription
      const subscription = getSubscriptionByTitle(userId.toString(), showId.toString());
      if (!subscription) {
        console.error('No subscription found for:', { userId, showId });
        return;
      }

      // Group episodes by season
      const seasons = notifications.episodes.reduce((acc, ep) => {
        acc[ep.season] = acc[ep.season] || [];
        acc[ep.season].push(ep.episode);
        return acc;
      }, {});

      // Create notification embed
      const embed = new EmbedBuilder()
        .setTitle(`New Episodes Available: ${subscription.media_title}`)
        .setDescription(
          Object.entries(seasons).map(([season, episodes]) =>
            `**Season ${season}**: ${episodes.length} new episode${episodes.length > 1 ? 's' : ''}` +
            (episodes.length <= 10 ? ` (Episode${episodes.length > 1 ? 's' : ''} ${episodes.sort((a, b) => a - b).join(', ')})` : '')
          ).join('\n')
        )
        .setColor(0x00ff00);

      // Add poster if available
      if (notifications.posterPath) {
        embed.setThumbnail(`https://image.tmdb.org/t/p/w500${notifications.posterPath}`);
      }

      // Send notification
      const user = await client.users.fetch(userId);
      await user.send({ embeds: [embed] });

      // Update last notified episode/season
      const success = updateSubscription(
        userId.toString(),
        showId.toString(),
        Math.max(...Object.keys(seasons).map(Number)),
        Math.max(...notifications.episodes.map(e => e.episode))
      );

      if (!success) {
        console.error('Failed to update subscription:', { userId, showId });
      }

      // Clear the notifications
      episodeNotifications.delete(`${userId}_${showId}`);
    } catch (error) {
      console.error('Error sending batched notification:', error);
    }
  };

  app.post('/webhook', async (req, res) => {
    try {
      const event = req.body;
      
      // Log the incoming webhook
      console.log('Received webhook payload:', JSON.stringify(event, null, 2));

      // Validate webhook payload
      if (!event || !event.event || !event.Metadata) {
        console.error('Invalid webhook payload received:', event);
        return res.status(400).json({ error: 'Invalid webhook payload' });
      }

      // Handle media added event
      if (event.event === 'library.new') {
        console.log('Processing library.new event');
        
        // Extract metadata information
        const { Metadata } = event;
        
        // Detect content type based on Metadata
        const metadataType = Metadata.type;
        console.log('Raw metadata type:', metadataType);
        
        // Determine content type
        // Media types: movie, show/season, episode
        // Plex types: "movie", "show", "episode"
        let contentType = 'unknown';
        
        // First check if the GUID explicitly tells us it's a movie
        if (Metadata.guid && Metadata.guid.includes('movie')) {
          console.log('Detected movie from GUID:', Metadata.guid);
          contentType = 'movie';
        } 
        // Check if library section type explicitly tells us the content type
        else if (Metadata.librarySectionType === 'movie') {
          console.log('Detected movie from library section type');
          contentType = 'movie';
        }
        // If we don't have explicit indicators, use the type field with more context
        else if (metadataType === '1' || metadataType === 'movie') {
          contentType = 'movie';
        } else if (metadataType === '2' || metadataType === 'show') {
          // Additional checks to distinguish between movies and shows
          // Movies typically don't have grandparentTitle or parentTitle
          if (!Metadata.grandparentTitle && !Metadata.parentTitle && Metadata.year) {
            // This looks more like a movie than a show
            console.log(`Detected probable movie: "${Metadata.title}" (${Metadata.year})`);
            contentType = 'movie';
          }
          // Check if this is a season or show
          else if (Metadata.parentTitle) {
            // This is likely a season (child of a show)
            contentType = 'season';
          } else {
            contentType = 'show';
          }
        } else if (metadataType === '3' || metadataType === '4' || metadataType === 'episode' || metadataType === '{type}') {
          // If grandparentTitle exists, this is definitely an episode
          if (Metadata.grandparentTitle) {
            contentType = 'episode';
          } 
          // If index contains ranges like "1-6,18,20", it's a season with multiple episodes
          else if (Metadata.index && (Metadata.index.includes('-') || Metadata.index.includes(','))) {
            contentType = 'season';
          }
        }
        
        console.log('Determined content type:', contentType);
        
        // Handle different content types
        if (contentType === 'unknown') {
          console.log('Unknown content type, ignoring webhook');
          return res.sendStatus(200);
        }
        
        // Handle movies
        if (contentType === 'movie') {
          const title = Metadata.title;
          console.log('Processing movie:', title);
          
          // Find subscriptions matching this title - NOW USING FLEXIBLE MATCHING
          const subscriptions = findSubscriptionsByTitle(title, 'movie');
          if (!subscriptions?.length) {
            console.log('No subscriptions found for movie:', title);
            return res.sendStatus(200);
          }
          
          console.log(`Found ${subscriptions.length} subscription(s) for movie:`, title);
          
          // Get poster for the movie
          const results = await searchTMDB(title, 'movie');
          const posterPath = results[0]?.poster_path;
          
          // Send notifications to subscribers
          for (const sub of subscriptions) {
            try {
              console.log('Sending movie notification to user:', sub.user_id);
              const user = await client.users.fetch(sub.user_id);
              
              const embed = new EmbedBuilder()
                .setTitle('New Movie Available! 🎉')
                .setDescription(`**${title}** is now available on Plex!`)
                .setColor(0x00ff00);

              if (posterPath) {
                embed.setThumbnail(`https://image.tmdb.org/t/p/w500${posterPath}`);
              }

              await user.send({ embeds: [embed] });

              // Remove subscription after notification
              const success = removeSubscription(sub.user_id, sub.media_id);
              if (!success) {
                console.error('Error removing subscription:', { userId: sub.user_id, mediaId: sub.media_id });
              } else {
                console.log('Successfully removed movie subscription after notification');
              }
            } catch (error) {
              console.error('Error sending movie notification:', error);
            }
          }
        } 
        // Handle episodes and seasons
        else if (contentType === 'episode' || contentType === 'season') {
          // Get show title
          const showTitle = Metadata.grandparentTitle || Metadata.parentTitle || Metadata.title;
          if (!showTitle) {
            console.log('Could not determine show title, ignoring webhook');
            return res.sendStatus(200);
          }
          
          console.log('Processing TV content for show:', showTitle);
          
          // Find subscriptions by show title - NOW USING FLEXIBLE MATCHING
          const subscriptions = findSubscriptionsByTitle(showTitle, 'tv');
          if (!subscriptions?.length) {
            console.log('No subscriptions found for show:', showTitle);
            return res.sendStatus(200);
          }
          
          console.log(`Found ${subscriptions.length} subscription(s) for show:`, showTitle);
          
          // Get series details and poster
          const results = await searchTMDB(showTitle, 'tv');
          const posterPath = results[0]?.poster_path;
          
          // Get season and episode information
          let seasonNumber = parseInt(Metadata.parentIndex, 10);
          if (isNaN(seasonNumber)) seasonNumber = 1;
          
          // For individual episodes
          if (contentType === 'episode') {
            const episodeNumber = parseInt(Metadata.index, 10);
            if (isNaN(episodeNumber)) {
              console.log('Invalid episode number, ignoring webhook');
              return res.sendStatus(200);
            }
            
            console.log(`Processing episode: Season ${seasonNumber}, Episode ${episodeNumber}`);
            
            // Process each subscription
            for (const sub of subscriptions) {
              try {
                if (sub.episode_subscription) {
                  // Batch episode notifications
                  const key = `${sub.user_id}_${sub.media_id}`;
                  const notification = episodeNotifications.get(key) || { 
                    episodes: [], 
                    timer: null,
                    posterPath
                  };
                  
                  notification.episodes.push({
                    season: seasonNumber,
                    episode: episodeNumber
                  });
                  
                  // Clear existing timer
                  if (notification.timer) {
                    clearTimeout(notification.timer);
                  }
                  
                  // Set new timer for 5 minutes
                  notification.timer = setTimeout(() => {
                    sendBatchedNotification(sub.user_id, sub.media_id);
                  }, 5 * 60 * 1000);
                  
                  episodeNotifications.set(key, notification);
                  console.log(`Added episode notification for user ${sub.user_id} (batched)`);
                } else if (!sub.episode_subscription) {
                  // For "Release only" subscriptions, only send notification if this is season 1 episode 1
                  if (seasonNumber === 1 && episodeNumber === 1) {
                    console.log('Sending show release notification to user:', sub.user_id);
                    const user = await client.users.fetch(sub.user_id);
                    
                    const embed = new EmbedBuilder()
                      .setTitle('New Show Available! 🎉')
                      .setDescription(`**${showTitle}** is now available on Plex!`)
                      .setColor(0x00ff00);
                    
                    if (posterPath) {
                      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${posterPath}`);
                    }
                    
                    await user.send({ embeds: [embed] });
                    
                    // Remove the subscription after notification
                    const success = removeSubscription(sub.user_id, sub.media_id);
                    if (!success) {
                      console.error('Error removing subscription:', { userId: sub.user_id, mediaId: sub.media_id });
                    } else {
                      console.log('Successfully removed show subscription after notification');
                    }
                  } else {
                    // Log why we're not sending a notification
                    console.log(`Skipping release notification for user ${sub.user_id}: "${showTitle}" S${seasonNumber}E${episodeNumber} - only S1E1 triggers release notifications`);
                  }
                }
              } catch (error) {
                console.error('Error processing episode subscription:', error);
              }
            }
          } 
          // For seasons with bundled episodes
          else if (contentType === 'season') {
            // Parse the episode range if available
            const episodeRange = Metadata.index || '';
            const episodes = parseEpisodeRanges(episodeRange);
            
            console.log(`Processing season ${seasonNumber} with episodes:`, episodes);
            
            if (episodes.length === 0) {
              console.log('No valid episodes found in range, ignoring webhook');
              return res.sendStatus(200);
            }
            
            // Process each subscription
            for (const sub of subscriptions) {
              try {
                if (sub.episode_subscription) {
                  // Batch notifications for all episodes
                  const key = `${sub.user_id}_${sub.media_id}`;
                  const notification = episodeNotifications.get(key) || { 
                    episodes: [], 
                    timer: null,
                    posterPath
                  };
                  
                  // Add all episodes from the range
                  for (const episodeNumber of episodes) {
                    notification.episodes.push({
                      season: seasonNumber,
                      episode: episodeNumber
                    });
                  }
                  
                  // Clear existing timer
                  if (notification.timer) {
                    clearTimeout(notification.timer);
                  }
                  
                  // Set new timer for immediate notification (1 second)
                  // Episodes are already bundled
                  notification.timer = setTimeout(() => {
                    sendBatchedNotification(sub.user_id, sub.media_id);
                  }, 1000);
                  
                  episodeNotifications.set(key, notification);
                  console.log(`Added ${episodes.length} episode notifications for user ${sub.user_id}`);
                } else if (!sub.episode_subscription) {
                  // For "release only" subscriptions - send notification for ANY new season, not just season 1
                  // If season 1 just check if episodes contains 1, otherwise send notification for any season
                  const isSeasonOne = seasonNumber === 1;
                  const containsEpisodeOne = episodes.includes(1);
                  const shouldNotify = isSeasonOne ? containsEpisodeOne : true;
                  
                  if (shouldNotify) {
                    console.log(`Sending new season notification to user ${sub.user_id} for Season ${seasonNumber}`);
                    const user = await client.users.fetch(sub.user_id);
                    
                    const embed = new EmbedBuilder()
                      .setTitle('New Season Available! 🎉')
                      .setDescription(`**${showTitle} - Season ${seasonNumber}** is now available on Plex!`)
                      .setColor(0x00ff00);
                    
                    if (posterPath) {
                      embed.setThumbnail(`https://image.tmdb.org/t/p/w500${posterPath}`);
                    }
                    
                    await user.send({ embeds: [embed] });
                    
                    // Only remove subscription for first season, keep it for future seasons
                    if (seasonNumber === 1) {
                      console.log('Removing subscription after Season 1 notification');
                      const success = removeSubscription(sub.user_id, sub.media_id);
                      if (!success) {
                        console.error('Error removing subscription:', { userId: sub.user_id, mediaId: sub.media_id });
                      } else {
                        console.log('Successfully removed show subscription after notification');
                      }
                    }
                  } else {
                    // Log why we're not sending a notification
                    if (isSeasonOne && !containsEpisodeOne) {
                      console.log(`Skipping Season 1 notification for user ${sub.user_id}: "${showTitle}" - Season 1 bundle doesn't include Episode 1`);
                    } else {
                      console.log(`Skipping notification for user ${sub.user_id}: "${showTitle}" S${seasonNumber} - Unexpected condition`);
                    }
                  }
                }
              } catch (error) {
                console.error('Error processing season subscription:', error);
              }
            }
          }
        }
      } else {
        console.log('Ignoring non-library.new event:', event.event);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Mount additional webhook routes
  app.use('/api/webhooks', webhookRoutes);

  // Add simple status endpoint
  app.get('/status', (req, res) => {
    res.status(200).json({
      status: 'online',
      time: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0'
    });
  });

  // Start server
  const port = process.env.WEBHOOK_PORT || 5000;
  app.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
    console.log(`Webhook URLs:
    - Plex: http://<your-server>:${port}/webhook
    - Sonarr: http://<your-server>:${port}/api/webhooks/sonarr
    - Radarr: http://<your-server>:${port}/api/webhooks/radarr`);
  });
}