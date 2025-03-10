import { searchTMDB } from '../services/tmdb.js';
import { createRequest, checkAvailability } from '../services/overseerr.js';
import { addSubscription } from '../services/database.js';
import { EmbedBuilder } from 'discord.js';

export async function handleRequest(message, query) {
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
      await message.reply('No results found!');
      return;
    }

    // Take first N results based on settings
    const options = results.slice(0, maxResults);
    
    // Check availability for each result
    const availabilityChecks = await Promise.all(
      options.map(result => checkAvailability(result.media_type, result.id))
    );

    // Create embeds for each result
    const embeds = options.map((result, index) => {
      const { isAvailable } = availabilityChecks[index];
      
      return new EmbedBuilder()
        .setTitle(`${index + 1}. ${result.title || result.name}`)
        .setDescription(
          `Release Date: ${result.release_date || result.first_air_date}\n` +
          `Overview: ${result.overview}\n` +
          (isAvailable ? '✅ Already available in Plex!' : '')
        )
        .setImage(`https://image.tmdb.org/t/p/w500${result.poster_path}`)
        .setFooter({ text: `Type: ${result.media_type}${isAvailable ? ' • Available in Plex' : ''}` });
    });

    // Add instructions embed
    const instructionsEmbed = new EmbedBuilder()
      .setTitle('Search Results')
      .setDescription('Please select an option by reacting with the corresponding number:');
    
    embeds.unshift(instructionsEmbed);

    const selectionMsg = await message.reply({ embeds });
    
    // Add number reactions
    for (let i = 0; i < options.length; i++) {
      await selectionMsg.react(`${i + 1}️⃣`);
    }
    await selectionMsg.react('❌');

    // Create reaction collector
    const filter = (reaction, user) => {
      const validReactions = [...Array(options.length)].map((_, i) => `${i + 1}️⃣`).concat('❌');
      return validReactions.includes(reaction.emoji.name) && user.id === message.author.id;
    };

    const collector = selectionMsg.createReactionCollector({ filter, time: 30000 });

    collector.on('collect', async (reaction, user) => {
      try {
        if (reaction.emoji.name === '❌') {
          await message.reply('Request cancelled.');
          collector.stop('cancelled');
          return;
        }

        const index = Number(reaction.emoji.name[0]) - 1;
        const selected = options[index];
        const { isAvailable, details } = availabilityChecks[index];

        // Stop the collector immediately to prevent double-selections
        collector.stop('selected');

        // Send a processing message
        const processingMsg = await message.reply('Processing your request...');

        try {
          // Check if content is already available
          if (isAvailable) {
            await processingMsg.edit('This content is already available in Plex!');
            return;
          }

          // For TV shows, check which seasons are available
          if (selected.media_type === 'tv' && details.seasons?.length > 0) {
            const availableSeasons = new Set(
              details.mediaInfo?.seasons?.map(s => s.seasonNumber) || []
            );
            
            const requestableSeasons = details.seasons
              .filter(season => season.seasonNumber > 0) // Filter out specials
              .filter(season => !availableSeasons.has(season.seasonNumber))
              .map(season => season.seasonNumber);

            if (requestableSeasons.length === 0) {
              await processingMsg.edit('All seasons are already available in Plex!');
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

          await processingMsg.edit(`Request for "${selected.title || selected.name}" has been submitted! You'll be notified when it's available.`);
        } catch (error) {
          console.error('Error processing request:', error);
          await processingMsg.edit('An error occurred while processing your request. Please try again later.');
        }
      } catch (error) {
        console.error('Error handling reaction:', error);
        await message.reply('An error occurred while processing your selection. Please try again.');
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason !== 'cancelled' && reason !== 'selected') {
        await message.reply('Request timed out. Please try again.');
      }
      await selectionMsg.reactions.removeAll().catch(console.error);
    });

  } catch (error) {
    console.error('Error handling request:', error);
    await message.reply('An error occurred while processing your request. Please try again later.');
  }
}