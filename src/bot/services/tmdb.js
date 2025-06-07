import fetch from 'node-fetch';

// Don't load API key at the module level
// We'll access it from functions when needed
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Function to get the API key at runtime
function getApiKey() {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) {
    console.error('TMDB API key is empty or undefined! Check your .env file.');
  }
  return key;
}

// Test the API key - but this will be called manually, not on module load
export async function testApiKey() {
  try {
    const key = getApiKey();
    if (!key) return false;

    console.log('Testing TMDB API key...');
    const testUrl = `${TMDB_BASE_URL}/movie/550?api_key=${key}`;
    
    const response = await fetch(testUrl);
    if (response.ok) {
      console.log('TMDB API key test successful!');
      return true;
    } else {
      console.error(`TMDB API key test failed with status: ${response.status} ${response.statusText}`);
      const errorBody = await response.text();
      console.error('Error details:', errorBody);
      return false;
    }
  } catch (error) {
    console.error('Error testing TMDB API key:', error.message);
    return false;
  }
}

/**
 * Fetch popular and trending titles from TMDB
 * This includes trending movies and TV shows, popular movies and TV shows,
 * top-rated movies and TV shows, and upcoming movies
 * @returns {Promise<Array>} Array of movie and TV show titles
 */
export async function fetchPopularTitles() {
  try {
    const endpoints = [
      // Trending this week
      'trending/movie/week',
      'trending/tv/week',
      // Popular content
      'movie/popular',
      'tv/popular',
      // Top rated content
      'movie/top_rated',
      'tv/top_rated',
      // Upcoming movies
      'movie/upcoming',
      // Now playing movies
      'movie/now_playing',
      // TV shows airing today/this week
      'tv/on_the_air',
      'tv/airing_today'
    ];

    // Fetch data from all endpoints
    const promises = endpoints.map(async endpoint => {
      try {
        const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${getApiKey()}&language=en-US&page=1`;
        const response = await fetch(url);
        const data = await response.json();

        if (response.ok && data.results) {
          // Extract titles from results
          return data.results.map(item => item.title || item.name);
        } else {
          console.error(`TMDB API error for ${endpoint}:`, data);
          return [];
        }
      } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        return [];
      }
    });

    // Wait for all requests to complete
    const results = await Promise.all(promises);
    
    // Track titles per category for logging
    const titleCounts = {};
    endpoints.forEach((endpoint, index) => {
      const category = endpoint.split('/')[0] + '/' + endpoint.split('/')[1];
      titleCounts[category] = (titleCounts[category] || 0) + results[index].length;
    });
    
    // Flatten and remove duplicates
    const allTitles = [...new Set(results.flat())];
    
    // Enhanced logging
    console.log(`📊 TMDB title fetching summary:`);
    Object.entries(titleCounts).forEach(([category, count]) => {
      console.log(`   - ${category}: ${count} titles`);
    });
    console.log(`   - Total unique titles: ${allTitles.length}`);
    
    return allTitles;
  } catch (error) {
    console.error('Error in fetchPopularTitles:', error);
    return [];
  }
}

export async function searchTMDB(query, mediaType = null) {
  try {
    // Get API key at runtime
    const TMDB_API_KEY = getApiKey();
    if (!TMDB_API_KEY) {
      throw new Error('TMDB API key is not configured');
    }

    // Input validation
    if (!query || typeof query !== 'string') {
      throw new Error('Invalid search query');
    }

    // Extract the media type from query if specified in parentheses
    let searchQuery = query;
    let forcedMediaType = mediaType;

    const typeMatch = query.match(/\((movie|tv)\)$/i);
    if (typeMatch) {
      forcedMediaType = typeMatch[1].toLowerCase();
      searchQuery = query.replace(/\((movie|tv)\)$/i, '').trim();
    }

    // Validate and encode search parameters
    const encodedQuery = encodeURIComponent(searchQuery);
    const endpoint = forcedMediaType ? `search/${forcedMediaType}` : 'search/multi';
    
    // Log the TMDB API key for debugging (first few chars + last few chars)
    const firstChars = TMDB_API_KEY.substring(0, 4);
    const lastChars = TMDB_API_KEY.substring(TMDB_API_KEY.length - 4);
    console.log(`TMDB API key partial: ${firstChars}...${lastChars} (length: ${TMDB_API_KEY.length})`);
    
    // Construct the full URL for debugging (but mask the API key in logs)
    const fullUrl = `${TMDB_BASE_URL}/${endpoint}?api_key=XXXXX&query=${encodedQuery}&include_adult=false`;
    console.log(`Making TMDB API request to: ${fullUrl}`);
    
    // Actual request URL with real API key
    const url = `${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodedQuery}&include_adult=false`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      // Get detailed error information
      const errorText = await response.text();
      console.error(`TMDB API error: Status ${response.status} ${response.statusText}`);
      console.error(`Error response: ${errorText}`);
      
      // Try a direct call to the test endpoint to verify API key
      console.log('Attempting to verify API key with direct call to /movie/550...');
      const testResponse = await fetch(`${TMDB_BASE_URL}/movie/550?api_key=${TMDB_API_KEY}`);
      console.log(`Test endpoint result: ${testResponse.status} ${testResponse.statusText}`);
      
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Log success for debugging
    console.log(`TMDB search successful, found ${data.results?.length || 0} results`);

    if (!data.results) {
      return [];
    }
    
    if (forcedMediaType) {
      return data.results.map(result => ({
        ...result,
        media_type: forcedMediaType
      }));
    }
    
    return data.results.filter(result => 
      result.media_type === 'movie' || result.media_type === 'tv'
    );
  } catch (error) {
    console.error('Error searching TMDB:', error);
    throw new Error('Failed to search TMDB');
  }
}

/**
 * Check release dates and types for a movie from TMDB API
 * @param {number} movieId - TMDB movie ID
 * @returns {Promise<Object>} Release information including digital/physical release dates
 */
export async function getReleaseInfo(movieId) {
  try {
    // Get API key at runtime
    const TMDB_API_KEY = getApiKey();
    if (!TMDB_API_KEY) {
      throw new Error('TMDB API key is not configured');
    }

    // Input validation
    if (!movieId || isNaN(movieId)) {
      throw new Error('Invalid movie ID');
    }

    const url = `${TMDB_BASE_URL}/movie/${movieId}/release_dates?api_key=${TMDB_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Look for US releases first, then fall back to any country
    let usReleases = data.results.find(country => country.iso_3166_1 === 'US');
    
    // If no US releases, try to find any country's releases
    if (!usReleases || !usReleases.release_dates?.length) {
      usReleases = data.results[0]; // Take the first country's releases
    }

    // No release dates found
    if (!usReleases || !usReleases.release_dates?.length) {
      return {
        hasDigitalRelease: false,
        hasPhysicalRelease: false,
        hasTheatricalRelease: false,
        releaseDates: {
          digital: null,
          physical: null,
          theatrical: null
        },
        isReleased: false
      };
    }

    // Parse release dates
    const now = new Date();
    const theatricalRelease = usReleases.release_dates.find(r => r.type === 3);
    const digitalRelease = usReleases.release_dates.find(r => r.type === 4);
    const physicalRelease = usReleases.release_dates.find(r => r.type === 5);

    // Format response
    const result = {
      hasTheatricalRelease: !!theatricalRelease,
      hasDigitalRelease: !!digitalRelease,
      hasPhysicalRelease: !!physicalRelease,
      releaseDates: {
        theatrical: theatricalRelease ? new Date(theatricalRelease.release_date) : null,
        digital: digitalRelease ? new Date(digitalRelease.release_date) : null,
        physical: physicalRelease ? new Date(physicalRelease.release_date) : null
      }
    };

    // Check if any release type is currently available
    result.isDigitalReleased = result.hasDigitalRelease && result.releaseDates.digital && result.releaseDates.digital <= now;
    result.isPhysicalReleased = result.hasPhysicalRelease && result.releaseDates.physical && result.releaseDates.physical <= now;
    
    // Digital or physical release available
    result.isReleased = result.isDigitalReleased || result.isPhysicalReleased;
    
    // Format readable dates for display
    if (result.releaseDates.digital) {
      result.digitalReleaseDate = result.releaseDates.digital.toLocaleDateString();
    }
    if (result.releaseDates.physical) {
      result.physicalReleaseDate = result.releaseDates.physical.toLocaleDateString();
    }

    return result;
  } catch (error) {
    console.error('Error checking TMDB release dates:', error);
    return {
      hasDigitalRelease: false,
      hasPhysicalRelease: false,
      hasTheatricalRelease: false,
      releaseDates: {},
      isReleased: false,
      error: error.message
    };
  }
}

/**
 * Fetch media details from TMDB by ID and media type
 * @param {string|number} mediaId - TMDB media ID
 * @param {string} mediaType - Media type ('movie' or 'tv')
 * @returns {Promise<Object>} Media details
 */
export async function searchTMDBById(mediaId, mediaType) {
  try {
    // Get API key at runtime
    const TMDB_API_KEY = getApiKey();
    if (!TMDB_API_KEY) {
      throw new Error('TMDB API key is not configured');
    }

    // Input validation
    if (!mediaId) {
      throw new Error('Invalid media ID');
    }
    
    if (!mediaType || (mediaType !== 'movie' && mediaType !== 'tv')) {
      throw new Error('Invalid media type');
    }

    // Construct the API URL
    const url = `${TMDB_BASE_URL}/${mediaType}/${mediaId}?api_key=${TMDB_API_KEY}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Add media_type to match the format expected by our UI components
    return {
      ...data,
      media_type: mediaType
    };
  } catch (error) {
    console.error('Error fetching media details by ID:', error);
    return null;
  }
}

export async function checkOverseerr(tmdbId) {
  try {
    if (!tmdbId || typeof tmdbId !== 'number') {
      throw new Error('Invalid TMDB ID');
    }

    const response = await fetch(
      `${process.env.OVERSEERR_URL}/api/v1/search?query=${tmdbId}`,
      {
        headers: {
          'X-Api-Key': process.env.OVERSEERR_API_KEY
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Overseerr API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.results.some(result => result.mediaInfo?.status === 'available');
  } catch (error) {
    console.error('Error checking Overseerr:', error);
    throw new Error('Failed to check media availability');
  }
}