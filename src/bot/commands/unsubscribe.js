import { getSubscriptions, removeSubscription } from '../services/database.js';
import { EmbedBuilder } from 'discord.js';

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
        collector.stop();
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
              await message.reply(`You have been unsubscribed from "${selected.media_title}"!`);
            } else {
              await message.reply('An error occurred while removing your subscription.');
            }
          } catch (error) {
            console.error('Error removing subscription:', error);
            await message.reply('An error occurred while removing your subscription.');
          }

          collector.stop();
        }
      }
    });

    collector.on('end', () => {
      selectionMsg.reactions.removeAll().catch(console.error);
    });

  } catch (error) {
    console.error('Error handling unsubscribe:', error);
    await message.reply('An error occurred while processing your request.');
  }
}