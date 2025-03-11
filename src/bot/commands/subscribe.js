import { searchTMDB } from '../services/tmdb.js';
import { EmbedBuilder } from 'discord.js';
import { addSubscription, getSubscriptions } from '../services/database.js';
import { checkAvailability, checkIfS1E1Exists } from '../services/overseerr.js';

export async function handleSubscribe(message, query) {
  if (!query) {
    await message.reply('Please provide a title to subscribe to!');
    return;
  }

  try {
    // Check for episode subscription flag
    const isEpisodeSubscription = query.toLowerCase().includes('-e') || query.toLowerCase().includes('-episode');
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
        collector.stop();
        return;
      }

      const index = Number(reaction.emoji.name[0]) - 1;
      const selected = options[index];

      try {
        // Check for existing subscription
        const subscriptions = getSubscriptions(message.author.id.toString());
        const existingSubscription = subscriptions.find(sub => sub.media_id === selected.id.toString());

        // For TV shows with "Release only" subscription, check if S1E1 already exists
        if (selected.media_type === 'tv' && !isEpisodeSubscription) {
          const { hasS1E1 } = await checkAvailability('tv', selected.id);
          
          if (hasS1E1) {
            // S1E1 already exists, so a "Release only" subscription would never trigger
            const confirmMsg = await message.reply(
              `**Warning:** Season 1 of "${selected.name}" already exists in Plex!\n` +
              `A "Release only" subscription would never trigger notifications.\n` +
              `Would you like to subscribe for ALL episodes instead?`
            );
            
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
              if (reaction.emoji.name === '👍') {
                // User opted for episode subscription instead
                isEpisodeSubscription = true;
                await message.reply(`Subscribing to all episodes of "${selected.name}" instead!`);
              } else if (reaction.emoji.name === '👎') {
                // User confirmed they want release only despite the warning
                await message.reply(`Creating "Release only" subscription for "${selected.name}" as requested, but no notifications will be sent for Season 1.`);
              }
              
              // Add the subscription with the potentially updated type
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
              
              confirmCollector.stop('selected');
            });
            
            confirmCollector.on('end', async (collected, reason) => {
              // Clean up the reactions regardless of outcome
              await confirmMsg.reactions.removeAll().catch(console.error);
              
              // Handle the case where user didn't react in time
              if (reason !== 'selected') {
                await message.reply('Subscription creation timed out. Please try again.');
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

        // Send appropriate response
        if (existingSubscription) {
          if (existingSubscription.episode_subscription === (isEpisodeSubscription ? 1 : 0)) {
            await message.reply('You are already subscribed to this content!');
          } else {
            await message.reply(
              isEpisodeSubscription
                ? `Updated! You will now receive episode notifications for "${selected.title || selected.name}"!`
                : `Updated! You will now only receive release notifications for "${selected.title || selected.name}"!`
            );
          }
        } else {
          await message.reply(
            isEpisodeSubscription
              ? `You are now subscribed to new episodes of "${selected.name}"!`
              : `You are now subscribed to "${selected.title || selected.name}"!`
          );
        }
      } catch (error) {
        console.error('Error managing subscription:', error);
        await message.reply('An error occurred while managing your subscription.');
      }

      collector.stop();
    });

    collector.on('end', () => {
      selectionMsg.reactions.removeAll().catch(console.error);
    });

  } catch (error) {
    console.error('Error handling subscription:', error);
    await message.reply('An error occurred while processing your subscription.');
  }
}