/**
 * String utility functions for PlexMate
 */

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string 
 * @returns {number} The edit distance between the strings
 */
export function levenshteinDistance(str1, str2) {
  const a = str1.toLowerCase();
  const b = str2.toLowerCase();
  
  // Create the matrix
  const distanceMatrix = Array(b.length + 1).fill().map(() => Array(a.length + 1).fill(0));
  
  // Fill the first row and column
  for (let i = 0; i <= a.length; i += 1) {
    distanceMatrix[0][i] = i;
  }
  
  for (let j = 0; j <= b.length; j += 1) {
    distanceMatrix[j][0] = j;
  }
  
  // Fill the matrix
  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      distanceMatrix[j][i] = Math.min(
        distanceMatrix[j][i - 1] + 1, // deletion
        distanceMatrix[j - 1][i] + 1, // insertion
        distanceMatrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return distanceMatrix[b.length][a.length];
}

/**
 * Calculate similarity between two strings (0-1 score)
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
export function stringSimilarity(str1, str2) {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 1.0;
  
  const distance = levenshteinDistance(str1, str2);
  return 1 - (distance / maxLength);
}

/**
 * Find similar titles to the query in a list of titles
 * @param {string} query - Search query 
 * @param {Array} titles - List of possible titles and common searches
 * @param {number} threshold - Similarity threshold (0-1)
 * @param {number} limit - Maximum number of suggestions
 * @returns {Array} Array of similar titles
 */
export function findSimilarTitles(query, titles, threshold = 0.55, limit = 3) {
  if (!query || !titles || !titles.length) return [];
  
  // Normalize query (lowercase and remove extra spaces)
  const normalizedQuery = query.toLowerCase().trim();
  
  // Create variants of the query for multi-word titles with typos
  const queryVariants = [normalizedQuery];
  
  // Add the query with each word processed separately
  // This helps with multi-word titles where some words have typos
  const queryWords = normalizedQuery.split(/\s+/);
  if (queryWords.length > 1) {
    // If we have multiple words, process each word independently
    // and check if they match parts of the title
    queryVariants.push(queryWords.join(' '));
  }

  // Calculate similarity scores for each title using multiple methods
  const similarities = titles.map(title => {
    // Standard full string similarity
    let score = stringSimilarity(normalizedQuery, title.toLowerCase());
    
    // For multi-word titles, try word-by-word matching for better results
    const titleWords = title.toLowerCase().split(/\s+/);
    if (queryWords.length > 1 && titleWords.length > 1) {
      // For multi-word titles, check if word patterns match
      // This catches cases where word order is preserved but individual words have typos
      let wordMatchScore = 0;
      let matchedWords = 0;
      
      // Compare each query word with each title word and find best matches
      queryWords.forEach(qWord => {
        let bestWordScore = 0;
        titleWords.forEach(tWord => {
          const wordSim = stringSimilarity(qWord, tWord);
          bestWordScore = Math.max(bestWordScore, wordSim); 
        });
        wordMatchScore += bestWordScore;
        if (bestWordScore > 0.6) matchedWords++;
      });
      
      // Average the word scores
      wordMatchScore = wordMatchScore / queryWords.length;
      
      // Boost score if most words matched well
      if (matchedWords / queryWords.length > 0.5) {
        wordMatchScore += 0.15;
      }
      
      // Use the higher of the two scores
      score = Math.max(score, wordMatchScore);
    }
    
    // Exact word matches, even if some words are missing
    for (const word of queryWords) {
      if (word.length >= 3 && title.toLowerCase().includes(word)) {
        score += 0.05; // Bonus for exact word matches
      }
    }
    
    // Prefer shorter titles over longer ones when scores are close
    // This prevents too many long title matches
    const lengthRatio = Math.min(normalizedQuery.length, title.length) / 
                        Math.max(normalizedQuery.length, title.length);
    
    // Apply small boost to length-appropriate matches
    score += lengthRatio * 0.05;
    
    return {
      title,
      score: Math.min(score, 1.0) // Cap at 1.0
    };
  });
  
  // Sort by similarity score (highest first) and filter by threshold
  return similarities
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.title);
}

import { fetchPopularTitles } from '../services/tmdb.js';

/**
 * Default popular movie and TV show titles for more accurate suggestions
 * These will be used as fallback if dynamic fetching fails
 */
export const defaultPopularTitles = [
  // DC Films
  "DC League of Super-Pets",
  "The Batman",
  "Black Adam",
  "Shazam",
  "Aquaman",
  "Wonder Woman",
  "Suicide Squad",
  "Justice League",
  "The Flash",
  "Joker",
  
  // Marvel Films
  "Avengers",
  "Iron Man",
  "Thor",
  "Captain America",
  "Spider-Man",
  "Black Panther",
  "Doctor Strange",
  "Guardians of the Galaxy",
  "Ant-Man",
  "Black Widow",
  
  // Popular TV Shows
  "Rick and Morty",
  "Game of Thrones",
  "Stranger Things",
  "Breaking Bad",
  "The Office",
  "Friends",
  "The Mandalorian",
  "The Witcher",
  "The Last of Us",
  "Loki",
  "WandaVision",
  "South Park",
  "The Simpsons",
  "Family Guy",
  "Brooklyn Nine-Nine",
  "The Big Bang Theory",
  "House of the Dragon",
  "Severance",
  "Ted Lasso",
  "Succession",
  "Yellowstone",
  "The Bear",
  "Only Murders in the Building",
  "Wednesday",
  "Bluey",
  "Squid Game",
  
  // Popular Movie Franchises
  "Star Wars",
  "Star Trek",
  "Lord of the Rings",
  "Harry Potter",
  "Fast & Furious",
  "James Bond",
  "Jurassic Park",
  "Mission Impossible",
  "John Wick",
  "Transformers",
  "Matrix",
  "Indiana Jones",
  "Toy Story",
  "The Hunger Games",
  "Men in Black",
  "Ghostbusters",
  "Back to the Future",
  "Terminator",
  "Rocky",
  "Pirates of the Caribbean"
];

// This will store our dynamically fetched titles
let dynamicPopularTitles = [...defaultPopularTitles];
let lastFetchTime = 0;
const FETCH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Dynamic title list that combines hardcoded titles with those from TMDB API
 * Gets refreshed periodically to keep up with new releases
 */
export async function getPopularTitles() {
  const currentTime = Date.now();
  
  // Check if we should refresh the titles (once per day)
  if (currentTime - lastFetchTime > FETCH_INTERVAL) {
    try {
      console.log('Fetching fresh titles from TMDB...');
      const tmdbTitles = await fetchPopularTitles();
      
      if (tmdbTitles && tmdbTitles.length > 0) {
        // Combine with default titles and remove duplicates
        dynamicPopularTitles = [...new Set([...defaultPopularTitles, ...tmdbTitles])];
        lastFetchTime = currentTime;
        console.log(`Title database updated with ${dynamicPopularTitles.length} unique titles`);
      }
    } catch (error) {
      console.error('Failed to update title database:', error);
      // Keep using existing titles if fetch fails
    }
  }
  
  return dynamicPopularTitles;
}

// Expose the current titles for direct access when needed
export const popularTitles = defaultPopularTitles;
