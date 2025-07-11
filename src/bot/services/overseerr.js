import fetch from 'node-fetch';

// Track request IDs created through the bot to avoid duplicate subscriptions
export const botInitiatedRequestIds = new Set();

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

function getUserMap() {
  const rawMap = process.env.OVERSEERR_USER_MAP;
  if (!rawMap) {
    console.error('OVERSEERR_USER_MAP is empty or undefined! Check your .env file.');
    return {};
  }
  
  try {
    const userMap = JSON.parse(rawMap);
    return userMap;
  } catch (error) {
    console.error('Failed to parse OVERSEERR_USER_MAP:', error);
    return {};
  }
}

// Overseerr user mapping helper functions
// Format: {"overseerr_id":"discord_id"}
// Example: {"1":"265316362900078592"}

// Get Overseerr ID from Discord ID (for requests)
function getOverseerId(discordId) {
  const userMap = getUserMap();
  const targetDiscordId = discordId?.toString();
  
  // Find Overseerr ID that maps to this Discord ID
  for (const [overseerId, mappedDiscordId] of Object.entries(userMap)) {
    if (mappedDiscordId === targetDiscordId) {
      return Number(overseerId);
    }
  }
  
  // Get fallback ID from environment variable or default to 1
  return process.env.OVERSEERR_FALLBACK_ID ? 
    Number(process.env.OVERSEERR_FALLBACK_ID) : 1;
}

// Get Discord ID from Overseerr ID (for notifications)
export function getDiscordId(overseerId) {
  const userMap = getUserMap();
  const id = overseerId?.toString();
  return userMap[id];
}

