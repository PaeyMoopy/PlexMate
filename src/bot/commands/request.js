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

  try {
    // Get max results from settings (default to 5 since localStorage isn't available in Node)
    const maxResults = 3;

    // Search TMDB
    const results = await searchTMDB(query);
    
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
        
        // Create reaction collector
        const suggestionFilter = (reaction, user) => {
          const validReactions = ['1️⃣', '2️⃣', '3️⃣', '❌'].slice(0, suggestions.length + 1);
          return validReactions.includes(reaction.emoji.name) && user.id === message.author.id;
        };
        
        const suggestionCollector = suggestionMsg.createReactionCollector({ 
          filter: suggestionFilter, 
          time: 30000,
          max: 1
        });
        
        suggestionCollector.on('collect', async (reaction) => {
          // Handle suggestion selection
          if (reaction.emoji.name === '❌') {
            await safeDeleteMessage(suggestionMsg, 'suggestions cancelled');
            await message.reply('Search cancelled.');
            suggestionCollector.stop('cancelled');
            return;
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

    // Create selection message with results
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Search Results')
      .setDescription(`Found ${results.length} results for "${query}". React with the number of your selection, or ❌ to cancel.`)
      .addFields(
        results.slice(0, maxResults).map((result, index) => {
          const title = result.title || result.name;
          const year = getYear(result);
          const type = result.media_type === 'movie' ? 'Movie' : 'TV Show';
          return {
            name: `${index + 1}. ${title} ${year}`,
            value: `Type: ${type}\nOverview: ${result.overview ? (result.overview.length > 150 ? result.overview.substring(0, 150) + '...' : result.overview) : 'No overview available'}`
          };
        })
      );

    const selectionMsg = await message.reply({ embeds: [embed] });
    
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
          
          if (availability && availability.available) {
            // Already available
            const embed = createStatusEmbed(
              selected,
              `✅ Good news! ${selected.title || selected.name} is already available in the library!`,
              '#00FF00' // Green for available content
            );
            await processingMsg.edit({ content: '', embeds: [embed] });
            // Delete the search results message to keep the chat clean
            await safeDeleteMessage(selectionMsg, 'all seasons available');
            
            // Delete correction message if it exists
            if (correctionMsg) {
              await safeDeleteMessage(correctionMsg, 'request completed - already available');
            }
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
      if (reason !== 'cancelled' && reason !== 'selected') {
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
