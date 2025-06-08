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
 * top-rated movies and TV shows, upcoming movies, classics, and children's programming
 * @returns {Promise<Array>} Array of movie and TV show titles (English only)
 */
export async function fetchPopularTitles() {
  try {
    // Endpoints to fetch from
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
    
    // Discovery endpoints with specific parameters for variety
    const discoveryEndpoints = [
      // General discovery
      { endpoint: 'discover/movie', params: '' },
      { endpoint: 'discover/tv', params: '' },
      
      // Children's animation (movies)
      { endpoint: 'discover/movie', params: '&with_genres=16&include_adult=false&sort_by=popularity.desc' },
      
      // Children's animation (TV)
      { endpoint: 'discover/tv', params: '&with_genres=16&include_adult=false&sort_by=popularity.desc' },
      
      // Classic movies by decade
      { endpoint: 'discover/movie', params: '&primary_release_date.lte=2000-01-01&sort_by=popularity.desc' },
      { endpoint: 'discover/movie', params: '&primary_release_date.gte=1990-01-01&primary_release_date.lte=1999-12-31' },
      { endpoint: 'discover/movie', params: '&primary_release_date.gte=1980-01-01&primary_release_date.lte=1989-12-31' },
      { endpoint: 'discover/movie', params: '&primary_release_date.gte=1970-01-01&primary_release_date.lte=1979-12-31' },
      { endpoint: 'discover/movie', params: '&primary_release_date.gte=1960-01-01&primary_release_date.lte=1969-12-31' },
      { endpoint: 'discover/movie', params: '&primary_release_date.gte=1950-01-01&primary_release_date.lte=1959-12-31' },
      { endpoint: 'discover/movie', params: '&primary_release_date.gte=1940-01-01&primary_release_date.lte=1949-12-31' },
      
      // Classic TV shows by decade
      { endpoint: 'discover/tv', params: '&first_air_date.lte=2000-01-01&sort_by=popularity.desc' },
      { endpoint: 'discover/tv', params: '&first_air_date.gte=1990-01-01&first_air_date.lte=1999-12-31' },
      { endpoint: 'discover/tv', params: '&first_air_date.gte=1980-01-01&first_air_date.lte=1989-12-31' },
      { endpoint: 'discover/tv', params: '&first_air_date.gte=1970-01-01&first_air_date.lte=1979-12-31' },
      { endpoint: 'discover/tv', params: '&first_air_date.gte=1960-01-01&first_air_date.lte=1969-12-31' },
      { endpoint: 'discover/tv', params: '&first_air_date.gte=1950-01-01&first_air_date.lte=1959-12-31' },
      
      // Genre-specific movies
      { endpoint: 'discover/movie', params: '&with_genres=28&sort_by=popularity.desc' }, // Action
      { endpoint: 'discover/movie', params: '&with_genres=12&sort_by=popularity.desc' }, // Adventure
      { endpoint: 'discover/movie', params: '&with_genres=35&sort_by=popularity.desc' }, // Comedy
      { endpoint: 'discover/movie', params: '&with_genres=80&sort_by=popularity.desc' }, // Crime
      { endpoint: 'discover/movie', params: '&with_genres=99&sort_by=popularity.desc' }, // Documentary
      { endpoint: 'discover/movie', params: '&with_genres=18&sort_by=popularity.desc' }, // Drama
      { endpoint: 'discover/movie', params: '&with_genres=14&sort_by=popularity.desc' }, // Fantasy
      { endpoint: 'discover/movie', params: '&with_genres=27&sort_by=popularity.desc' }, // Horror
      { endpoint: 'discover/movie', params: '&with_genres=10749&sort_by=popularity.desc' }, // Romance
      { endpoint: 'discover/movie', params: '&with_genres=878&sort_by=popularity.desc' }, // Science Fiction
      
      // Genre-specific TV shows
      { endpoint: 'discover/tv', params: '&with_genres=10759&sort_by=popularity.desc' }, // Action & Adventure
      { endpoint: 'discover/tv', params: '&with_genres=35&sort_by=popularity.desc' }, // Comedy
      { endpoint: 'discover/tv', params: '&with_genres=80&sort_by=popularity.desc' }, // Crime
      { endpoint: 'discover/tv', params: '&with_genres=99&sort_by=popularity.desc' }, // Documentary
      { endpoint: 'discover/tv', params: '&with_genres=18&sort_by=popularity.desc' }, // Drama
      { endpoint: 'discover/tv', params: '&with_genres=10751&sort_by=popularity.desc' }, // Family
      { endpoint: 'discover/tv', params: '&with_genres=10762&sort_by=popularity.desc' }, // Kids
      { endpoint: 'discover/tv', params: '&with_genres=9648&sort_by=popularity.desc' }, // Mystery
      { endpoint: 'discover/tv', params: '&with_genres=10763&sort_by=popularity.desc' }, // News
      { endpoint: 'discover/tv', params: '&with_genres=10764&sort_by=popularity.desc' }, // Reality
      { endpoint: 'discover/tv', params: '&with_genres=10765&sort_by=popularity.desc' }, // Sci-Fi & Fantasy
      { endpoint: 'discover/tv', params: '&with_genres=10766&sort_by=popularity.desc' }, // Soap
      { endpoint: 'discover/tv', params: '&with_genres=10767&sort_by=popularity.desc' }, // Talk
      { endpoint: 'discover/tv', params: '&with_genres=10768&sort_by=popularity.desc' }, // War & Politics
      
      // Popular international content with English titles
      { endpoint: 'discover/movie', params: '&with_original_language=ko&sort_by=popularity.desc' }, // Korean
      { endpoint: 'discover/tv', params: '&with_original_language=ko&sort_by=popularity.desc' }, // Korean
      { endpoint: 'discover/movie', params: '&with_original_language=ja&sort_by=popularity.desc' }, // Japanese
      { endpoint: 'discover/tv', params: '&with_original_language=ja&sort_by=popularity.desc' }, // Japanese
      { endpoint: 'discover/movie', params: '&with_original_language=es&sort_by=popularity.desc' }, // Spanish
      { endpoint: 'discover/tv', params: '&with_original_language=es&sort_by=popularity.desc' } // Spanish
    ];
    
    // Specific keyword searches for popular franchises and categories
    const keywordSearches = [
      // Kids shows - Expanded with more specific titles
      { query: 'spongebob', type: 'tv' },
      { query: 'fairly odd parents', type: 'tv' },
      { query: 'rugrats', type: 'tv' },
      { query: 'hey arnold', type: 'tv' },
      { query: 'jimmy neutron', type: 'tv' },
      { query: 'avatar the last airbender', type: 'tv' },
      { query: 'pokemon', type: 'tv' },
      { query: 'powerpuff girls', type: 'tv' },
      { query: 'dexter laboratory', type: 'tv' },
      { query: 'courage cowardly dog', type: 'tv' },
      { query: 'ed edd eddy', type: 'tv' },
      { query: 'samurai jack', type: 'tv' },
      { query: 'johnny bravo', type: 'tv' },
      { query: 'recess', type: 'tv' },
      { query: 'doug', type: 'tv' },
      { query: 'looney tunes', type: 'tv' },
      { query: 'tom and jerry', type: 'tv' },
      { query: 'scooby doo', type: 'tv' },
      { query: 'flintstones', type: 'tv' },
      { query: 'jetsons', type: 'tv' },
      { query: 'disney', type: 'tv' },
      { query: 'disney', type: 'movie' },
      { query: 'nickelodeon', type: 'tv' },
      { query: 'cartoon network', type: 'tv' },
      { query: 'pbs kids', type: 'tv' },
      { query: 'sesame street', type: 'tv' },
      { query: 'muppets', type: 'tv' },
      { query: 'muppets', type: 'movie' },
      { query: 'barney', type: 'tv' },
      { query: 'teletubbies', type: 'tv' },
      { query: 'spongebob squarepants', type: 'movie' },
      { query: 'wild thornberrys', type: 'tv' },
      { query: 'catdog', type: 'tv' },
      { query: 'blues clues', type: 'tv' },
      { query: 'dora explorer', type: 'tv' },
      { query: 'peppa pig', type: 'tv' },
      { query: 'paw patrol', type: 'tv' },
      { query: 'arthur', type: 'tv' },
      { query: 'clifford big red dog', type: 'tv' },
      { query: 'magic school bus', type: 'tv' },
      
      // Popular franchises - Expanded
      { query: 'star wars', type: 'movie' },
      { query: 'star wars', type: 'tv' },
      { query: 'star trek', type: 'tv' },
      { query: 'star trek', type: 'movie' },
      { query: 'harry potter', type: 'movie' },
      { query: 'lord of the rings', type: 'movie' },
      { query: 'lord of the rings', type: 'tv' },
      { query: 'hobbit', type: 'movie' },
      { query: 'marvel', type: 'movie' },
      { query: 'marvel', type: 'tv' },
      { query: 'dc comics', type: 'movie' },
      { query: 'dc comics', type: 'tv' },
      { query: 'batman', type: 'movie' },
      { query: 'batman', type: 'tv' },
      { query: 'superman', type: 'movie' },
      { query: 'superman', type: 'tv' },
      { query: 'spider-man', type: 'movie' },
      { query: 'avengers', type: 'movie' },
      { query: 'james bond', type: 'movie' },
      { query: 'mission impossible', type: 'movie' },
      { query: 'fast furious', type: 'movie' },
      { query: 'jurassic park', type: 'movie' },
      { query: 'terminator', type: 'movie' },
      { query: 'alien', type: 'movie' },
      { query: 'predator', type: 'movie' },
      { query: 'transformers', type: 'movie' },
      { query: 'indiana jones', type: 'movie' },
      { query: 'back to the future', type: 'movie' },
      { query: 'matrix', type: 'movie' },
      { query: 'pirates caribbean', type: 'movie' },
      
      // Classic sitcoms and TV shows - Expanded
      { query: 'friends', type: 'tv' },
      { query: 'seinfeld', type: 'tv' },
      { query: 'the office', type: 'tv' },
      { query: 'parks and recreation', type: 'tv' },
      { query: 'simpsons', type: 'tv' },
      { query: 'family guy', type: 'tv' },
      { query: 'cheers', type: 'tv' },
      { query: 'frasier', type: 'tv' },
      { query: 'mash', type: 'tv' },
      { query: 'mary tyler moore', type: 'tv' },
      { query: 'i love lucy', type: 'tv' },
      { query: 'andy griffith', type: 'tv' },
      { query: 'leave it to beaver', type: 'tv' },
      { query: 'brady bunch', type: 'tv' },
      { query: 'happy days', type: 'tv' },
      { query: 'all in the family', type: 'tv' },
      { query: 'sanford and son', type: 'tv' },
      { query: 'three company', type: 'tv' },
      { query: 'golden girls', type: 'tv' },
      { query: 'fresh prince bel air', type: 'tv' },
      { query: 'full house', type: 'tv' },
      { query: 'married with children', type: 'tv' },
      { query: 'saved by the bell', type: 'tv' },
      { query: 'boy meets world', type: 'tv' },
      { query: 'that 70s show', type: 'tv' },
      { query: 'everybody loves raymond', type: 'tv' },
      { query: 'king of queens', type: 'tv' },
      { query: 'malcolm in the middle', type: 'tv' },
      { query: 'how i met your mother', type: 'tv' },
      { query: 'big bang theory', type: 'tv' },
      { query: 'modern family', type: 'tv' },
      { query: 'community', type: 'tv' },
      { query: '30 rock', type: 'tv' },
      
      // Popular dramas and content - Expanded
      { query: 'game of thrones', type: 'tv' },
      { query: 'breaking bad', type: 'tv' },
      { query: 'stranger things', type: 'tv' },
      { query: 'ozark', type: 'tv' },
      { query: 'the mandalorian', type: 'tv' },
      { query: 'walking dead', type: 'tv' },
      { query: 'sopranos', type: 'tv' },
      { query: 'wire', type: 'tv' },
      { query: 'mad men', type: 'tv' },
      { query: 'west wing', type: 'tv' },
      { query: 'house of cards', type: 'tv' },
      { query: 'downton abbey', type: 'tv' },
      { query: 'lost', type: 'tv' },
      { query: '24', type: 'tv' },
      { query: 'x files', type: 'tv' },
      { query: 'twilight zone', type: 'tv' },
      { query: 'law and order', type: 'tv' },
      { query: 'csi', type: 'tv' },
      { query: 'true detective', type: 'tv' },
      { query: 'black mirror', type: 'tv' },
      { query: 'handmaids tale', type: 'tv' },
      { query: 'dexter', type: 'tv' },
      { query: 'six feet under', type: 'tv' },
      { query: 'twin peaks', type: 'tv' },
      { query: 'buffy vampire slayer', type: 'tv' },
      { query: 'grey anatomy', type: 'tv' },
      { query: 'house', type: 'tv' },
      
      // Adult animation
      { query: 'south park', type: 'tv' },
      { query: 'rick and morty', type: 'tv' },
      { query: 'bojack horseman', type: 'tv' },
      { query: 'archer', type: 'tv' },
      { query: 'futurama', type: 'tv' },
      { query: 'american dad', type: 'tv' },
      { query: 'king of the hill', type: 'tv' },
      { query: 'bobs burgers', type: 'tv' },
      
      // Reality TV
      { query: 'survivor', type: 'tv' },
      { query: 'big brother', type: 'tv' },
      { query: 'amazing race', type: 'tv' },
      { query: 'bachelor', type: 'tv' },
      { query: 'american idol', type: 'tv' },
      { query: 'voice', type: 'tv' },
      { query: 'dancing with the stars', type: 'tv' },
      { query: 'master chef', type: 'tv' },
      { query: 'top chef', type: 'tv' },
      
      // Anime
      { query: 'dragon ball', type: 'tv' },
      { query: 'one piece', type: 'tv' },
      { query: 'naruto', type: 'tv' },
      { query: 'attack on titan', type: 'tv' },
      { query: 'my hero academia', type: 'tv' },
      { query: 'death note', type: 'tv' },
      { query: 'studio ghibli', type: 'movie' },
      { query: 'your name', type: 'movie' },
      
      // Documentary series
      { query: 'planet earth', type: 'tv' },
      { query: 'blue planet', type: 'tv' },
      { query: 'cosmos', type: 'tv' },
      { query: 'ken burns', type: 'tv' },
      { query: 'making murderer', type: 'tv' },
      { query: 'tiger king', type: 'tv' }
    ];

    const PAGES_PER_ENDPOINT = 5; // Fetch 5 pages from each endpoint (up to 100 titles per endpoint)
    const allPromises = [];

    // For each regular endpoint, fetch multiple pages
    endpoints.forEach(endpoint => {
      for (let page = 1; page <= PAGES_PER_ENDPOINT; page++) {
        allPromises.push(
          (async () => {
            try {
              // Add language filter to ensure English titles only
              const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${getApiKey()}&language=en-US&page=${page}&include_adult=false&with_original_language=en`;
              const response = await fetch(url);
              const data = await response.json();

              if (response.ok && data.results) {
                // Extract titles from results, filter out null/undefined titles
                return data.results
                  .map(item => item.title || item.name)
                  .filter(title => title && title.trim() !== '');
              } else {
                console.error(`TMDB API error for ${endpoint} (page ${page}):`, data);
                return [];
              }
            } catch (error) {
              console.error(`Error fetching ${endpoint} (page ${page}):`, error);
              return [];
            }
          })()
        );
      }
    });
    
    // For each discovery endpoint with custom parameters
    discoveryEndpoints.forEach(({ endpoint, params }) => {
      for (let page = 1; page <= 2; page++) { // Limit to 2 pages for these specialized searches
        allPromises.push(
          (async () => {
            try {
              const url = `https://api.themoviedb.org/3/${endpoint}?api_key=${getApiKey()}&language=en-US&page=${page}${params}&include_adult=false&with_original_language=en`;
              const response = await fetch(url);
              const data = await response.json();

              if (response.ok && data.results) {
                return data.results
                  .map(item => item.title || item.name)
                  .filter(title => title && title.trim() !== '');
              } else {
                console.error(`TMDB API error for ${endpoint} with params (page ${page}):`, data);
                return [];
              }
            } catch (error) {
              console.error(`Error fetching ${endpoint} with params (page ${page}):`, error);
              return [];
            }
          })()
        );
      }
    });
    
    // For specific keyword searches
    keywordSearches.forEach(({ query, type }) => {
      allPromises.push(
        (async () => {
          try {
            const url = `https://api.themoviedb.org/3/search/${type}?api_key=${getApiKey()}&language=en-US&query=${encodeURIComponent(query)}&page=1&include_adult=false`;
            const response = await fetch(url);
            const data = await response.json();

            if (response.ok && data.results) {
              return data.results
                .map(item => item.title || item.name)
                .filter(title => title && title.trim() !== '');
            } else {
              console.error(`TMDB search API error for "${query}" (${type}):`, data);
              return [];
            }
          } catch (error) {
            console.error(`Error searching TMDB for "${query}" (${type}):`, error);
            return [];
          }
        })()
      );
    });

    // Wait for all requests to complete
    const results = await Promise.all(allPromises);
    
    // Process all titles
    const allRawTitles = results.flat();
    
    // Remove duplicates, filter out non-English characters, and normalize titles
    const processedTitles = [...new Set(
      allRawTitles
        .map(title => title.trim()) // Trim whitespace
        .filter(title => {
          // Basic filter to remove titles with primarily non-Latin characters
          // This is a simple heuristic - we check if most chars are in the standard Latin charset
          const latinCharCount = title.replace(/[^a-zA-Z0-9\s:,'"\-().!?]/g, '').length;
          return latinCharCount > (title.length * 0.7); // At least 70% Latin characters
        })
    )];
    
    // Group endpoints for logging (combine pages)
    const titleCounts = {};
    let totalRaw = allRawTitles.length;
    let totalFiltered = processedTitles.length;
    
    endpoints.forEach(endpoint => {
      const category = endpoint.split('/')[0] + '/' + endpoint.split('/')[1];
      titleCounts[category] = (titleCounts[category] || 0) + 
        Math.round(totalRaw / (endpoints.length + discoveryEndpoints.length + keywordSearches.length) * PAGES_PER_ENDPOINT);
    });
    
    // Add discovery endpoints and keyword searches to logging
    titleCounts['discover/specialized'] = discoveryEndpoints.length * 40; // Approximate count
    titleCounts['keyword/searches'] = keywordSearches.length * 20; // Approximate count
    
    // Enhanced logging
    console.log(`📊 TMDB title fetching summary:`);
    Object.entries(titleCounts).forEach(([category, count]) => {
      console.log(`   - ${category}: ~${count} titles`);
    });
    
    // Save the full list to a file for debugging
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      // Create data directory if it doesn't exist
      const dataDir = path.join(process.cwd(), 'src/data');
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`Created data directory at: ${dataDir}`);
      }
      
      // Write titles to file
      const filePath = path.join(dataDir, 'cached_titles.json');
      fs.writeFileSync(filePath, JSON.stringify(processedTitles, null, 2));
      console.log(`   - Saved ${processedTitles.length} titles to ${filePath}`);
    } catch (err) {
      console.error('Error saving titles to file:', err);
    }
    console.log(`   - Total raw titles: ${totalRaw}`);
    console.log(`   - Total unique English titles: ${totalFiltered}`);
    
    return processedTitles;
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