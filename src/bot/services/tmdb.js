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