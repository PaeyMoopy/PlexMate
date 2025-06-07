import { searchTMDB } from '../services/tmdb.js';
import { createRequest, checkAvailability } from '../services/overseerr.js';
import { addSubscription } from '../services/database.js';
import { EmbedBuilder } from 'discord.js';

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
      const availCheck = availabilityChecks[index];
      const { isAvailable } = availCheck;
      
      // Start building the description
      let description = `Overview: ${result.overview}`;
      
      // Add theatrical release date info
      const releaseDate = result.release_date || result.first_air_date;
      if (releaseDate) {
        description += `\n\n🎬 Theatrical Release: ${releaseDate}`;
      }
      
      // Skip detailed release info for older movies (pre-2020)
      const releaseYear = releaseDate ? parseInt(releaseDate.substring(0, 4), 10) : 0;
      const isOlderMovie = releaseYear < 2020;
      
      // Add availability information based on simplified categories
      if (isAvailable) {
        // Category 1: Fully available in Plex
        description += '\n\n\n✅ Plex Availability: Available to watch now!';
      } else if (result.media_type === 'movie') {
        // Check if movie exists in Radarr
        const inRadarr = availCheck.radarrStatus?.configured && availCheck.radarrStatus?.exists;
        
        if (inRadarr) {
          // Category 2: Added to Radarr but not downloaded yet
          description += '\n\n\n💾 Plex Availability: On our watchlist';
          
          // Handle movies still in theaters vs digitally released
          if (!isOlderMovie && availCheck.releaseStatus === 'not_released') {
            description += '\n🎬 Currently only in theaters - will be added when it releases for home viewing';
          } else if (availCheck.radarrStatus.queueStatus === 'downloading') {
            description += '\n⬇️ Currently downloading - will be available soon!';
          } else {
            description += '\n🔍 Looking for a good quality copy to download';
          }
        } else {
          // Category 3: Not in Radarr/Sonarr yet
          description += '\n\n\n💾 Plex Availability: Not in our library yet';
          description += '\n✴️ Click the reactions below to request this title';
        }
      } else if (result.media_type === 'tv') {
        if (isAvailable) {
          // Fully available
          description += '\n\n\n✅ Plex Availability: Available to watch now!';
        } else {
          // Check if show exists in Sonarr
          const inSonarr = availCheck.sonarrStatus?.configured && availCheck.sonarrStatus?.exists;
          
          if (inSonarr) {
            // TV show in Sonarr but not available yet
            description += '\n\n\n💾 Plex Availability: On our watchlist';
            
            if (availCheck.sonarrStatus.isUpcoming) {
              // Show hasn't premiered yet
              const firstAired = availCheck.sonarrStatus.firstAired;
              const nextAiring = availCheck.sonarrStatus.nextAiring;
              
              if (firstAired) {
                const firstAiredDate = new Date(firstAired).toLocaleDateString();
                description += `\n🍿 Show premieres on ${firstAiredDate}`;
              } else if (nextAiring) {
                const nextAiringDate = new Date(nextAiring).toLocaleDateString();
                description += `\n📅 Next episode airs on ${nextAiringDate}`;
              } else {
                description += '\n🍿 This show hasn\'t premiered yet';
              }
            } else {
              // Show is airing but we don't have episodes yet
              description += '\n🔎 Looking for episodes to download';
            }
            
            // Check if Season 1 is specifically missing
            if (availCheck.hasS1E1 === false) {
              description += '\nℹ️ Season 1 not currently available';
            }
          } else {
            // Not in Sonarr at all
            description += '\n\n\n💾 Plex Availability: Not in our library yet';
            if (availCheck.hasS1E1 === false) {
              description += '\nℹ️ Season 1 not currently available';
            }
            description += '\n✴️ Click the reactions below to request this title';
          }
        }
      }
      
      // Generate the footer text
      let footerText = `Type: ${result.media_type}`;
      
      // Match footer text to our simplified availability categories
      if (isAvailable) {
        footerText += ' • Available to watch now';
      } else if (result.media_type === 'movie' && availCheck.radarrStatus?.configured && availCheck.radarrStatus?.exists) {
        // Added to Radarr
        if (availCheck.radarrStatus.queueStatus === 'downloading') {
          footerText += ' • Downloading now';
        } else if (!isOlderMovie && availCheck.releaseStatus === 'not_released') {
          footerText += ' • Coming soon'; 
        } else {
          footerText += ' • On our watchlist'; 
        }
      } else if (result.media_type === 'tv' && availCheck.sonarrStatus?.configured && availCheck.sonarrStatus?.exists) {
        // Added to Sonarr
        if (availCheck.sonarrStatus.isUpcoming) {
          footerText += ' • Coming soon';
        } else {
          footerText += ' • On our watchlist';
        }
      } else {
        // Not requested yet
        footerText += ' • Not in library';
      }
      
      return new EmbedBuilder()
        .setColor(isAvailable ? '#00FF00' : '#0099ff')
        .setTitle(`${result.title || result.name} ${getYear(result)}`.trim())
        .setURL(getDetailUrl(result.media_type, result.id))
        .setDescription(description)
        .setThumbnail(getPosterUrl(result.poster_path))
        .setFooter({ text: footerText });
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
          const cancelMsg = await message.reply('Request cancelled.');
          // Delete the search results message to keep the chat clean
          await safeDeleteMessage(selectionMsg, 'cancel button');
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
            // Delete the search results message to keep the chat clean
            await safeDeleteMessage(selectionMsg, 'already available');
            return;
          }
          
          // Check if the movie is already in Radarr 
          if (selected.media_type === 'movie' && availabilityChecks[index].radarrStatus?.exists) {
            // Already in Radarr but not downloaded yet
            const status = availabilityChecks[index].radarrStatus;
            const releaseStatus = availabilityChecks[index].releaseStatus;
            
            let message = 'This movie is already on our watchlist! ';
            
            if (status.queueStatus === 'downloading') {
              message += 'It\'s currently downloading and will be available soon.';
            } else if (releaseStatus === 'not_released') {
              message += 'It\'s still only in theaters and will be added when it releases for home viewing.';
            } else {
              message += 'We\'re currently looking for a good quality copy to download.';
            }
            
            await processingMsg.edit(message);
            // Delete the search results message to keep the chat clean
            await safeDeleteMessage(selectionMsg, 'movie on watchlist');
            return;
          }

          // For TV shows, check which seasons are available and if show is already in Sonarr
          if (selected.media_type === 'tv' && details.seasons?.length > 0) {
            // Check if TV show is already in Sonarr
            if (availabilityChecks[index].sonarrStatus?.exists) {
              // Already in Sonarr but not downloaded yet
              const status = availabilityChecks[index].sonarrStatus;
              
              let message = 'This TV show is already on our watchlist! ';
              
              if (status.isUpcoming) {
                const firstAiredDate = status.firstAired ? 
                  new Date(status.firstAired).toLocaleDateString() : 'an upcoming date';
                message += `It hasn't premiered yet and is scheduled to release on ${firstAiredDate}.`;
              } else if (status.nextAiring) {
                const nextAiringDate = new Date(status.nextAiring).toLocaleDateString();
                message += `The next episode is scheduled to air on ${nextAiringDate}.`;
              } else {
                message += 'We\'re currently looking for episodes to download.';
              }
              
              await processingMsg.edit(message);
              // Delete the search results message to keep the chat clean
              await safeDeleteMessage(selectionMsg, 'tv show on watchlist');
              return;
            }
            
            // Check available seasons for shows not already in Sonarr
            const availableSeasons = new Set(
              details.mediaInfo?.seasons?.map(s => s.seasonNumber) || []
            );
            
            const requestableSeasons = details.seasons
              .filter(season => season.seasonNumber > 0) // Filter out specials
              .filter(season => !availableSeasons.has(season.seasonNumber))
              .map(season => season.seasonNumber);

            if (requestableSeasons.length === 0) {
              await processingMsg.edit('All seasons are already available in Plex!');
              // Delete the search results message to keep the chat clean
              await safeDeleteMessage(selectionMsg, 'all seasons available');
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
          
          // Delete the search results message to keep the chat clean
          await safeDeleteMessage(selectionMsg, 'request submitted');
        } catch (error) {
          console.error('Error processing request:', error);
          await processingMsg.edit('An error occurred while processing your request. Please try again later.');
          // Delete the search results message to keep the chat clean
          await safeDeleteMessage(selectionMsg, 'error processing');
        }
      } catch (error) {
        console.error('Error handling reaction:', error);
        await message.reply('An error occurred while processing your selection. Please try again.');
      }
    });

    collector.on('end', async (_, reason) => {
      if (reason !== 'cancelled' && reason !== 'selected') {
        await message.reply('Request timed out. Please try again.');
        // Delete the search results message on timeout to keep the chat clean
        await safeDeleteMessage(selectionMsg, 'request timeout');
      } else if (reason === 'selected') {
        // For successful selections, we'll also delete the search message after processing is done
        // The deletion happens after the response message is sent (see below)
      } else {
        // For cancellations, we already deleted the message in the collect handler
      }
    });

  } catch (error) {
    console.error('Error handling request:', error);
    await message.reply('An error occurred while processing your request. Please try again later.');
  }
}