const chokidar = require('chokidar');
const path = require('path');
const Parser = require('./parser');

class SavedVariablesWatcher {
  constructor(wowPath, onUpdate) {
    this.wowPath = wowPath;
    this.onUpdate = onUpdate;
    this.watcher = null;
  }

  /**
   * Start watching SavedVariables files
   */
  start() {
    // Watch all GearSync.lua files in SavedVariables folders
    const globPattern = path.join(
      this.wowPath,
      'WTF',
      'Account',
      '*',
      '*',
      '*',
      'SavedVariables',
      'GearSync.lua'
    );

    console.log(`Starting file watcher for pattern: ${globPattern}`);

    this.watcher = chokidar.watch(globPattern, {
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
        console.log(`GearSync.lua detected: ${filePath}`);
        this.handleFileChange(filePath);
      })
      .on('change', (filePath) => {
        console.log(`GearSync.lua changed: ${filePath}`);
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
   * Handle file change event
   * @param {string} filePath Path to changed file
   */
  handleFileChange(filePath) {
    try {
      const data = Parser.parseSavedVariables(filePath);

      if (data && this.onUpdate) {
        this.onUpdate(data);
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
