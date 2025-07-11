import { searchTMDB } from '../services/tmdb.js';
import { EmbedBuilder } from 'discord.js';
import { addSubscription, getSubscriptions } from '../services/database.js';
import { checkAvailability, checkIfS1E1Exists } from '../services/overseerr.js';
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
 * @param {boolean} isEpisodeSubscription - Whether this is an episode subscription
 * @returns {EmbedBuilder} Discord.js embed
 */
function createStatusEmbed(mediaItem, statusMessage, color = '#0099ff', isEpisodeSubscription = false) {
  const title = mediaItem.title || mediaItem.name;
  const date = mediaItem.release_date || mediaItem.first_air_date;
  const year = date ? `(${date.substring(0, 4)})` : '';
  const fullTitle = `${title} ${year}`.trim();
  
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(fullTitle)
    .setURL(`https://www.themoviedb.org/${mediaItem.media_type}/${mediaItem.id}`)
    .setDescription(statusMessage)
    .setThumbnail(`https://image.tmdb.org/t/p/w500${mediaItem.poster_path}`)
    .setFooter({ text: `Type: ${mediaItem.media_type} • ${isEpisodeSubscription ? 'Episode notifications enabled' : 'Release notification only'}` });
}

export async function handleSubscribe(message, query, correctionMsg = null) {
  if (!query) {
    const embed = createStatusEmbed({}, 'Please provide a title to subscribe to!', '#ff0000');
    await message.reply({ embeds: [embed] });
    return;
  }

  try {
    // Check for episode subscription flag
    let isEpisodeSubscription = query.toLowerCase().includes('-e') || query.toLowerCase().includes('-episode');
    let searchQuery = query.replace(/(-e|-episode)(\s|$)/i, '').trim();
    
    // Extract if user specified a media type in parentheses
    const typeMatch = searchQuery.match(/\((movie|tv)\)$/i);
    let forcedMediaType = null;
    
    if (typeMatch) {
      forcedMediaType = typeMatch[1].toLowerCase();
      searchQuery = searchQuery.replace(/\((movie|tv)\)$/i, '').trim();
    }
    
    // Force TV search if episode subscription - episode subscriptions always require TV shows
    let mediaTypeToForce = isEpisodeSubscription ? 'tv' : forcedMediaType;
    let results = await searchTMDB(searchQuery, mediaTypeToForce);
    
    // Log the results for debugging
    console.log(`TMDB returned ${results.length} results for subscribe query: "${searchQuery}"`);
    console.log(`Media types in subscribe results: ${results.map(r => r.media_type).join(', ')}`);
    
    // Apply EXTREMELY strict media type filtering (no exceptions) - same logic as request.js
    if (mediaTypeToForce) {
      console.log(`Strictly filtering subscribe for media_type=${mediaTypeToForce} only`);
      
      // Only keep exact media type matches, no fallbacks
      const filteredResults = results.filter(result => {
        // Extra strict validation for each media type
        if (mediaTypeToForce === 'tv') {
          // For TV: must have media_type=tv AND have TV-specific properties
          const isTvShow = result.media_type === 'tv' && 
                         result.first_air_date !== undefined && 
                         result.name !== undefined;
          return isTvShow;
        } else if (mediaTypeToForce === 'movie') {
          // For movies: must have media_type=movie AND have movie-specific properties
          const isMovie = result.media_type === 'movie' && 
                        result.release_date !== undefined && 
                        result.title !== undefined;
          return isMovie;
        }
        return false;
      });
      
      console.log(`After strict filtering: ${filteredResults.length} subscribe results remain`);
      results = filteredResults;
    }
    
    if (results.length === 0) {
      // Get the current dynamic title list
      const dynamicTitles = await getPopularTitles();
      
      // Try to find similar titles using our string utility
      const suggestions = findSimilarTitles(searchQuery, dynamicTitles, 0.55, 3);
      
      if (suggestions.length > 0) {
        // Create an embed with suggestions
        const suggestionsEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('No results found')
          .setDescription(
            `I couldn't find any results for "${searchQuery}"\n\n` +
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
          console.log(`Subscribe - Filtering reaction: ${reaction.emoji.name} (${reaction.emoji.identifier}) from user ID ${user.id}`);
          
          // The array of valid number emojis (1-3) plus the cancel emoji
          const validReactions = ['1️⃣', '2️⃣', '3️⃣'].slice(0, suggestions.length);
          
          // Handle the cancel emoji separately for more robust detection
          const isValidNumberEmoji = validReactions.includes(reaction.emoji.name);
          const isCancelEmoji = reaction.emoji.name === '❌' || reaction.emoji.identifier === '%E2%9D%8C';
          
          // Check if it's a valid reaction and from the correct user
          const isValid = (isValidNumberEmoji || isCancelEmoji) && user.id === message.author.id;
          console.log(`Subscribe - Reaction valid: ${isValid} (number: ${isValidNumberEmoji}, cancel: ${isCancelEmoji})`);
          
          return isValid;
        };
        
        const suggestionCollector = suggestionMsg.createReactionCollector({ 
          filter: suggestionFilter, 
          time: 30000,
          max: 1
        });
        
        suggestionCollector.on('collect', async (reaction) => {
          try {
            console.log(`Subscribe - Reaction collected: ${reaction.emoji.name} by user ${reaction.users.cache.last()?.username}`);
            
            // Handle suggestion selection
            if (reaction.emoji.name === '❌') {
              console.log('Subscribe - Cancel reaction detected, processing cancellation');
              await message.reply('Search cancelled.');
              await safeDeleteMessage(suggestionMsg, 'suggestions cancelled');
              suggestionCollector.stop('cancelled');
              return;
            }
          } catch (error) {
            console.error('Subscribe - Error handling reaction:', error);
            await message.reply('There was an error processing your reaction. Please try again.');
            suggestionCollector.stop('error');
          }
          
          // Get selected suggestion
          const suggestionIndex = Number(reaction.emoji.name[0]) - 1;
          const selectedSuggestion = suggestions[suggestionIndex];
          
          // Recursively call handleSubscribe with the suggested title
          await safeDeleteMessage(suggestionMsg, 'suggestion selected');
          const correctionMsg = await message.reply(`🔍 Searching for "${selectedSuggestion}" instead...`);
          
          // Add this line to the handleSubscribe function to track and delete correction messages
          await handleSubscribe(message, selectedSuggestion + (isEpisodeSubscription ? ' -e' : ''), correctionMsg);
          
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

    // Show search results
    // Create a message with search results header
    const headerEmbed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Search Results')
      .setDescription(`Found ${results.length} results for "${searchQuery}".\nReact with the number of your selection or ❌ to cancel.`);
    
    // Create individual embeds for each result
    const resultEmbeds = [];
    resultEmbeds.push(headerEmbed);
    
    // Add each result with its own embed and thumbnail
    for (let i = 0; i < Math.min(5, results.length); i++) {
      const result = results[i];
      const title = result.title || result.name;
      const date = result.release_date || result.first_air_date;
      const year = date ? `(${date.substring(0, 4)})` : '';
      const resultType = result.media_type === 'movie' ? 'Movie' : 'TV Show';
      const overview = result.overview ? result.overview.substring(0, 100) + '...' : 'No overview available';
      
      // Create individual embed for each result with its own poster
      const resultEmbed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${i + 1}. ${title} ${year}`)
        .setDescription(`Type: ${resultType}\nOverview: ${overview}`);
        
      // Add poster thumbnail for each result
      if (result.poster_path) {
        resultEmbed.setThumbnail(`https://image.tmdb.org/t/p/w500${result.poster_path}`);
      }
      
      resultEmbeds.push(resultEmbed);
    }

    // Send a single message with multiple embeds
    const selectionMsg = await message.reply({ embeds: resultEmbeds });

    // Add reaction options
    const maxResults = Math.min(results.length, 5);
    for (let i = 0; i < maxResults; i++) {
      await selectionMsg.react(`${i + 1}️⃣`);
    }
    await selectionMsg.react('❌');

    // Create reaction collector
    const filter = (reaction, user) => {
      const validReactions = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '❌'].slice(0, maxResults + 1);
      return validReactions.includes(reaction.emoji.name) && user.id === message.author.id;
    };
    
    const collector = selectionMsg.createReactionCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async (reaction) => {
      // Handle selection
      try {
        if (reaction.emoji.name === '❌') {
          await safeDeleteMessage(selectionMsg, 'selection cancelled');
          await message.reply('Selection cancelled.');
          collector.stop('cancelled');
          return;
        }
        
        // Get selected item
        const resultIndex = Number(reaction.emoji.name[0]) - 1;
        const selected = results[resultIndex];
        
        // Check for existing subscription
        const existingSubscription = getSubscriptions(message.author.id)
          .find(s => s.mediaId === selected.id.toString());
        
        // For TV shows, handle episode subscription logic
        if (selected.media_type === 'tv' && isEpisodeSubscription) {
          // Check if S1E1 exists in Overseerr
          const s1e1Exists = await checkIfS1E1Exists(selected.id);
          
          if (!s1e1Exists) {
            // Check availability
            const availability = await checkAvailability(selected.media_type, selected.id);
            
            if (!availability || !availability.available) {
              // Show confirmation dialog for potential episode subscription issues
              const confirmEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`⚠️ Episode Notification Warning for ${selected.name}`)
                .setDescription(
                  `This TV show doesn't have season 1 episode 1 available yet. ` +
                  `Episode notifications may not work properly until the show is added.\n\n` +
                  `Do you want to:\n` +
                  `👍 Add a regular release notification subscription\n` +
                  `👎 Cancel this subscription`
                )
                .setThumbnail(`https://image.tmdb.org/t/p/w500${selected.poster_path}`);
                
              const confirmMsg = await message.reply({ embeds: [confirmEmbed] });
              
              // Add reaction options
              await confirmMsg.react('👍');
              await confirmMsg.react('👎');
              
              // Create a filter to only accept reactions from the original message author
              const confirmFilter = (reaction, user) => {
                return ['👍', '👎'].includes(reaction.emoji.name) && user.id === message.author.id;
              };
              
              const confirmCollector = confirmMsg.createReactionCollector({ 
                filter: confirmFilter, 
                time: 30000,
                max: 1
              });
              
              confirmCollector.on('collect', async (reaction) => {
                await safeDeleteMessage(confirmMsg, 'confirmation selected');
                
                if (reaction.emoji.name === '👍') {
                  // Add a regular subscription instead
                  isEpisodeSubscription = false;
                  
                  const success = addSubscription(
                    message.author.id.toString(),
                    selected.id.toString(),
                    selected.media_type,
                    selected.name,
                    false // regular subscription
                  );
                  
                  if (!success) {
                    throw new Error('Failed to add subscription');
                  }
                  
                  const subscribeEmbed = createStatusEmbed(
                    selected,
                    `✅ You are now subscribed to "${selected.name}" (release notification only).`,
                    '#00FF00', // Green for success
                    false
                  );
                  
                  await message.reply({ embeds: [subscribeEmbed] });
                  
                  // Delete the correction message if it exists
                  if (correctionMsg) {
                    await safeDeleteMessage(correctionMsg, 'subscription completed - converted to regular');
                  }
                  
                } else {
                  const cancelEmbed = createStatusEmbed(
                    selected,
                    `❌ Subscription cancelled.`,
                    '#FF0000', // Red for cancel
                    false
                  );
                  await message.reply({ embeds: [cancelEmbed] });
                  
                  // Delete the correction message if it exists
                  if (correctionMsg) {
                    await safeDeleteMessage(correctionMsg, 'subscription cancelled in confirmation');
                  }
                }
                
                confirmCollector.stop('selected');
              });
              
              confirmCollector.on('end', async (collected, reason) => {
                // Only show timeout message if it actually timed out
                if (reason === 'time') {
                  await message.reply('Subscription creation timed out. Please try again.');
                  // Delete the confirmation message if it wasn't already deleted
                  await safeDeleteMessage(confirmMsg, 'confirmation timeout');
                  
                  // Delete the correction message if it exists
                  if (correctionMsg) {
                    await safeDeleteMessage(correctionMsg, 'confirmation timeout');
                  }
                }
              });
              
              // Delete the search results message since we're showing a confirmation
              await safeDeleteMessage(selectionMsg, 'showing confirmation');
              collector.stop('selected');
              return;
            }
          }
        }

        // Add or update subscription (only for non-problematic cases)
        const success = addSubscription(
          message.author.id.toString(),
          selected.id.toString(),
          selected.media_type,
          selected.title || selected.name,
          isEpisodeSubscription
        );

        if (!success) {
          throw new Error('Failed to add subscription');
        }

        // Delete the search results message
        await safeDeleteMessage(selectionMsg, 'subscription created');
        
        // Create appropriate rich embed response
        let statusMessage, statusColor;
        
        if (existingSubscription) {
          if (existingSubscription.episode_subscription === (isEpisodeSubscription ? 1 : 0)) {
            statusMessage = `ℹ️ You are already subscribed to ${selected.title || selected.name}!`;
            statusColor = '#FFA500'; // Orange for info
          } else {
            statusMessage = isEpisodeSubscription
              ? `✅ Updated! You will now receive episode notifications for "${selected.title || selected.name}"!`
              : `✅ Updated! You will now only receive release notifications for "${selected.title || selected.name}"!`;
            statusColor = '#00FF00'; // Green for success
          }
        } else {
          statusMessage = isEpisodeSubscription
            ? `✅ You are now subscribed to new episodes of "${selected.name}"!`
            : `✅ You are now subscribed to "${selected.title || selected.name}"!`;
          statusColor = '#00FF00'; // Green for success
        }
        
        const embed = createStatusEmbed(
          selected,
          statusMessage,
          statusColor,
          isEpisodeSubscription
        );
        
        await message.reply({ embeds: [embed] });
        
        // Delete the correction message if it exists
        if (correctionMsg) {
          await safeDeleteMessage(correctionMsg, 'subscription completed');
        }
        
      } catch (error) {
        console.error('Error managing subscription:', error);
        
        // Delete the search results message
        await safeDeleteMessage(selectionMsg, 'subscription error');
        
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Subscription Error')
          .setDescription(`❌ An error occurred while managing your subscription: ${error.message}`);
          
        await message.reply({ embeds: [errorEmbed] });
        
        // Delete the correction message if it exists
        if (correctionMsg) {
          await safeDeleteMessage(correctionMsg, 'subscription error');
        }
      }
      
      // Stop collector after user makes a selection
      collector.stop('selected');
    });
    
    collector.on('end', async (_, reason) => {
      // Log the reason for debugging purposes
      console.log('Subscription collector ended with reason:', reason);
      // Only show timeout message if it actually timed out
      if (reason === 'time') {
        await message.reply('Search results timed out. Please try again.');
        // Delete the search results message on timeout
        await safeDeleteMessage(selectionMsg, 'subscription timeout');
        
        // Delete the correction message if it exists
        if (correctionMsg) {
          await safeDeleteMessage(correctionMsg, 'subscription timeout');
        }
      }
    });

  } catch (error) {
    console.error('Error handling subscription:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Subscription Error')
      .setDescription(`❌ An error occurred while processing your subscription: ${error.message}`);
    
    await message.reply({ embeds: [errorEmbed] });
    
    // Delete the correction message if it exists
    if (correctionMsg) {
      await safeDeleteMessage(correctionMsg, 'subscription general error');
    }
  }
}
