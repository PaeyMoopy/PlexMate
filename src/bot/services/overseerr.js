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
  console.log('Raw OVERSEERR_USER_MAP:', process.env.OVERSEERR_USER_MAP);
  
  const rawMap = process.env.OVERSEERR_USER_MAP;
  if (!rawMap) {
    console.error('OVERSEERR_USER_MAP is empty or undefined! Check your .env file.');
    return {};
  }
  
  try {
    const userMap = JSON.parse(rawMap);
    console.log('Loaded Overseerr user map:', {
      raw: rawMap,
      parsed: userMap,
      type: typeof rawMap
    });
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
  
  console.log('Looking up Overseerr ID for Discord user:', targetDiscordId);
  console.log('User map entries:', Object.entries(userMap));
  console.log('User map keys:', Object.keys(userMap));
  
  // Find Overseerr ID that maps to this Discord ID
  for (const [overseerId, mappedDiscordId] of Object.entries(userMap)) {
    console.log(`Comparing: stored Discord ID "${mappedDiscordId}" (${typeof mappedDiscordId}) with target "${targetDiscordId}" (${typeof targetDiscordId})`);
    if (mappedDiscordId === targetDiscordId) {
      console.log(`Found mapping: Discord ${targetDiscordId} -> Overseerr ${overseerId}`);
      return Number(overseerId);
    }
  }
  
  // Get fallback ID from environment variable or default to 1
  const fallbackId = process.env.OVERSEERR_FALLBACK_ID ? 
    Number(process.env.OVERSEERR_FALLBACK_ID) : 1;
  
  console.log(`No mapping found, using fallback ID ${fallbackId}`);
  return fallbackId;
}

// Get Discord ID from Overseerr ID (for notifications)
export function getDiscordId(overseerId) {
  const userMap = getUserMap();
  const id = overseerId?.toString();
  const discordId = userMap[id];
  
  console.log('Looking up Discord ID:', {
    overseerId: id,
    discordId: discordId || 'none'
  });
  return discordId;
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
    
    console.log(`[Overseerr] Fetching ${mediaType} details for ID ${mediaId}`);
    
    const response = await fetch(
      `${url}/api/v1/${mediaType}/${mediaId}`,
      {
        headers: {
          'X-Api-Key': apiKey
        }
      }
    );

    if (!response.ok) {
      console.error(`[Overseerr] Error fetching media details: ${response.status} ${response.statusText}`);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching media details:', error);
    return null;
  }
}

export async function checkAvailability(mediaType, mediaId) {
  try {
    const details = await getMediaDetails(mediaType, mediaId);
    
    // For TV shows, consider it available if Season 1 Episode 1 is available
    if (mediaType === 'tv') {
      const hasS1E1 = await checkIfS1E1Exists(details);
      return {
        isAvailable: hasS1E1 || details.mediaInfo?.status === 5,
        details,
        hasS1E1
      };
    }
    
    return {
      isAvailable: details.mediaInfo?.status === 5,
      details
    };
  } catch (error) {
    console.error('Error checking availability:', error);
    throw error;
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
      console.log('Season 1 Episode 1 is available');
      return true;
    }
    
    console.log('Season 1 Episode 1 is NOT available');
    return false;
  } catch (error) {
    console.error('Error checking if S1E1 exists:', error);
    return false;
  }
}

export async function createRequest({ mediaType, mediaId, userId }) {
  try {
    // Get the user's Overseerr ID (or fallback to 6)
    const overseerId = getOverseerId(userId);
    console.log('Creating request:', {
      discordId: userId,
      overseerId,
      mediaType,
      mediaId
    });
    
    // Base request body
    const requestBody = {
      mediaType,
      mediaId,
      userId: overseerId,
      is4k: false
    };

    console.log('Request body:', requestBody);

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
    console.log('Overseerr response:', {
      status: response.status,
      body: responseText
    });
    
    if (!response.ok) {
      throw new Error(`Overseerr API error: ${response.status} - ${responseText}`);
    }
    
    try {
      // Parse response and track the request ID to prevent duplicate subscriptions
      const responseData = JSON.parse(responseText);
      
      // If we have a request ID, save it to our tracking set
      if (responseData && responseData.id) {
        console.log(`[Bot Request] Tracking bot-initiated request ID: ${responseData.id}`);
        botInitiatedRequestIds.add(responseData.id);
      }
      
      return responseData;
    } catch (e) {
      console.log('Response was not JSON:', responseText);
      return { success: true }; // Assume success if we got this far
    }
  } catch (error) {
    console.error('Error in createRequest:', error);
    throw error;
  }
}