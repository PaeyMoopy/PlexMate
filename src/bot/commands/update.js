import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../../../');
const packageJsonPath = path.join(rootDir, 'package.json');

// GitHub repo information
const REPO_OWNER = 'PaeyMoopy'; // Change this to your GitHub username
const REPO_NAME = 'PlexMate';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

/**
 * Checks if git is installed and we're in a git repository
 * @returns {boolean} Whether git is available
 */
function isGitAvailable() {
  try {
    execSync('git --version', { cwd: rootDir, stdio: 'ignore' });
    return fs.existsSync(path.join(rootDir, '.git'));
  } catch (error) {
    return false;
  }
}

/**
 * Gets the current local version from package.json
 * @returns {string} Current version
 */
function getCurrentVersion() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch (error) {
    console.error('Error reading package.json:', error);
    return '0.0.0';
  }
}

/**
 * Fetches the latest version from GitHub
 * @returns {Promise<{version: string, url: string, changes: string}>} Latest version info
 */
async function getLatestVersion() {
  try {
    const response = await fetch(`${GITHUB_API_URL}/releases/latest`);
    
    if (!response.ok) {
      if (response.status === 404) {
        return { version: getCurrentVersion(), url: '', changes: 'No releases found' };
      }
      throw new Error(`GitHub API returned ${response.status}`);
    }
    
    const data = await response.json();
    return {
      version: data.tag_name.replace(/^v/, ''),
      url: data.html_url,
      changes: data.body || 'No release notes provided'
    };
  } catch (error) {
    console.error('Error fetching latest version:', error);
    return { version: '0.0.0', url: '', changes: 'Error fetching latest version' };
  }
}

/**
 * Compares version strings
 * @param {string} v1 First version
 * @param {string} v2 Second version
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    const part1 = parts1[i] || 0;
    const part2 = parts2[i] || 0;
    
    if (part1 > part2) return 1;
    if (part1 < part2) return -1;
  }
  
  return 0;
}

/**
 * Performs the update by pulling from git
 * @returns {string} Result message
 */
function performUpdate() {
  try {
    // Fetch and pull the latest changes
    execSync('git fetch origin', { cwd: rootDir });
    const result = execSync('git pull origin main', { cwd: rootDir, encoding: 'utf8' });
    
    // Install any new dependencies
    execSync('npm install', { cwd: rootDir });
    
    return result;
  } catch (error) {
    console.error('Error during update:', error);
    throw new Error(`Update failed: ${error.message}`);
  }
}

/**
 * Automatic update function that can be run on startup or scheduled
 * @param {boolean} autoInstall Whether to automatically install the update
 * @returns {Promise<{updated: boolean, currentVersion: string, latestVersion: string, message: string}>}
 */
export async function autoUpdate(autoInstall = false) {
  if (!isGitAvailable()) {
    return { 
      updated: false, 
      currentVersion: getCurrentVersion(), 
      latestVersion: 'unknown', 
      message: 'Git is not available. Cannot perform automatic updates.' 
    };
  }
  
  try {
    const currentVersion = getCurrentVersion();
    const latestInfo = await getLatestVersion();
    
    const hasUpdate = compareVersions(latestInfo.version, currentVersion) > 0;
    
    if (!hasUpdate) {
      return {
        updated: false,
        currentVersion,
        latestVersion: latestInfo.version,
        message: `PlexMate is already up to date (version ${currentVersion})`
      };
    }
    
    console.log(`Update available: ${currentVersion} → ${latestInfo.version}`);
    console.log(`Changes:\n${latestInfo.changes}`);
    
    if (autoInstall) {
      console.log('Automatically installing update...');
      const updateResult = performUpdate();
      
      return {
        updated: true,
        currentVersion,
        latestVersion: latestInfo.version,
        message: `PlexMate has been updated to version ${latestInfo.version}.\nGit output: ${updateResult}\nPlease restart the application to apply changes.`
      };
    } else {
      return {
        updated: false,
        currentVersion,
        latestVersion: latestInfo.version,
        message: `Update available: ${currentVersion} → ${latestInfo.version}. Run with autoInstall=true to apply, or use 'npm run update:apply'.`
      };
    }
  } catch (error) {
    console.error('Error in automatic update:', error);
    return { 
      updated: false, 
      currentVersion: getCurrentVersion(), 
      latestVersion: 'unknown', 
      message: `Error checking or applying update: ${error.message}` 
    };
  }
}

/**
 * Checks for updates without installing them
 * @returns {Promise<{hasUpdate: boolean, currentVersion: string, latestVersion: string}>}
 */
export async function checkForUpdates() {
  if (!isGitAvailable()) {
    return { hasUpdate: false, currentVersion: getCurrentVersion(), latestVersion: 'unknown' };
  }
  
  try {
    const currentVersion = getCurrentVersion();
    const latestInfo = await getLatestVersion();
    
    const hasUpdate = compareVersions(latestInfo.version, currentVersion) > 0;
    
    return {
      hasUpdate,
      currentVersion,
      latestVersion: latestInfo.version,
      changes: latestInfo.changes
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { hasUpdate: false, currentVersion: getCurrentVersion(), latestVersion: 'unknown' };
  }
}
