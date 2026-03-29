const fs = require('fs');
const path = require('path');
const os = require('os');
const Parser = require('./parser');

const MAX_ITEMS_PER_BATCH = 500;

class LootSync {
  constructor(api) {
    this.api = api;
    this.stateDir = path.join(os.homedir(), '.turtlelootline');
    this.stateFile = path.join(this.stateDir, 'loot-sync-state.json');
    this.syncState = this.loadState();
  }

  /**
   * Load sync state from disk
   * @returns {Object} Sync state
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const data = fs.readFileSync(this.stateFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading loot sync state:', error);
    }

    return {
      lastSyncTimestamp: 0,
      syncedItems: {}
    };
  }

  /**
   * Save sync state to disk
   */
  saveState() {
    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }
      fs.writeFileSync(this.stateFile, JSON.stringify(this.syncState, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving loot sync state:', error);
    }
  }

  /**
   * Sync loot data from an account-level SavedVariables file
   * @param {string} filePath Path to account-level GearSync.lua
   * @param {string} account Account name
   * @returns {Promise<Object>} Sync result
   */
  async syncFromFile(filePath, account) {
    const lootDB = Parser.parseLootDB(filePath);

    if (!lootDB || !lootDB.items) {
      console.log('No loot data found or empty loot DB');
      return { synced: 0, skipped: 0 };
    }

    // Find items that need syncing (new or updated)
    const itemsToSync = [];

    for (const [itemIdStr, item] of Object.entries(lootDB.items)) {
      const itemId = parseInt(itemIdStr);
      if (isNaN(itemId)) continue;

      const lastSeen = item.lastSeen || 0;
      const synced = this.syncState.syncedItems[itemId];

      // Needs sync if: never synced, or item has been updated since last sync
      if (!synced || lastSeen > (synced.lastSeen || 0)) {
        itemsToSync.push(this.formatItemForAPI(itemId, item));
      }
    }

    if (itemsToSync.length === 0) {
      console.log('All loot items already synced');
      return { synced: 0, skipped: Object.keys(lootDB.items).length };
    }

    console.log(`Found ${itemsToSync.length} items to sync`);

    // Batch and send
    let totalSynced = 0;
    const batches = this.batchItems(itemsToSync);

    for (const batch of batches) {
      try {
        const result = await this.api.bulkSyncItems(account, 'Turtle WoW', batch);

        if (result && result.success) {
          // Mark items as synced
          for (const item of batch) {
            this.syncState.syncedItems[item.itemId] = {
              lastSeen: item.lastSeen || 0,
              syncedAt: Math.floor(Date.now() / 1000)
            };
          }
          totalSynced += batch.length;
          console.log(`Batch synced: ${result.created || 0} created, ${result.updated || 0} updated`);
        } else {
          console.warn(`Batch sync: API returned failure — ${result.error || 'unknown error'}`);
        }
      } catch (error) {
        console.warn(`Batch sync failed: ${error.message}`);
      }
    }

    // Save state after all batches
    this.syncState.lastSyncTimestamp = Math.floor(Date.now() / 1000);
    this.saveState();

    return {
      synced: totalSynced,
      skipped: Object.keys(lootDB.items).length - totalSynced
    };
  }

  /**
   * Sync all accounts found in the WoW installation
   * @param {string} wowPath Root WoW path
   * @returns {Promise<Object>} Total sync results
   */
  async syncAll(wowPath) {
    const accountFiles = Parser.findAccountSavedVariables(wowPath);
    let totalSynced = 0;
    let totalSkipped = 0;

    for (const { account, filePath } of accountFiles) {
      console.log(`Syncing loot for account: ${account}`);
      const result = await this.syncFromFile(filePath, account);
      totalSynced += result.synced;
      totalSkipped += result.skipped;
    }

    return { synced: totalSynced, skipped: totalSkipped };
  }

  /**
   * Format a loot DB item for the API
   * @param {number} itemId Item ID
   * @param {Object} item Item data from GearSyncLootDB
   * @returns {Object} API-formatted item
   */
  formatItemForAPI(itemId, item) {
    // Separate base stats from equip-parsed stats
    const baseStatKeys = [
      'armor', 'stamina', 'strength', 'agility', 'intellect', 'spirit',
      'defense', 'attackPower', 'fireResistance', 'natureResistance',
      'frostResistance', 'shadowResistance', 'arcaneResistance'
    ];
    const equipParsedKeys = [
      'spellPower', 'healingPower', 'hitChance', 'critChance',
      'mp5', 'hp5', 'defenseBonus', 'dodgeChance', 'parryChance',
      'blockChance', 'rangedAttackPower'
    ];

    const stats = {};
    const equipParsed = {};

    if (item.stats) {
      for (const [key, value] of Object.entries(item.stats)) {
        if (baseStatKeys.includes(key)) {
          stats[key] = value;
        } else if (equipParsedKeys.includes(key)) {
          equipParsed[key] = value;
        } else {
          // Unknown stat — include in equipParsed as fallback
          equipParsed[key] = value;
        }
      }
    }

    return {
      itemId,
      name: item.name || null,
      link: item.link || null,
      quality: item.quality || 0,
      requiredLevel: item.requiredLevel || null,
      itemType: item.itemType || null,
      itemSubType: item.itemSubType || null,
      equipSlot: item.equipSlot || null,
      bindType: item.bindType || null,
      armorType: item.armorType || null,
      weaponType: item.weaponType || null,
      classes: item.classes || null,
      setName: item.setName || null,
      stats,
      equip: item.equip || [],
      equipParsed,
      weaponDamageMin: item.weaponDamageMin || null,
      weaponDamageMax: item.weaponDamageMax || null,
      weaponSpeed: item.weaponSpeed || null,
      dps: item.dps || null,
      sources: item.sources || [],
      firstSeen: item.firstSeen || null,
      lastSeen: item.lastSeen || null,
    };
  }

  /**
   * Split items into batches of MAX_ITEMS_PER_BATCH
   * @param {Array} items Items to batch
   * @returns {Array<Array>} Batched items
   */
  batchItems(items) {
    const batches = [];
    for (let i = 0; i < items.length; i += MAX_ITEMS_PER_BATCH) {
      batches.push(items.slice(i, i + MAX_ITEMS_PER_BATCH));
    }
    return batches;
  }

  /**
   * Get sync statistics
   * @returns {Object} Stats
   */
  getStats() {
    return {
      lastSync: this.syncState.lastSyncTimestamp
        ? new Date(this.syncState.lastSyncTimestamp * 1000).toISOString()
        : null,
      syncedItemCount: Object.keys(this.syncState.syncedItems).length
    };
  }
}

module.exports = LootSync;