async function getRadarrServers() {
  const url = getOverseerrUrl();
  const apiKey = getOverseerrApiKey();
  
  const response = await fetch(
    `${url}/api/v1/settings/radarr`,
    {
      headers: {
        'X-Api-Key': apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Radarr servers: ${response.statusText}`);
  }

  return response.json();
}

async function getSonarrServers() {
  const url = getOverseerrUrl();
  const apiKey = getOverseerrApiKey();
  
  const response = await fetch(
    `${url}/api/v1/settings/sonarr`,
    {
      headers: {
        'X-Api-Key': apiKey
      }
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Sonarr servers: ${response.statusText}`);
  }

  return response.json();
}

// Get details about a media item from Overseerr API
export async function getMediaDetails(mediaType, mediaId) {
  try {
    const url = getOverseerrUrl();
    const apiKey = getOverseerrApiKey();
    
    if (!url || !apiKey || !mediaType || !mediaId) {
      console.error('Missing required parameters for getMediaDetails:', { url, apiKey, mediaType, mediaId });
      return null;
    }
    

    
    const response = await fetch(
      `${url}/api/v1/${mediaType}/${mediaId}`,
      {
        headers: {
          'X-Api-Key': apiKey
        }
      }
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching media details:', error);
    return null;
  }
}

import { getReleaseInfo } from './tmdb.js';
import arrService from './arr.js';

export async function checkAvailability(mediaType, mediaId) {
  try {
    const details = await getMediaDetails(mediaType, mediaId);
    let result = {
      isAvailable: details.mediaInfo?.status === 5,
      details,
      notAvailableReason: null,
      releaseStatus: null,
      inSonarr: false,
      inRadarr: false,
      isReleased: true, // Default to true unless we determine it's unreleased
      isUpcoming: false
    };
    
    // For TV shows, check Sonarr status and Season 1 Episode 1
    if (mediaType === 'tv') {
      // Check if the show exists in Sonarr
      const tvdbId = details.externalIds?.tvdbId;
      if (tvdbId) {
        const sonarrStatus = await arrService.checkSonarrShowStatus(tvdbId);
        result.sonarrStatus = sonarrStatus;
        
        // Use Sonarr info to determine status
        if (sonarrStatus.configured && sonarrStatus.exists) {
          // Mark that it's in Sonarr regardless of download status
          result.inSonarr = true;
          
          // Show is in Sonarr - check if any episodes exist
          if (sonarrStatus.hasAnyEpisodes) {
            // Has episodes downloaded - fully available
            result.isAvailable = true;
            console.log(`Show ${tvdbId} is available in Sonarr with episodes`); 
          } else if (sonarrStatus.monitored) {
            // Show is added to Sonarr and monitored but no episodes downloaded yet
            result.isAvailable = false; // Changed to false to show appropriate message
            result.notAvailableReason = 'in_sonarr_not_downloaded';
            console.log(`Show ${tvdbId} is in Sonarr but not downloaded yet`);
            
            // Check if it's upcoming or already airing
            if (sonarrStatus.isUpcoming) {
              result.isUpcoming = true;
              result.isReleased = false;
              result.notAvailableReason = 'upcoming_release';
              result.nextAiring = sonarrStatus.nextAiring;
              result.firstAired = sonarrStatus.firstAired;
              console.log(`Show ${tvdbId} is upcoming, not yet released`);
            }
          }
        }
      }
      
      // Still check Season 1 Episode 1 for backward compatibility
      const hasS1E1 = await checkIfS1E1Exists(details);
      result.hasS1E1 = hasS1E1;
      
      // If S1E1 exists, always mark as available
      if (hasS1E1) {
        result.isAvailable = true;
        console.log(`Show has S1E1 available, marking as available`);
      }
      
      // Final check with Overseerr status
      if (details.mediaInfo?.status === 5) {
        result.isAvailable = true;
        console.log(`Show is available according to Overseerr status 5`);
      }
      
      console.log(`Final availability for ${mediaType} ${mediaId}: ${result.isAvailable}`);
      return result;
    }
    
    // For movies, check additional information
    if (mediaType === 'movie') {
      // Check if the movie has been downloaded in Radarr
      const radarrStatus = await arrService.checkRadarrMovieStatus(mediaId);
      result.radarrStatus = radarrStatus;
      
      // If Radarr is configured, check if the file has actually been downloaded
      if (radarrStatus.configured) {
        if (radarrStatus.exists) {
          // Mark that it's in Radarr regardless of download status
          result.inRadarr = true;
          
          if (!radarrStatus.hasFile) {
            // Movie is in Radarr but not downloaded
            result.isAvailable = false;
            result.notAvailableReason = 'in_radarr_not_downloaded';
            console.log(`Movie ${mediaId} is in Radarr but not downloaded yet`);
            
            // Check if it's actively downloading
            if (radarrStatus.queueStatus === 'downloading') {
              result.notAvailableReason = 'currently_downloading';
              console.log(`Movie ${mediaId} is currently downloading`);
            }
          } else {
            // Movie is in Radarr and has a file
            result.isAvailable = true;
            console.log(`Movie ${mediaId} is available in Radarr with downloaded file`);
          }
        }
      }
      
      // Check TMDB for release date information
      const releaseInfo = await getReleaseInfo(mediaId);
      result.releaseInfo = releaseInfo;
      
      // Update release status flags based on releaseInfo
      result.isReleased = releaseInfo.isReleased;
      result.isUpcoming = !releaseInfo.isReleased;
      
      // If the movie is not available according to Overseerr/Radarr, check release status
      if (!result.isAvailable) {
        if (releaseInfo.isReleased) {
          // Digital/physical release is available but not downloaded yet
          result.releaseStatus = 'released_not_downloaded';
          console.log(`Movie ${mediaId} is released but not downloaded yet`);
          
          if (releaseInfo.isDigitalReleased) {
            result.digitalReleaseDate = releaseInfo.digitalReleaseDate;
          }
          
          if (releaseInfo.isPhysicalReleased) {
            result.physicalReleaseDate = releaseInfo.physicalReleaseDate;
          }
        } else {
          // Not yet released digitally or physically
          result.releaseStatus = 'not_released';
          console.log(`Movie ${mediaId} is not released yet`);
          
          // Include upcoming release dates if available
          if (releaseInfo.hasDigitalRelease) {
            result.upcomingDigitalRelease = releaseInfo.digitalReleaseDate;
          }
          
          if (releaseInfo.hasPhysicalRelease) {
            result.upcomingPhysicalRelease = releaseInfo.physicalReleaseDate;
          }
        }
      }
      
      // Final check with Overseerr status
      if (details.mediaInfo?.status === 5) {
        result.isAvailable = true;
        console.log(`Movie is available according to Overseerr status 5`);
      }
      
      console.log(`Final availability for ${mediaType} ${mediaId}: ${result.isAvailable}`);
    }
    
    return result;
  } catch (error) {
    console.error('Error checking availability:', error);
    return {
      isAvailable: false,
      error: error.message
    };
  }
}

// Function to specifically check if Season 1 Episode 1 exists
export async function checkIfS1E1Exists(mediaDetails) {
  try {
    // If we already have the details, use them directly
    const details = mediaDetails || await getMediaDetails('tv', mediaId);
    if (!details || !details.mediaInfo) return false;
    
    // Check if season 1 exists
    const season1 = details.mediaInfo.seasons?.find(season => season.seasonNumber === 1);
    if (!season1) return false;
    
    // Check if episode 1 exists in season 1
    // This depends on the API response structure, but typically:
    if (season1.status === 5 || season1.episodes?.some(ep => ep.episodeNumber === 1 && ep.status === 5)) {
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error checking if S1E1 exists:', error);
    return false;
  }
}

export async function createRequest({ mediaType, mediaId, userId }) {
  try {
    // Get the user's Overseerr ID
    const overseerId = getOverseerId(userId);
    
    // Base request body
    const requestBody = {
      mediaType,
      mediaId,
      userId: overseerId,
      is4k: false
    };

    // Get server configurations
    let serverConfig;
    if (mediaType === 'movie') {
      const radarrServers = await getRadarrServers();
      serverConfig = radarrServers.find(server => server.isDefault) || radarrServers[0];
      
      if (!serverConfig) {
        throw new Error('No Radarr server configured');
      }

      Object.assign(requestBody, {
        serverId: serverConfig.id,
        profileId: serverConfig.activeProfileId,
        rootFolder: serverConfig.activeDirectory
      });
    } else if (mediaType === 'tv') {
      const sonarrServers = await getSonarrServers();
      serverConfig = sonarrServers.find(server => server.isDefault) || sonarrServers[0];
      
      if (!serverConfig) {
        throw new Error('No Sonarr server configured');
      }

      // Always request only season 1 for TV shows
      Object.assign(requestBody, {
        serverId: serverConfig.id,
        profileId: serverConfig.activeProfileId,
        rootFolder: serverConfig.activeDirectory,
        seasons: [1],
        languageProfileId: serverConfig.activeLanguageProfileId
      });
    }

    const url = getOverseerrUrl();
    const apiKey = getOverseerrApiKey();
    
    const response = await fetch(
      `${url}/api/v1/request`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey
        },
        body: JSON.stringify(requestBody)
      }
    );

    const responseText = await response.text();
    
    if (!response.ok) {
      throw new Error(`Overseerr API error: ${response.status} - ${responseText}`);
    }
    
    try {
      // Parse response and track the request ID to prevent duplicate subscriptions
      const responseData = JSON.parse(responseText);
      
      // Track bot-initiated request IDs to prevent duplicate subscriptions
      if (responseData && responseData.id) {
        botInitiatedRequestIds.add(responseData.id);
      }
      
      return responseData;
    } catch (e) {
      return { success: true }; // Assume success if we got this far
    }
  } catch (error) {
    console.error('Error in createRequest:', error);
    throw error;
  }
}