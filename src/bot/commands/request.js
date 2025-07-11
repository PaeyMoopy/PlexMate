import { searchTMDB } from '../services/tmdb.js';
import { createRequest, checkAvailability } from '../services/overseerr.js';
import { addSubscription } from '../services/database.js';
import { EmbedBuilder } from 'discord.js';
import { findSimilarTitles, getPopularTitles } from '../utils/stringUtils.js';

/**
 * Safely delete a message with retry
 * @param {Object} msg - The Discord.js message to delete
 * @param {string} context - Context for logging
 */
async function safeDeleteMessage(msg, context) {
  if (!msg || !msg.id) {
    console.log(`Skipping message deletion in context ${context}: Message reference invalid or null`);
    return;
  }

  try {
    // Check if we still have the message in Discord's cache
    // If not, it might have been deleted already
    if (!msg.channel.messages.cache.has(msg.id)) {
      console.log(`Message already deleted or not in cache (context: ${context})`);
      return;
    }

    // Add a slight delay before deletion to ensure Discord API is ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    await msg.delete();
    console.log(`Successfully deleted message in context: ${context}`);
  } catch (error) {
    if (error.code === 10008) { // Unknown Message error
      console.log(`Message was already deleted (context: ${context})`);
    } else {
      console.error(`Failed to delete message in context ${context}:`, error);
    }
  }
}

/**
 * Create a rich embed response with media details
 * @param {Object} mediaItem - The media item data
 * @param {string} statusMessage - Status message to display
 * @param {string} color - Color for the embed (hex code)
 * @returns {EmbedBuilder} Discord.js embed
 */
function createStatusEmbed(mediaItem, statusMessage, color = '#0099ff') {
  const title = mediaItem.title || mediaItem.name;
  const year = getYear(mediaItem);
  const fullTitle = `${title} ${year}`.trim();
  
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(fullTitle)
    .setURL(getDetailUrl(mediaItem.media_type, mediaItem.id))
    .setDescription(statusMessage)
    .setThumbnail(getPosterUrl(mediaItem.poster_path))
    .setFooter({ text: `Type: ${mediaItem.media_type}` });
}

// Helper functions for displaying media information
function getYear(result) {
  if (!result) return '';
  const date = result.release_date || result.first_air_date;
  return date ? `(${date.substring(0, 4)})` : '';
}

function getDetailUrl(mediaType, id) {
  return `https://www.themoviedb.org/${mediaType}/${id}`;
}

function getPosterUrl(posterPath) {
  return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
}

