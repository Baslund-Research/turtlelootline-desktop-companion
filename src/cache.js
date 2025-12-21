const fs = require('fs');
const path = require('path');
const os = require('os');

class UpgradeCache {
  constructor() {
    this.cacheDir = path.join(os.homedir(), '.turtlelootline');
    this.cacheFile = path.join(this.cacheDir, 'upgrade-cache.json');
    this.lastSyncFile = path.join(this.cacheDir, 'last-sync.json');

    this.ensureCacheDir();
    this.cache = this.loadCache();
  }

  /**
   * Ensure cache directory exists
   */
  ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log(`Created cache directory: ${this.cacheDir}`);
    }
  }

  /**
   * Load cache from disk
   * @returns {Object} Cached upgrade data
   */
  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const data = fs.readFileSync(this.cacheFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }

    return {};
  }

  /**
   * Save cache to disk
   */
  saveCache() {
    try {
      fs.writeFileSync(
        this.cacheFile,
        JSON.stringify(this.cache, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error saving cache:', error);
    }
  }

  /**
   * Update cache with new upgrade data
   * @param {Object} upgrades Upgrade data keyed by item ID
   */
  updateUpgrades(upgrades) {
    Object.assign(this.cache, upgrades);
    this.saveCache();
    this.updateLastSync();
  }

  /**
   * Get upgrade data for a specific item
   * @param {number} itemId Item ID
   * @returns {Object|null} Upgrade data or null
   */
  getUpgrade(itemId) {
    return this.cache[itemId] || null;
  }

  /**
   * Get all cached upgrades
   * @returns {Object} All upgrade data
   */
  getAllUpgrades() {
    return this.cache;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache = {};
    this.saveCache();
  }

  /**
   * Update last sync timestamp
   */
  updateLastSync() {
    try {
      const syncData = {
        lastSync: new Date().toISOString(),
        itemCount: Object.keys(this.cache).length
      };

      fs.writeFileSync(
        this.lastSyncFile,
        JSON.stringify(syncData, null, 2),
        'utf8'
      );
    } catch (error) {
      console.error('Error updating last sync:', error);
    }
  }

  /**
   * Get last sync info
   * @returns {Object|null} Last sync data
   */
  getLastSync() {
    try {
      if (fs.existsSync(this.lastSyncFile)) {
        const data = fs.readFileSync(this.lastSyncFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error reading last sync:', error);
    }

    return null;
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const lastSync = this.getLastSync();

    return {
      itemCount: Object.keys(this.cache).length,
      lastSync: lastSync ? lastSync.lastSync : null,
      cacheSize: this.getCacheSize()
    };
  }

  /**
   * Get cache file size in bytes
   * @returns {number} File size
   */
  getCacheSize() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const stats = fs.statSync(this.cacheFile);
        return stats.size;
      }
    } catch (error) {
      console.error('Error getting cache size:', error);
    }

    return 0;
  }
}

module.exports = UpgradeCache;
