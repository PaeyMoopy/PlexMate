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
export function findSimilarTitles(query, titles, threshold = 0.6, limit = 3) {
  if (!query || !titles || !titles.length) return [];
  
  // Calculate similarity scores for each title
  const similarities = titles.map(title => ({
    title,
    score: stringSimilarity(query, title)
  }));
  
  // Sort by similarity score (highest first) and filter by threshold
  return similarities
    .filter(item => item.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(item => item.title);
}

/**
 * Popular movie and TV show titles for more accurate suggestions
 * This can be expanded over time with more titles
 */
export const popularTitles = [
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
  
  // Popular Movie Franchises
  "Star Wars",
  "Lord of the Rings",
  "Harry Potter",
  "Fast & Furious",
  "James Bond",
  "Jurassic Park",
  "Mission Impossible",
  "John Wick",
  "Transformers",
  "Matrix"
];