export async function handleRequest(message, query, correctionMsg = null) {
  if (!query) {
    await message.reply('Please provide a title to search for!');
    return;
  }
  
  let selectionMsg = null; // Define this outside the try block so catch can access it
  
  try {
    // Get max results from settings (default to 5 since localStorage isn't available in Node)
    const maxResults = 3;

    // Extract if user specified a media type in parentheses
    const typeMatch = query.match(/\((movie|tv)\)$/i);
    let originalQuery = query;
    let searchQuery = query;
    let forcedMediaType = null;
    
    if (typeMatch) {
      forcedMediaType = typeMatch[1].toLowerCase();
      searchQuery = query.replace(/\((movie|tv)\)$/i, '').trim();
    }
    
    // Search TMDB with the correctly parsed query (NOT the raw query with tags)
    console.log(`Sending search request for "${searchQuery}" with forcedMediaType=${forcedMediaType}`);
    let results = await searchTMDB(searchQuery, forcedMediaType);
    
    // Log the results for debugging
    console.log(`TMDB returned ${results.length} results for query: "${query}"`);
    console.log(`Media types in results: ${results.map(r => r.media_type).join(', ')}`);
    
    // Apply EXTREMELY strict media type filtering (no exceptions)
    if (forcedMediaType) {
      console.log(`Strictly filtering for media_type=${forcedMediaType} only`);
      
      // Only keep exact media type matches, no fallbacks
      const filteredResults = results.filter(result => {
        // Extra strict validation for each media type
        if (forcedMediaType === 'tv') {
          // For TV: must have media_type=tv AND have TV-specific properties
          const isTvShow = result.media_type === 'tv' && 
                         result.first_air_date !== undefined && 
                         result.name !== undefined;
          return isTvShow;
        } else if (forcedMediaType === 'movie') {
          // For movies: must have media_type=movie AND have movie-specific properties
          const isMovie = result.media_type === 'movie' && 
                        result.release_date !== undefined && 
                        result.title !== undefined;
          return isMovie;
        }
        return false;
      });
      
      console.log(`After strict filtering: ${filteredResults.length} results remain`);
      results = filteredResults;
    }
    
    // If no results and we had a media type specified, DON'T show wrong media types
    // Instead, check if there would have been results for the other media type
    // and suggest those as alternatives without showing them directly
    if (results.length === 0 && typeMatch) {
      console.log(`No ${forcedMediaType} results found for "${query}", checking for other media types for suggestions only`);
      
      // Try without media type restriction, but only to offer suggestions
      const generalResults = await searchTMDB(searchQuery);
      
      // Find results of the opposite media type
      const otherMediaType = forcedMediaType === 'tv' ? 'movie' : 'tv';
      const oppositeResults = generalResults.filter(result => result.media_type === otherMediaType);
      
      if (oppositeResults.length > 0) {
        // There are results, but of the wrong media type
        // Don't show these directly, but suggest them
        console.log(`Found ${oppositeResults.length} results of type ${otherMediaType}, offering as suggestions only`);
        
        // Create a message to suggest trying the other media type
        const suggestionType = otherMediaType === 'tv' ? 'TV shows' : 'movies';
        const embed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle(`No ${forcedMediaType === 'tv' ? 'TV shows' : 'movies'} found`)
          .setDescription(
            `I couldn't find any ${forcedMediaType === 'tv' ? 'TV shows' : 'movies'} matching "${searchQuery}"\n\n` +
            `However, I found ${oppositeResults.length} ${suggestionType} with that name. ` +
            `Try searching for "${searchQuery} (${otherMediaType})" instead if you're looking for ${suggestionType}.`
          );
        
        await message.reply({ embeds: [embed] });
        return; // End the command here
      }
      
      // Otherwise, if there are no results of any media type, continue to the
      // regular no-results handling below
      if (forcedMediaType === 'tv') {
        // Check if there are similarly named TV shows by adding a space
        // (e.g., "Black Bird" instead of "Blackbird")
        const wordParts = searchQuery.split(' ');
        if (wordParts.length === 1 && wordParts[0].length > 6) {
          // Single word query - try inserting a space in the middle
          const middle = Math.floor(wordParts[0].length / 2);
          const altQuery = wordParts[0].substring(0, middle) + ' ' + wordParts[0].substring(middle);
          console.log(`Trying alternative query for TV: "${altQuery}"`);
          const altResults = await searchTMDB(altQuery + ' (tv)');
          if (altResults.length > 0) {
            const altTvResults = altResults.filter(result => result.media_type === 'tv');
            if (altTvResults.length > 0) {
              // Show a message about the alternative search
              const correctionMsg = await message.reply(`No TV shows found for "${searchQuery}". Did you mean "${altQuery}"? Here are the search results:`);
              results = altTvResults;
            }
          }
        }
      }
      
      // If still no results with specific type, do NOT show all results
      // We want strict filtering when a media type is specified
      
      // If still no results and title is one word, try with a space
      if (results.length === 0 && !searchQuery.includes(' ')) {
        console.log(`Trying with space: "${searchQuery.charAt(0)}${searchQuery.substring(1)}"`);
        const spaceQuery = searchQuery.charAt(0) + ' ' + searchQuery.substring(1);
        const spaceResults = await searchTMDB(spaceQuery);
        
        if (spaceResults.length > 0) {
          results = spaceResults;
        }
      }
    }
    
    if (results.length === 0) {
      // Get the current dynamic title list
      const dynamicTitles = await getPopularTitles();
      
      // Try to find similar titles using our string utility
      const suggestions = findSimilarTitles(query, dynamicTitles, 0.55, 3);
      
      if (suggestions.length > 0) {
        // Create an embed with suggestions
        const suggestionsEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('No results found')
          .setDescription(
            `I couldn't find any results for "${query}"\n\n` +
            `**Did you mean:**\n${suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`
          )
          .setFooter({ text: 'React with a number to select a suggestion or ❌ to cancel' });
          
        const suggestionMsg = await message.reply({ embeds: [suggestionsEmbed] });
        
        // Add reaction options
        for (let i = 0; i < suggestions.length; i++) {
          await suggestionMsg.react(`${i + 1}️⃣`);
        }
        await suggestionMsg.react('❌');
        
        // Create reaction collector with improved emoji handling
        const suggestionFilter = (reaction, user) => {
          // Add additional logging to debug emoji issues
          console.log(`Filtering reaction: ${reaction.emoji.name} (${reaction.emoji.identifier}) from user ID ${user.id}`);
          
          // The array of valid number emojis (1-3) plus the cancel emoji
          const validReactions = ['1️⃣', '2️⃣', '3️⃣'].slice(0, suggestions.length);
          
          // Handle the cancel emoji separately for more robust detection
          const isValidNumberEmoji = validReactions.includes(reaction.emoji.name);
          const isCancelEmoji = reaction.emoji.name === '❌' || reaction.emoji.identifier === '%E2%9D%8C';
          
          // Check if it's a valid reaction and from the correct user
          const isValid = (isValidNumberEmoji || isCancelEmoji) && user.id === message.author.id;
          console.log(`Reaction valid: ${isValid} (number: ${isValidNumberEmoji}, cancel: ${isCancelEmoji})`);
          
          return isValid;
        };
        
        const suggestionCollector = suggestionMsg.createReactionCollector({ 
          filter: suggestionFilter, 
          time: 30000,
          max: 1
        });
        
        suggestionCollector.on('collect', async (reaction) => {
          try {
            console.log(`Reaction collected: ${reaction.emoji.name} by user ${reaction.users.cache.last()?.username}`);
            
            // Handle suggestion selection
            if (reaction.emoji.name === '❌') {
              console.log('Cancel reaction detected, processing cancellation');
              await message.reply('Search cancelled.');
              await safeDeleteMessage(suggestionMsg, 'suggestions cancelled');
              suggestionCollector.stop('cancelled');
              return;
            }
          } catch (error) {
            console.error('Error handling reaction:', error);
            await message.reply('There was an error processing your reaction. Please try again.');
            suggestionCollector.stop('error');
          }
          
          // Get selected suggestion
          const suggestionIndex = Number(reaction.emoji.name[0]) - 1;
          const selectedSuggestion = suggestions[suggestionIndex];
          
          // Recursively call handleRequest with the suggested title
          const correctedQuery = suggestions[suggestionIndex];
          const correctionMsg = await message.reply(`🔍 Searching for "${correctedQuery}" instead...`);
          const results = await searchTMDB(correctedQuery);
          
          if (results.length === 0) {
            await message.reply(`❌ No results found for "${correctedQuery}" either. Please try another search.`);
            await safeDeleteMessage(correctionMsg, 'no results for correction');
            await safeDeleteMessage(suggestionMsg, 'no results for correction');
            return;
          }
          
          await safeDeleteMessage(suggestionMsg, 'correction completed');
          await handleRequest(message, correctedQuery, correctionMsg);
          
          suggestionCollector.stop('selected');
        });
        
        suggestionCollector.on('end', async (_, reason) => {
          // Only show timeout message if it actually timed out
          if (reason === 'time') {
            await message.reply('Suggestion selection timed out. Please try again.');
            // Delete the suggestion message on timeout
            await safeDeleteMessage(suggestionMsg, 'suggestion timeout');
          }
        });
        
        return;
      } else {
        await message.reply('No results found!');
        return;
      }
    }

    // Create a message with search results header
    const headerEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle(`Search Results`)
      .setDescription(`Found ${results.length} results for "${query}". React with the number of your selection, or ❌ to cancel.`);
    
    // Create individual embeds for each result
    const resultEmbeds = [];
    resultEmbeds.push(headerEmbed);
    
    // First check availability for all results to avoid waiting during the display loop
    const availabilityChecks = [];
    for (let i = 0; i < Math.min(maxResults, results.length); i++) {
      const result = results[i];
      availabilityChecks.push(checkAvailability(result.media_type, result.id));
    }
    
    // Wait for all availability checks to complete
    const availabilityResults = await Promise.all(availabilityChecks);
    
    for (let i = 0; i < Math.min(maxResults, results.length); i++) {
      const result = results[i];
      const availability = availabilityResults[i];
      const isAvailable = availability && availability.isAvailable;
      
      // Format result info
      const title = result.media_type === 'tv' ? result.name : result.title;
      const year = result.media_type === 'tv' 
        ? (result.first_air_date ? ` (${result.first_air_date.substring(0, 4)})` : '') 
        : (result.release_date ? ` (${result.release_date.substring(0, 4)})` : '');
      const type = result.media_type === 'tv' ? 'TV Show' : 'Movie';
      
      const overview = result.overview 
        ? (result.overview.length > 150 ? result.overview.substring(0, 150) + '...' : result.overview) 
        : 'No overview available';
      
      // Add availability info to description
      let description = `Type: ${type}\nOverview: ${overview}`;
      
      // Create individual embed for each result with its own poster
      const resultEmbed = new EmbedBuilder()
        .setColor(isAvailable ? '#00FF00' : '#0099ff') // Green for available content, blue for unavailable
        .setTitle(`${i + 1}. ${title}${year}${isAvailable ? ' ✅' : ''}`)
        .setDescription(isAvailable 
          ? `✅ Already available in Plex!\nType: ${type}\nOverview: ${overview}` 
          : description);
        
      // Add poster thumbnail for each result
      if (result.poster_path) {
        resultEmbed.setThumbnail(getPosterUrl(result.poster_path));
      }
      
      resultEmbeds.push(resultEmbed);
    }

    // Send a single message with multiple embeds
    const selectionMsg = await message.reply({ embeds: resultEmbeds });
    
    // Add reaction options
    for (let i = 0; i < Math.min(maxResults, results.length); i++) {
      await selectionMsg.react(`${i + 1}️⃣`);
    }
    await selectionMsg.react('❌');

    // Create reaction collector
    const filter = (reaction, user) => {
      const validReactions = ['1️⃣', '2️⃣', '3️⃣', '❌'].slice(0, Math.min(maxResults, results.length) + 1);
      return validReactions.includes(reaction.emoji.name) && user.id === message.author.id;
    };
    
    const collector = selectionMsg.createReactionCollector({ 
      filter, 
      time: 60000, 
      max: 1 
    });

    collector.on('collect', async (reaction) => {
      try {
        // Handle cancel selection
        if (reaction.emoji.name === '❌') {
          await safeDeleteMessage(selectionMsg, 'cancelled');
          await message.reply('Selection cancelled.');
          collector.stop('cancelled');
          return;
        }
        
        // Get selected media item
        const resultIndex = Number(reaction.emoji.name[0]) - 1;
        const selected = results[resultIndex];
        
        // Create processing message
        const processingMsg = await message.reply(`⏳ Processing request for ${selected.title || selected.name}...`);

        try {
          // Check availability
          const availability = await checkAvailability(selected.media_type, selected.id);
          
          // Handle different availability scenarios
          if (availability && availability.isAvailable) {
            // Fully available in Plex
            const embed = createStatusEmbed(
              selected,
              `✅ Good news! ${selected.title || selected.name} is already available in the library!`,
              '#00FF00' // Green for available content
            );
            await processingMsg.edit({ content: '', embeds: [embed] });
            await safeDeleteMessage(selectionMsg, 'all seasons available');
            
            if (correctionMsg) {
              await safeDeleteMessage(correctionMsg, 'request completed - already available');
            }
            collector.stop('selected');
            return;
          } 
          // Media is in Sonarr/Radarr but not downloaded yet
          else if ((availability.inSonarr || availability.inRadarr) && !availability.isAvailable) {
            let statusMsg = '';
            let color = '#FFA500'; // Orange for pending content
            
            // Not released yet (upcoming)
            if (!availability.isReleased) {
              if (selected.media_type === 'tv') {
                const dateStr = availability.firstAired ? 
                  new Date(availability.firstAired).toLocaleDateString() : 'soon';
                statusMsg = `⏳ ${selected.name} has already been added to our library!

We're waiting for it to be released on ${dateStr}. It will be downloaded automatically once available.\n\nWould you like to subscribe for notifications when it's ready?`;
              } else {
                let dateStr = 'soon';
                if (availability.upcomingDigitalRelease) {
                  dateStr = new Date(availability.upcomingDigitalRelease).toLocaleDateString();
                }
                statusMsg = `⏳ ${selected.title} has already been added to our library!

We're waiting for the digital release on ${dateStr}. It will be downloaded automatically once available.\n\nWould you like to subscribe for notifications when it's ready?`;
              }
            } 
            // Released but not downloaded yet
            else {
              if (availability.notAvailableReason === 'currently_downloading') {
                statusMsg = `⏳ ${selected.title || selected.name} is currently downloading!

It should be available soon. Would you like to subscribe for notifications when it's ready?`;
              } else {
                statusMsg = `⏳ ${selected.title || selected.name} has already been added to our library!

It has been released, but we're still looking for a good quality version. Would you like to subscribe for notifications when it's ready?`;
              }
            }
            
            const embed = createStatusEmbed(selected, statusMsg, color);
            await processingMsg.edit({ content: '', embeds: [embed] });
            
            // Add reaction options for subscription
            await processingMsg.react('👍'); // Yes to subscribe
            await processingMsg.react('👎'); // No to skip subscription
            
            // Create a reaction collector for subscription response
            const subscriptionFilter = (reaction, user) => {
              return ['👍', '👎'].includes(reaction.emoji.name) && user.id === message.author.id;
            };
            
            const subscriptionCollector = processingMsg.createReactionCollector({
              filter: subscriptionFilter,
              time: 60000,
              max: 1
            });
            
            subscriptionCollector.on('collect', async (reaction) => {
              try {
                if (reaction.emoji.name === '👍') {
                  // User wants to subscribe
                  const success = await addSubscription(
                    message.author.id.toString(),
                    selected.id.toString(),
                    selected.media_type,
                    selected.title || selected.name,
                    selected.media_type === 'tv' // episode_subscription is true for TV shows
                  );
                  
                  if (success) {
                    const subscribeEmbed = createStatusEmbed(
                      selected,
                      `✅ You've been subscribed to ${selected.title || selected.name}! You'll be notified when it becomes available.`,
                      '#00FF00'
                    );
                    await processingMsg.edit({ embeds: [subscribeEmbed] });
                  } else {
                    const errorEmbed = createStatusEmbed(
                      selected,
                      `❌ There was an error creating your subscription. Please try again later.`,
                      '#FF0000'
                    );
                    await processingMsg.edit({ embeds: [errorEmbed] });
                  }
                } else {
                  // User doesn't want to subscribe
                  const noSubEmbed = createStatusEmbed(
                    selected,
                    `No problem! ${selected.title || selected.name} is being processed, but you won't be notified.`,
                    '#0099ff'
                  );
                  await processingMsg.edit({ embeds: [noSubEmbed] });
                }
              } catch (error) {
                console.error('Error handling subscription reaction:', error);
                await message.reply('An error occurred while processing your subscription choice.');
              } finally {
                await safeDeleteMessage(selectionMsg, 'subscription decision made');
                if (correctionMsg) {
                  await safeDeleteMessage(correctionMsg, 'subscription decision made');
                }
              }
            });
            
            subscriptionCollector.on('end', async (_, reason) => {
              if (reason === 'time') {
                const timeoutEmbed = createStatusEmbed(
                  selected,
                  `Subscription choice timed out. ${selected.title || selected.name} is still being processed, but you won't be notified.`,
                  '#0099ff'
                );
                await processingMsg.edit({ embeds: [timeoutEmbed] });
              }
            });
            
            // Stop the main collector
            collector.stop('subscription_offered');
            return;
          }

          // Create request for show or movie
          if (selected.media_type === 'tv') {
            // Get the available seasons
            const requestableSeasons = [];
            
            // For TV shows, we need to request which seasons are needed
            for (let i = 1; i <= 50; i++) {  // Arbitrary limit to 50 seasons
              // We'll check if the season exists and is not available
              
              const seasonAvailability = availability?.seasons?.find(s => s.seasonNumber === i);
              
              // If we have no info about this season, assume we've reached the end of the show
              if (!seasonAvailability && i > 1) break;
              
              // Add season if unavailable
              if (!seasonAvailability || !seasonAvailability.available) {
                requestableSeasons.push(i);
              }
            }
            
            // If no seasons to request
            if (requestableSeasons.length === 0) {
              const embed = createStatusEmbed(
                selected,
                `✅ Good news! All seasons of ${selected.name} are already available in the library!`,
                '#00FF00' // Green for available content
              );
              await processingMsg.edit({ content: '', embeds: [embed] });
              // Delete the search results message to keep the chat clean
              await safeDeleteMessage(selectionMsg, 'all seasons available');
              
              // Delete correction message if it exists
              if (correctionMsg) {
                await safeDeleteMessage(correctionMsg, 'request completed - all seasons available');
              }
              
              // Stop the collector to prevent timeout message
              collector.stop('selected');
              return;
            }

            // Create request with specific seasons
            const discordId = message.author.id.toString();
            console.log('Making request for Discord user:', {
              rawId: message.author.id,
              stringId: discordId,
              match: discordId === "265316362900078592"
            });
            await createRequest({
              mediaType: selected.media_type,
              mediaId: selected.id,
              userId: discordId,
              seasons: requestableSeasons
            });
          } else {
            // Create movie request
            const discordId = message.author.id.toString();
            console.log('Making request for Discord user:', {
              rawId: message.author.id,
              stringId: discordId,
              match: discordId === "265316362900078592"
            });
            await createRequest({
              mediaType: selected.media_type,
              mediaId: selected.id,
              userId: discordId
            });
          }

          // Add subscription to SQLite database
          const success = await addSubscription(
            message.author.id.toString(),
            selected.id.toString(),
            selected.media_type,
            selected.title || selected.name,
            selected.media_type === 'tv' // episode_subscription is true for TV shows
          );

          if (!success) {
            console.error('Error adding subscription to database');
            throw new Error('Failed to add subscription');
          }

          const embed = createStatusEmbed(
            selected,
            `✳️ Request for ${selected.title || selected.name} has been submitted!

You'll be notified when it's available.`,
            '#0099ff' // Blue for success
          );
          await processingMsg.edit({ content: '', embeds: [embed] });
          
          // Delete the search results message to keep the chat clean
          await safeDeleteMessage(selectionMsg, 'request submitted');
          
          // Delete correction message if it exists
          if (correctionMsg) {
            await safeDeleteMessage(correctionMsg, 'request completed');
          }
          
          // Stop the collector to prevent timeout message
          collector.stop('selected');
          
        } catch (error) {
          console.error('Error processing request:', error);
          const errorEmbed = createStatusEmbed(
            selected,
            `❌ Error processing request for ${selected.title || selected.name}.

Please try again later.`,
            '#FF0000' // Red for errors
          );
          await processingMsg.edit({ content: '', embeds: [errorEmbed] });
          // Delete the search results message to keep the chat clean
          await safeDeleteMessage(selectionMsg, 'error processing');
          
          // Delete correction message if it exists
          if (correctionMsg) {
            await safeDeleteMessage(correctionMsg, 'request error');
          }
          
          // Stop the collector to prevent timeout message
          collector.stop('error');
        }
      } catch (error) {
        console.error('Error handling reaction:', error);
        await message.reply('An error occurred while processing your selection. Please try again.');
        
        // Delete correction message if it exists
        if (correctionMsg) {
          await safeDeleteMessage(correctionMsg, 'reaction error');
        }
      }
    });

    collector.on('end', async (_, reason) => {
      console.log('Request collector ended with reason:', reason);
      if (reason === 'time') {
        // Simple timeout message - we don't have a specific selection to show
        await message.reply('Search results timed out. Please try again.');
        // Delete the search results message on timeout to keep the chat clean
        await safeDeleteMessage(selectionMsg, 'request timeout');
        
        // Delete correction message if it exists
        if (correctionMsg) {
          await safeDeleteMessage(correctionMsg, 'request timeout');
        }
      }
    });

  } catch (error) {
    console.error('Error handling request:', error);
    await message.reply('An error occurred while processing your request. Please try again later.');
    
    // Delete correction message if it exists
    if (correctionMsg) {
      await safeDeleteMessage(correctionMsg, 'general error');
    }
  }
}
