import fetch from 'node-fetch';
import { client } from '../index.js';
import { getDiscordId, botInitiatedRequestIds, getMediaDetails } from './overseerr.js';
import { EmbedBuilder } from 'discord.js';
import { addSubscription } from '../services/database.js';

// Utility functions to get environment variables when needed
function getOverseerrUrl() {
  const url = process.env.OVERSEERR_URL?.trim();
  if (!url) {
    console.error('OVERSEERR_URL is empty or undefined! Check your .env file.');
  }
  return url;
}

function getOverseerrApiKey() {
  const key = process.env.OVERSEERR_API_KEY?.trim();
  if (!key) {
    console.error('OVERSEERR_API_KEY is empty or undefined! Check your .env file.');
  }
  return key;
}

// Keep track of the last request ID we've processed
let lastProcessedRequestId = 0;

async function getRequests() {
  try {
    console.log('[Overseerr Requests] Fetching recent requests from Overseerr...');
    const url = getOverseerrUrl();
    const apiKey = getOverseerrApiKey();
    
    console.log(`[Overseerr Requests] Using URL: ${url}/api/v1/request?take=20&skip=0&sort=added`);
    
    const response = await fetch(
      `${url}/api/v1/request?take=20&skip=0&sort=added`,
      {
        headers: {
          'X-Api-Key': apiKey
        }
      }
    );

    if (!response.ok) {
      console.error(`[Overseerr Requests] API Error: ${response.status} ${response.statusText}`);
      throw new Error(`Failed to fetch requests: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Overseerr Requests] Successfully fetched ${data.results.length} recent requests`);
    return data.results;
  } catch (error) {
    console.error('[Overseerr Requests] Error fetching Overseerr requests:', error);
    return [];
  }
}

// Process a request by adding it to the subscriptions table
async function processRequest(request) {
  try {
    // Safety check for request structure
    if (!request || !request.media) {
      console.error('[Overseerr Requests] Invalid request object:', request);
      return;
    }
    
    // Since we might not have title directly in the request, get full media details
    let mediaTitle = 
      request.media.title || // Movies typically use title
      request.media.name ||  // TV shows typically use name
      request.media.originalTitle || 
      request.media.originalName || 
      null;
      
    const mediaId = request.media.tmdbId;
    const mediaType = request.type;
    
    // If we don't have a title but have tmdbId, fetch complete details
    if (!mediaTitle && mediaId) {
      console.log(`[Overseerr Requests] No title found in request, fetching details for ${mediaType} with TMDB ID ${mediaId}`);
      
      try {
        const mediaDetails = await getMediaDetails(mediaType, mediaId);
        
        if (mediaDetails) {
          console.log(`[Overseerr Requests] Successfully fetched media details for ${mediaType} ${mediaId}`);
          
          // Extract title based on media type
          if (mediaType === 'movie') {
            mediaTitle = mediaDetails.title || mediaDetails.originalTitle;
          } else {
            mediaTitle = mediaDetails.name || mediaDetails.originalName;
          }
          
          console.log(`[Overseerr Requests] Retrieved title: "${mediaTitle}" for ${mediaType} ${mediaId}`);
        } else {
          console.warn(`[Overseerr Requests] Failed to get media details for ${mediaType} ${mediaId}`);
        }
      } catch (error) {
        console.error(`[Overseerr Requests] Error fetching media details for ${mediaType} ${mediaId}:`, error);
      }
    }
    
    // Use a fallback title if we still don't have one
    if (!mediaTitle) {
      mediaTitle = `Unknown ${mediaType} (ID: ${mediaId || 'N/A'})`;
    }
    
    console.log(`[Overseerr Requests] Processing request ID: ${request.id}, media: ${mediaTitle}`);
    
    // Check if we have all required data
    if (!mediaId) {
      console.error(`[Overseerr Requests] Missing tmdbId for request ${request.id}, cannot add subscription`);
      return;
    }
    
    if (!mediaType) {
      console.error(`[Overseerr Requests] Missing media type for request ${request.id}, cannot add subscription`);
      return;
    }
    
    // Get the Discord user ID from our mapping
    console.log(`[Overseerr Requests] Looking up Discord ID for Overseerr user ID: ${request.requestedBy?.id}`);
    
    if (!request.requestedBy || !request.requestedBy.id) {
      console.error(`[Overseerr Requests] Missing requestedBy data for request ${request.id}, cannot add subscription`);
      return;
    }
    
    const discordUserId = getDiscordId(request.requestedBy.id.toString());
    
    if (!discordUserId) {
      console.log(`[Overseerr Requests] No Discord user mapping found for Overseerr user ID: ${request.requestedBy.id}`);
      return;
    }

    console.log(`[Overseerr Requests] Found Discord user ID: ${discordUserId}, adding to subscriptions`);
    
    // Add to subscriptions table
    try {
      console.log(`[Overseerr Requests] Adding subscription for ${mediaType} ${mediaId} (${mediaTitle}) for user ${discordUserId}`);
      
      const success = addSubscription(
        discordUserId,
        mediaId,
        mediaType, 
        mediaTitle,
        false // Not episode specific
      );
      
      if (success) {
        console.log(`[Overseerr Requests] Successfully added subscription for ${mediaType} ${mediaId} for user ${discordUserId}`);
      } else {
        console.log(`[Overseerr Requests] Failed to add subscription for ${mediaType} ${mediaId} for user ${discordUserId}`);
      }
    } catch (error) {
      console.error(`[Overseerr Requests] Failed to add subscription for user ${discordUserId}:`, error);
    }
  } catch (error) {
    console.error('[Overseerr Requests] Error in processRequest:', error);
  }
}

async function checkNewRequests() {
  try {
    console.log('[Overseerr Requests] Starting check for new requests...');
    const requests = await getRequests();
    
    if (requests.length === 0) {
      console.log('[Overseerr Requests] No requests found');
      return;
    }
    
    console.log(`[Overseerr Requests] Found ${requests.length} requests, last processed ID: ${lastProcessedRequestId}`);
    
    // Sort by ID (ascending) to process in order they were created
    const sortedRequests = [...requests].sort((a, b) => a.id - b.id);
    
    // If this is first run (lastProcessedRequestId is 0), just set the latest ID without processing
    if (lastProcessedRequestId === 0) {
      // Get the highest ID from the requests and set it as our starting point
      const highestId = Math.max(...sortedRequests.map(req => req.id));
      console.log(`[Overseerr Requests] First run - setting last processed ID to ${highestId} without processing existing requests`);
      lastProcessedRequestId = highestId;
      return;
    }
    
    // Find the newest request we haven't processed yet
    for (const request of sortedRequests) {
      // Detailed logging of request structure for debugging
      if (request.id > lastProcessedRequestId) {
        console.log(`[Overseerr Requests] New request found with ID: ${request.id}`);
        console.log('[Overseerr Requests] Request object structure:', 
          JSON.stringify({
            id: request.id,
            type: request.type,
            has_media: !!request.media,
            media_keys: request.media ? Object.keys(request.media) : [],
            requestedBy_id: request.requestedBy?.id
          }, null, 2)
        );
        
        // Check if this request was created by the bot, if so, skip it to avoid duplicate subscriptions
        if (botInitiatedRequestIds.has(request.id)) {
          console.log(`[Overseerr Requests] Request ID ${request.id} was created by the bot, skipping to avoid duplicate subscription`);
          lastProcessedRequestId = request.id;
          continue;
        }
        
        // Make sure we have valid media data before processing
        if (!request.media) {
          console.warn(`[Overseerr Requests] Request ${request.id} has no media data, skipping`);
          lastProcessedRequestId = request.id; // Still update to avoid processing again
          continue;
        }
        
        const mediaTitle = 
          request.media.title || // Movies typically use title
          request.media.name ||  // TV shows typically use name
          request.media.originalTitle || 
          request.media.originalName || 
          `Unknown (ID: ${request.media.tmdbId || 'N/A'})`;
          
        console.log(`[Overseerr Requests] Found new request ID: ${request.id} (${mediaTitle})`);
        
        await processRequest(request);
        lastProcessedRequestId = request.id;
        console.log(`[Overseerr Requests] Updated lastProcessedRequestId to: ${lastProcessedRequestId}`);
      }
    }
  } catch (error) {
    console.error('[Overseerr Requests] Error checking for new requests:', error);
  }
}

// Start the periodic check
export function startRequestChecking() {
  console.log('[Overseerr Requests] Initializing request checking service...');
  
  // Run immediately on startup
  checkNewRequests();
  
  // Then check periodically (every 30 seconds)
  const intervalMinutes = 5;
  console.log(`[Overseerr Requests] Setting up periodic check every ${intervalMinutes} minutes`);
  
  setInterval(checkNewRequests, intervalMinutes * 60 * 1000);
}
