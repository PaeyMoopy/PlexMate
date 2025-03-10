import { getSubscriptions } from '../services/database.js';
import { EmbedBuilder } from 'discord.js';

export async function handleList(message) {
  try {
    // Get user's subscriptions from database
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
        .setTitle(i === 0 ? 'Your Subscriptions' : 'Subscriptions (continued)')
        .setDescription(groupSubscriptions.map((sub, index) => 
          `${i + index + 1}. **${sub.media_title}**\n` +
          `Type: ${sub.media_type}\n` +
          `Notifications: ${sub.episode_subscription ? 'Episodes' : 'Release only'}`
        ).join('\n\n'));
      
      embedGroups.push(embed);
    }

    await message.reply({ embeds: embedGroups });

  } catch (error) {
    console.error('Error handling list command:', error);
    await message.reply('An error occurred while processing your request.');
  }
}