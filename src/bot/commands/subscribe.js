import { searchTMDB } from '../services/tmdb.js';
import { EmbedBuilder } from 'discord.js';
import { addSubscription, getSubscriptions } from '../services/database.js';
import { checkAvailability, checkIfS1E1Exists } from '../services/overseerr.js';

/**
 * Safely delete a message with retry
 * @param {Object} msg - The Discord.js message to delete
 * @param {string} context - Context for logging
 */
async function safeDeleteMessage(msg, context) {
  try {
    // Add a slight delay before deletion to ensure Discord API is ready
    await new Promise(resolve => setTimeout(resolve, 1000));
    await msg.delete();
    console.log(`Successfully deleted message in context: ${context}`);
  } catch (error) {
    console.error(`Failed to delete message in context ${context}:`, error);
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

export async function handleSubscribe(message, query) {
  if (!query) {
    const embed = createStatusEmbed({}, 'Please provide a title to subscribe to!', '#ff0000');
    const msg = await message.reply({ embeds: [embed] });
    await safeDeleteMessage(msg, 'handleSubscribe: no query');
    return;
  }

  try {
    // Check for episode subscription flag
    let isEpisodeSubscription = query.toLowerCase().includes('-e') || query.toLowerCase().includes('-episode');
    let searchQuery = query.replace(/(-e|-episode)(\s|$)/i, '').trim();

    // Force TV search if episode subscription
    const results = await searchTMDB(searchQuery, isEpisodeSubscription ? 'tv' : null);
    
    if (results.length === 0) {
      await message.reply('No results found!');
      return;
    }

    // Default to 3 results
    const maxResults = 3;

    // Take first N results
    const options = results.slice(0, maxResults);
    
    // Create embeds for each result
    const embeds = options.map((result, index) => {
      return new EmbedBuilder()
        .setTitle(`${index + 1}. ${result.title || result.name}`)
        .setDescription(
          `Type: ${result.media_type}\n` +
          `Release Date: ${result.release_date || result.first_air_date}\n` +
          `Overview: ${result.overview}`
        )
        .setImage(`https://image.tmdb.org/t/p/w500${result.poster_path}`)
        .setFooter({ text: isEpisodeSubscription ? 'Episode notifications enabled' : 'Release notification only' });
    });

    // Add instructions embed
    const instructionsEmbed = new EmbedBuilder()
      .setTitle('Search Results')
      .setDescription(`Please select what you want to subscribe to${isEpisodeSubscription ? ' (Episode notifications)' : ''}:`);
    
    embeds.unshift(instructionsEmbed);

    const selectionMsg = await message.reply({ embeds });
    
    // Add number reactions
    for (let i = 0; i < options.length; i++) {
      await selectionMsg.react(`${i + 1}️⃣`);
    }
    await selectionMsg.react('❌');

    // Create reaction collector
    const filter = (reaction, user) => {
      return user.id === message.author.id;
    };

    const collector = selectionMsg.createReactionCollector({ filter, time: 30000 });

    collector.on('collect', async (reaction) => {
      if (reaction.emoji.name === '❌') {
        await message.reply('Subscription cancelled.');
        // Delete the search results message to keep the chat clean
        await safeDeleteMessage(selectionMsg, 'subscription cancelled');
        collector.stop('cancelled');
        return;
      }

      const index = Number(reaction.emoji.name[0]) - 1;
      const selected = options[index];

      try {
        // Check for existing subscription
        const subscriptions = getSubscriptions(message.author.id.toString());
        const existingSubscription = subscriptions.find(sub => sub.media_id === selected.id.toString());

        // Check for existing episode subscription first
        if (existingSubscription && existingSubscription.episode_subscription === 1 && isEpisodeSubscription) {
          const embed = createStatusEmbed(
            selected,
            `ℹ️ You are already subscribed to episodes of "${selected.title || selected.name}"!`,
            '#FFA500', // Orange for info
            isEpisodeSubscription
          );
          await message.reply({ embeds: [embed] });
          // Delete the search results message
          await safeDeleteMessage(selectionMsg, 'already subscribed to episodes');
          collector.stop('selected');
          return;
        }

        // For TV shows with "Release only" subscription, check if S1E1 already exists
        if (selected.media_type === 'tv' && !isEpisodeSubscription) {
          const { hasS1E1 } = await checkAvailability('tv', selected.id);
          
          // If already subscribed to release notifications, notify user and stop
          if (existingSubscription && existingSubscription.episode_subscription === 0 && !isEpisodeSubscription) {
            const embed = createStatusEmbed(
              selected,
              `ℹ️ You are already subscribed to release notifications for "${selected.title || selected.name}"!`,
              '#FFA500', // Orange for info
              isEpisodeSubscription
            );
            await message.reply({ embeds: [embed] });
            // Delete the search results message
            await safeDeleteMessage(selectionMsg, 'already subscribed to releases');
            collector.stop('selected');
            return;
          }

          if (hasS1E1) {
            // S1E1 already exists, so a "Release only" subscription would never trigger
            const warningEmbed = createStatusEmbed(
              selected,
              `⚠️ **Warning:** Season 1 of "${selected.name}" already exists in Plex!\n\n` +
              `A "Release only" subscription would never trigger notifications.\n\n` +
              `Would you like to subscribe for ALL episodes instead?`,
              '#FFA500', // Orange for warning
              false
            );
            const confirmMsg = await message.reply({ embeds: [warningEmbed] });
            
            // Add the thumbs up and down reactions
            await confirmMsg.react('👍');
            await confirmMsg.react('👎');
            
            // Create a filter to only accept reactions from the original message author
            const confirmFilter = (reaction, user) => {
              return ['👍', '👎'].includes(reaction.emoji.name) && user.id === message.author.id;
            };
            
            // Create reaction collector with the filter and timeout
            const confirmCollector = confirmMsg.createReactionCollector({ 
              filter: confirmFilter, 
              time: 30000,
              max: 1 
            });
            
            confirmCollector.on('collect', async (reaction, user) => {
              // Delete the confirmation message to keep the chat clean
              await safeDeleteMessage(confirmMsg, 'confirmation decision made');
              
              if (reaction.emoji.name === '👍') {
                // User opted for episode subscription instead
                isEpisodeSubscription = true;
                
                // Create the subscription
                const success = addSubscription(
                  message.author.id.toString(),
                  selected.id.toString(),
                  selected.media_type,
                  selected.title || selected.name,
                  true // Episode subscription
                );
                
                if (!success) {
                  throw new Error('Failed to add subscription');
                }
                
                const successEmbed = createStatusEmbed(
                  selected,
                  `✅ Subscribing to all episodes of "${selected.name}" instead!`,
                  '#00FF00', // Green for success
                  true // Episode subscription
                );
                await message.reply({ embeds: [successEmbed] });
              } else if (reaction.emoji.name === '👎') {
                // User chose thumbs down - now we CANCEL the subscription rather than creating a useless one
                const cancelEmbed = createStatusEmbed(
                  selected,
                  `❌ Subscription cancelled for "${selected.name}"\n\nYou chose not to subscribe to episodes, and a release-only subscription would not work.`,
                  '#808080', // Gray for cancelled
                  false
                );
                await message.reply({ embeds: [cancelEmbed] });
              }
              
              confirmCollector.stop('selected');
            });
            
            confirmCollector.on('end', async (collected, reason) => {
              if (reason !== 'selected') {
                // Handle the case where user didn't react in time
                await message.reply('Subscription creation timed out. Please try again.');
                // Delete the confirmation message if it wasn't already deleted
                await safeDeleteMessage(confirmMsg, 'confirmation timeout');
              }
            });
            
            collector.stop();
            return;
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
      } catch (error) {
        console.error('Error managing subscription:', error);
        
        // Delete the search results message
        await safeDeleteMessage(selectionMsg, 'subscription error');
        
        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Subscription Error')
          .setDescription(`❌ An error occurred while managing your subscription: ${error.message}`);
          
        await message.reply({ embeds: [errorEmbed] });
      }

      collector.stop();
    });

    collector.on('end', async (_, reason) => {
      // Only delete the message if it wasn't already deleted (in collect handler)
      if (reason !== 'cancelled' && reason !== 'selected') {
        await message.reply('Search results timed out. Please try again.');
        // Delete the search results message on timeout to keep the chat clean
        await safeDeleteMessage(selectionMsg, 'subscription timeout');
      }
    });

  } catch (error) {
    console.error('Error handling subscription:', error);
    
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Subscription Error')
      .setDescription(`❌ An error occurred while processing your subscription: ${error.message}`);
    
    await message.reply({ embeds: [errorEmbed] });
  }
}