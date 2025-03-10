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

    // Create embeds for subscriptions (group by 5 to stay within Discord's limit)
    const embedGroups = [];
    const itemsPerEmbed = 5;
    
    for (let i = 0; i < subscriptions.length; i += itemsPerEmbed) {
      const groupSubscriptions = subscriptions.slice(i, i + itemsPerEmbed);
      const embed = new EmbedBuilder()
        .setTitle(i === 0 ? 'Select a subscription to remove' : 'Subscriptions (continued)')
        .setDescription(groupSubscriptions.map((sub, index) => 
          `${i + index + 1}. **${sub.media_title}**\n` +
          `Type: ${sub.media_type}\n` +
          `Notifications: ${sub.episode_subscription ? 'Episodes' : 'Release only'}`
        ).join('\n\n'));
      
      embedGroups.push(embed);
    }

    const selectionMsg = await message.reply({ embeds: embedGroups });
    
    // Add number reactions
    for (let i = 0; i < subscriptions.length; i++) {
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
        await message.reply('Unsubscribe cancelled.');
        collector.stop();
        return;
      }

      const index = Number(reaction.emoji.name[0]) - 1;
      const selected = subscriptions[index];

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
    });

    collector.on('end', () => {
      selectionMsg.reactions.removeAll();
    });

  } catch (error) {
    console.error('Error handling unsubscribe:', error);
    await message.reply('An error occurred while processing your request.');
  }
}