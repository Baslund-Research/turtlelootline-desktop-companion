const fs = require('fs');
const path = require('path');
const os = require('os');

class WTFScanner {
  constructor(wowPath) {
    this.wowPath = wowPath;
  }

  /**
   * Scan WTF folder and discover all characters
   * @returns {Array} Array of character objects
   */
  scanCharacters() {
    const wtfPath = path.join(this.wowPath, 'WTF', 'Account');

    if (!fs.existsSync(wtfPath)) {
      console.warn(`WTF Account folder not found: ${wtfPath}`);
      return [];
    }

    const characters = [];

    try {
      const accounts = fs.readdirSync(wtfPath);

      for (const account of accounts) {
        const accountPath = path.join(wtfPath, account);

        if (!fs.statSync(accountPath).isDirectory()) continue;
        if (account === 'SavedVariables') continue; // Skip global SavedVariables

        // Scan realms within account
        const realms = fs.readdirSync(accountPath);

        for (const realm of realms) {
          if (realm === 'SavedVariables') continue; // Skip account SavedVariables

          const realmPath = path.join(accountPath, realm);

          if (!fs.statSync(realmPath).isDirectory()) continue;

          // Scan characters within realm
          const charNames = fs.readdirSync(realmPath);

          for (const charName of charNames) {
            const charPath = path.join(realmPath, charName);

            if (!fs.statSync(charPath).isDirectory()) continue;

            const savedVariablesPath = path.join(charPath, 'SavedVariables');

            characters.push({
              account,
              realm,
              name: charName,
              savedVariablesPath,
              gearSyncFile: fs.existsSync(path.join(savedVariablesPath, 'GearScore.lua'))
                ? path.join(savedVariablesPath, 'GearScore.lua')
                : path.join(savedVariablesPath, 'GearSync.lua')
            });
          }
        }
      }
    } catch (error) {
      console.error('Error scanning WTF folder:', error);
    }

    return characters;
  }

  /**
   * Detect WoW installation path automatically
   * @returns {string|null} Detected WoW path or null
   */
  static detectWowPath() {
    const platform = os.platform();
    const possiblePaths = [];

    if (platform === 'win32') {
      // Windows common paths
      possiblePaths.push(
        'C:\\Games\\Turtle WoW',
        'C:\\Program Files (x86)\\Turtle WoW',
        'C:\\Program Files\\Turtle WoW',
        'D:\\Games\\Turtle WoW',
        'E:\\Games\\Turtle WoW'
      );
    } else if (platform === 'darwin') {
      // macOS common paths
      const home = os.homedir();
      possiblePaths.push(
        path.join(home, 'Applications', 'Turtle WoW'),
        '/Applications/Turtle WoW',
        path.join(home, 'Games', 'Turtle WoW'),
        path.join(home, 'Library', 'Application Support', 'Turtle WoW')
      );
    } else {
      // Linux (usually running via Wine)
      const home = os.homedir();
      possiblePaths.push(
        path.join(home, '.wine', 'drive_c', 'Games', 'Turtle WoW'),
        path.join(home, '.wine', 'drive_c', 'Program Files (x86)', 'Turtle WoW'),
        path.join(home, 'Games', 'Turtle WoW')
      );
    }

    // Check each path
    for (const possiblePath of possiblePaths) {
      if (fs.existsSync(possiblePath)) {
        const wtfPath = path.join(possiblePath, 'WTF');
        if (fs.existsSync(wtfPath)) {
          console.log(`Auto-detected WoW path: ${possiblePath}`);
          return possiblePath;
        }
      }
    }

    console.log('Could not auto-detect WoW path');
    return null;
  }

  /**
   * Validate that a path is a valid WoW installation
   * @param {string} wowPath Path to validate
   * @returns {boolean} True if valid
   */
  static isValidWowPath(wowPath) {
    if (!wowPath || !fs.existsSync(wowPath)) {
      return false;
    }

    const wtfPath = path.join(wowPath, 'WTF');
    const interfacePath = path.join(wowPath, 'Interface');

    return fs.existsSync(wtfPath) && fs.existsSync(interfacePath);
  }
}

module.exports = WTFScanner;
