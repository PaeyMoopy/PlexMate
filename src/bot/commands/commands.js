import { EmbedBuilder } from 'discord.js';

export async function handleCommands(message) {
  const embed = new EmbedBuilder()
    .setTitle('Available Commands')
    .setDescription('Here are all the commands you can use:')
    .addFields([
      {
        name: '!request [title] (movie|tv)',
        value: 'Search and request movies or TV shows. Add (movie) or (tv) to filter results.'
      },
      {
        name: '!subscribe [title] [-e|-episode]',
        value: 'Subscribe to get notified when content becomes available. Use -e or -episode flag for TV shows to get notifications for new episodes.'
      },
      {
        name: '!list',
        value: 'View your current subscriptions'
      },
      {
        name: '!unsubscribe',
        value: 'Remove a subscription'
      },
      {
        name: '!commands',
        value: 'Show this help message'
      }
    ])
    .setFooter({ text: 'PlexMate' });

  await message.reply({ embeds: [embed] });
}