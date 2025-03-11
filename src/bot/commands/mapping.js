import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import dotenv from 'dotenv';

/**
 * Updates the Discord to Overseerr user mapping in the .env file
 * This is an admin command available only in the ADMIN_CHANNEL_ID channel
 */
export async function handleMapping(message, args) {
  try {
    if (!args || args.length < 2) {
      return await message.reply(
        '**Usage:** `!mapping <discord_user_id> <overseerr_user_id>`\n' +
        'Example: `!mapping 265316362900078592 1`\n\n' +
        'You can find Discord user IDs by enabling developer mode in Discord settings, ' +
        'then right-clicking on a user and selecting "Copy ID".\n\n' +
        'Overseerr user IDs can be found in the Overseerr admin dashboard under Users.'
      );
    }

    const discordUserId = args[0];
    const overseerrUserId = args[1];

    // Validate the IDs
    if (!/^\d+$/.test(discordUserId) || !/^\d+$/.test(overseerrUserId)) {
      return await message.reply('Both Discord and Overseerr user IDs must be numbers.');
    }

    // Find the .env file
    const envPaths = [
      '.env',
      '../.env',
      '../../.env',
      resolve(process.cwd(), '.env'),
      resolve(process.cwd(), '../.env'),
      '/root/plexassistant/Plexcord/.env'
    ];

    let envPath = null;
    for (const path of envPaths) {
      try {
        if (existsSync(path)) {
          envPath = path;
          break;
        }
      } catch (error) {
        console.error(`Error checking path ${path}:`, error);
      }
    }

    if (!envPath) {
      return await message.reply('Could not find the .env file. Please contact the bot administrator.');
    }

    // Read the current .env file
    const envContent = readFileSync(envPath, 'utf8');
    
    // Parse the current OVERSEERR_USER_MAP value
    let userMap = {};
    const mapMatch = envContent.match(/OVERSEERR_USER_MAP=["']?({.*?})["']?/);
    
    if (mapMatch && mapMatch[1]) {
      try {
        userMap = JSON.parse(mapMatch[1]);
      } catch (e) {
        console.error('Error parsing OVERSEERR_USER_MAP:', e);
        // If parsing fails, start with an empty object
        userMap = {};
      }
    }

    // Update the mapping
    userMap[overseerrUserId] = discordUserId;
    
    // Update or add the OVERSEERR_USER_MAP in the .env content
    const newMapValue = JSON.stringify(userMap);
    let newEnvContent;
    
    if (mapMatch) {
      // Replace existing mapping
      newEnvContent = envContent.replace(
        /OVERSEERR_USER_MAP=["']?({.*?})["']?/,
        `OVERSEERR_USER_MAP='${newMapValue}'`
      );
    } else {
      // Add new mapping if it doesn't exist
      newEnvContent = envContent + `\nOVERSEERR_USER_MAP='${newMapValue}'`;
    }
    
    // Write the updated .env file
    writeFileSync(envPath, newEnvContent);
    
    // Update the current environment variables in memory
    process.env.OVERSEERR_USER_MAP = newMapValue;
    
    // Reload environment variables
    dotenv.config({ path: envPath, override: true });
    
    // Send confirmation
    await message.reply(
      `✅ Successfully mapped Discord user \`${discordUserId}\` to Overseerr user \`${overseerrUserId}\`.\n` +
      `Current mappings: \`${newMapValue}\``
    );
    
  } catch (error) {
    console.error('Error handling mapping command:', error);
    await message.reply('An error occurred while updating the user mapping. Please check the logs.');
  }
}
