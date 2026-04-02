const chokidar = require('chokidar');
const path = require('path');
const Parser = require('./parser');

class SavedVariablesWatcher {
  constructor(wowPath, onUpdate, onLootUpdate) {
    this.wowPath = wowPath;
    this.onUpdate = onUpdate;
    this.onLootUpdate = onLootUpdate;
    this.watcher = null;
  }

  /**
   * Start watching SavedVariables files
   */
  start() {
    // Watch per-character GearScore.lua files (and legacy GearSync.lua)
    const charPattern = path.join(
      this.wowPath, 'WTF', 'Account', '*', '*', '*', 'SavedVariables', 'GearScore.lua'
    );
    const charPatternLegacy = path.join(
      this.wowPath, 'WTF', 'Account', '*', '*', '*', 'SavedVariables', 'GearSync.lua'
    );

    // Watch account-level GearScore.lua files (where GearScoreLootDB lives)
    const accountPattern = path.join(
      this.wowPath, 'WTF', 'Account', '*', 'SavedVariables', 'GearScore.lua'
    );
    const accountPatternLegacy = path.join(
      this.wowPath, 'WTF', 'Account', '*', 'SavedVariables', 'GearSync.lua'
    );

    console.log(`Starting file watcher for character pattern: ${charPattern}`);
    console.log(`Starting file watcher for account pattern: ${accountPattern}`);

    this.watcher = chokidar.watch([charPattern, charPatternLegacy, accountPattern, accountPatternLegacy], {
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 2000, // Wait 2s for file to stop changing
        pollInterval: 100
      },
      depth: 10,
      usePolling: false // Use native fs events (faster)
    });

    this.watcher
      .on('add', (filePath) => {
        console.log(`GearScore file detected: ${filePath}`);
        this.handleFileChange(filePath);
      })
      .on('change', (filePath) => {
        console.log(`GearScore file changed: ${filePath}`);
        this.handleFileChange(filePath);
      })
      .on('error', (error) => {
        console.error('Watcher error:', error);
      })
      .on('ready', () => {
        console.log('File watcher ready');
      });

    return this.watcher;
  }

  /**
   * Stop watching files
   */
  stop() {
    if (this.watcher) {
      this.watcher.close();
      console.log('File watcher stopped');
    }
  }

  /**
   * Check if a file is an account-level SavedVariables (not per-character)
   * Account-level: WTF/Account/<ACCOUNT>/SavedVariables/GearScore.lua
   * Per-character:  WTF/Account/<ACCOUNT>/<REALM>/<CHAR>/SavedVariables/GearScore.lua
   * @param {string} filePath Path to check
   * @returns {boolean} True if account-level
   */
  isAccountLevel(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    // Account-level has exactly one folder between "Account" and "SavedVariables"
    const match = normalized.match(/Account\/([^/]+)\/SavedVariables\/Gear(?:Score|Sync)\.lua$/);
    return !!match;
  }

  /**
   * Extract account name from file path
   * @param {string} filePath Path to GearScore.lua
   * @returns {string|null} Account name
   */
  extractAccount(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    const match = normalized.match(/Account\/([^/]+)\//);
    return match ? match[1] : null;
  }

  /**
   * Handle file change event
   * @param {string} filePath Path to changed file
   */
  handleFileChange(filePath) {
    try {
      if (this.isAccountLevel(filePath)) {
        // Account-level file — trigger loot sync
        console.log(`Account-level SavedVariables changed: ${filePath}`);
        const account = this.extractAccount(filePath);
        if (this.onLootUpdate) {
          this.onLootUpdate(filePath, account);
        }
      } else {
        // Per-character file — trigger equipment sync (existing behavior)
        console.log(`Parsing per-character file: ${filePath}`);
        const data = Parser.parseSavedVariables(filePath);
        if (data && this.onUpdate) {
          console.log(`Parsed equipment for ${data.character} (${data.realm}): ${Object.keys(data.equipment || {}).length} slots`);
          if (data.inventory) {
            console.log(`  Inventory: ${(data.inventory.bags || []).length} bag items, ${(data.inventory.bank || []).length} bank items`);
          }
          this.onUpdate(data);
        } else {
          console.warn(`Parser returned no data for: ${filePath}`);
        }
      }
    } catch (error) {
      console.error(`Error parsing ${filePath}:`, error);
    }
  }

  /**
   * Get currently watched files
   * @returns {Array} Array of watched file paths
   */
  getWatchedFiles() {
    if (this.watcher) {
      return this.watcher.getWatched();
    }
    return {};
  }
}

module.exports = SavedVariablesWatcher;
