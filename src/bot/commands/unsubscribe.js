import { getSubscriptions, removeSubscription } from '../services/database.js';
import { EmbedBuilder } from 'discord.js';
import { searchTMDBById } from '../services/tmdb.js';

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

export async function handleUnsubscribe(message) {
  try {
    // Get user's subscriptions
    const subscriptions = getSubscriptions(message.author.id.toString());

    if (!subscriptions || subscriptions.length === 0) {
      await message.reply('You are not subscribed to any content.');
      return;
    }

    // Pagination setup
    const itemsPerPage = 5;
    let currentPage = 0;
    const totalPages = Math.ceil(subscriptions.length / itemsPerPage);

    // Function to get current page items
    const getCurrentPageItems = () => {
      const start = currentPage * itemsPerPage;
      return subscriptions.slice(start, start + itemsPerPage);
    };

    // Function to create embed for current page
    const createPageEmbed = () => {
      const pageItems = getCurrentPageItems();
      const startIndex = currentPage * itemsPerPage;
      
      return new EmbedBuilder()
        .setTitle('Select a subscription to remove')
        .setDescription(
          pageItems.map((sub, index) => 
            `${index + 1}. **${sub.media_title}**\n` +
            `Type: ${sub.media_type}\n` +
            `Notifications: ${sub.episode_subscription ? 'Episodes' : 'Release only'}`
          ).join('\n\n')
        )
        .setFooter({ 
          text: `Page ${currentPage + 1}/${totalPages} • Total subscriptions: ${subscriptions.length}`
        });
    };

    // Send initial embed
    const selectionMsg = await message.reply({ embeds: [createPageEmbed()] });
    
    // Add navigation and selection reactions
    const updateReactions = async () => {
      // Remove all existing reactions
      await selectionMsg.reactions.removeAll();
      
      // Add pagination controls if needed
      if (totalPages > 1) {
        if (currentPage > 0) {
          await selectionMsg.react('⬅️');
        }
        if (currentPage < totalPages - 1) {
          await selectionMsg.react('➡️');
        }
      }
      
      // Add number reactions for current page
      const pageItems = getCurrentPageItems();
      for (let i = 0; i < pageItems.length; i++) {
        await selectionMsg.react(`${i + 1}️⃣`);
      }
      
      // Add cancel reaction
      await selectionMsg.react('❌');
    };
    
    await updateReactions();

    // Create reaction collector
    const filter = (reaction, user) => {
      return user.id === message.author.id;
    };

    const collector = selectionMsg.createReactionCollector({ filter, time: 60000 });

    collector.on('collect', async (reaction, user) => {
      // Handle navigation
      if (reaction.emoji.name === '⬅️' && currentPage > 0) {
        currentPage--;
        await selectionMsg.edit({ embeds: [createPageEmbed()] });
        await updateReactions();
        return;
      }
      
      if (reaction.emoji.name === '➡️' && currentPage < totalPages - 1) {
        currentPage++;
        await selectionMsg.edit({ embeds: [createPageEmbed()] });
        await updateReactions();
        return;
      }
      
      // Handle cancel
      if (reaction.emoji.name === '❌') {
        await message.reply('Unsubscribe cancelled.');
        await safeDeleteMessage(selectionMsg, 'unsubscribe cancelled');
        collector.stop('cancelled');
        return;
      }

      // Handle selection
      if (/^[1-5]️⃣$/.test(reaction.emoji.name)) {
        const selectedIndex = Number(reaction.emoji.name[0]) - 1;
        const pageItems = getCurrentPageItems();
        
        if (selectedIndex >= 0 && selectedIndex < pageItems.length) {
          const selected = pageItems[selectedIndex];
          
          try {
            // Remove subscription from database
            const success = removeSubscription(message.author.id.toString(), selected.media_id);
            
            if (success) {
              // Delete the selection message
              await safeDeleteMessage(selectionMsg, 'unsubscribe successful');
              
              try {
                // Try to fetch media details from TMDB for rich embed
                const mediaDetails = await searchTMDBById(selected.media_id, selected.media_type);
                
                if (mediaDetails) {
                  const unsubscribeEmbed = createStatusEmbed(
                    mediaDetails,
                    `✅ ${message.author.username} has been unsubscribed from "${selected.media_title}"!`,
                    '#00FF00', // Green for success
                    selected.episode_subscription === 1
                  );
                  await message.reply({ embeds: [unsubscribeEmbed] });
                } else {
                  // Fallback if we can't get media details
                  await message.reply(`✅ ${message.author.username} has been unsubscribed from "${selected.media_title}"!`);
                }
              } catch (error) {
                console.error('Error fetching media details:', error);
                // Fallback message if fetching details fails
                await message.reply(`✅ ${message.author.username} has been unsubscribed from "${selected.media_title}"!`);
              }
            } else {
              // Delete the selection message
              await safeDeleteMessage(selectionMsg, 'unsubscribe error');
              
              const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('Unsubscribe Error')
                .setDescription('❌ An error occurred while removing your subscription.');
              await message.reply({ embeds: [errorEmbed] });
            }
          } catch (error) {
            console.error('Error removing subscription:', error);
            await message.reply('An error occurred while removing your subscription.');
          }

          collector.stop('selected');
        }
      }
    });

    collector.on('end', async (_, reason) => {
      // Only show timeout message if it actually timed out
      if (reason === 'time') {
        await message.reply('Selection timed out. Please try again.');
        // Delete the selection message on timeout
        await safeDeleteMessage(selectionMsg, 'unsubscribe timeout');
      }
    });

  } catch (error) {
    console.error('Error handling unsubscribe:', error);
    await message.reply('An error occurred while processing your request.');
  }
}