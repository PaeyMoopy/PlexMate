import { EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Function to read version from .version file or package.json
function getVersion() {
  try {
    // Try to read from .version file (created in Docker)
    if (fs.existsSync('/.version')) {
      const versionData = fs.readFileSync('/.version', 'utf8');
      const versionMatch = versionData.match(/VERSION=([^\n]+)/);
      if (versionMatch && versionMatch[1]) {
        return versionMatch[1];
      }
    }
    
    if (fs.existsSync('/app/.version')) {
      const versionData = fs.readFileSync('/app/.version', 'utf8');
      const versionMatch = versionData.match(/VERSION=([^\n]+)/);
      if (versionMatch && versionMatch[1]) {
        return versionMatch[1];
      }
    }
    
    // Fallback to package.json version
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const packagePath = path.join(__dirname, '../../../package.json');
    if (fs.existsSync(packagePath)) {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      return packageJson.version;
    }
  } catch (error) {
    console.error('Error getting version:', error);
  }
  
  return 'dev';
}

export async function handleCommands(message) {
  // Get version from .version file or package.json
  const version = getVersion();
  
  const embed = new EmbedBuilder()
    .setTitle(`PlexMate Bot v${version}`)
    .setDescription('Here are all the commands you can use:')
    .addFields([
      {
        name: '!help',
        value: 'Show this help message'
      },
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
        value: 'View your current subscriptions (pagination supported)'
      },
      {
        name: '!unsubscribe',
        value: 'Remove a subscription (pagination supported for multiple subscriptions)'
      }
    ]);
    
  // Add admin commands section if in admin channel
  if (message.channelId === process.env.ADMIN_CHANNEL_ID) {
    embed.addFields([
      {
        name: '⚙️ Admin Commands',
        value: 'The following commands are only available in the admin channel:'
      },
      {
        name: '!mapping add [overseerr_id] [discord_id]',
        value: 'Add a new user mapping between Overseerr and Discord'
      },
      {
        name: '!mapping remove [overseerr_id]',
        value: 'Remove an existing user mapping'
      },
      {
        name: '!mapping list',
        value: 'Show all current user mappings'
      }
    ]);
  }
  
  embed.setFooter({ text: `PlexMate v${version} • Running in ${message.channelId === process.env.ADMIN_CHANNEL_ID ? 'Admin' : 'Standard'} Channel` });

  await message.reply({ embeds: [embed] });
}