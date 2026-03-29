const fetch = require('node-fetch');

const API_BASE = 'https://g4440c8wko4kw8kswsw84c4o.cool.lastcloud.io';

class TurtleLootLineAPI {
  constructor(syncToken) {
    this.syncToken = syncToken;
    this.baseUrl = API_BASE;
  }

  /**
   * Get request headers with auth
   * @returns {Object} Headers object
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.syncToken}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Validate sync token
   * @returns {Promise<boolean>} True if valid
   */
  async validateToken() {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/validate`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      return response.ok;
    } catch (error) {
      console.error('Token validation error:', error);
      return false;
    }
  }

  /**
   * Sync character list to API
   * @param {Array} characters Array of character objects
   * @returns {Promise<Object>} API response
   */
  async syncCharacters(characters) {
    try {
      const charactersData = characters.map(char => ({
        name: char.name,
        realm: char.realm,
        account: char.account
      }));

      const response = await fetch(`${this.baseUrl}/api/characters/sync`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ characters: charactersData })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error syncing characters:', error);
      throw error;
    }
  }

  /**
   * Update character equipment
   * @param {string} characterName Character name
   * @param {string} realm Realm name
   * @param {Object} equipment Equipment data
   * @returns {Promise<Object>} API response
   */
  async updateEquipment(characterName, realm, equipment) {
    try {
      // Convert equipment object to array format expected by API
      const equipmentArray = Object.entries(equipment).map(([slotId, item]) => ({
        slot: item.slot,
        slotId: parseInt(slotId),
        itemId: item.itemId,
        itemName: item.itemName,
        itemLink: item.itemLink
      }));

      const response = await fetch(`${this.baseUrl}/api/characters/equipment`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          character: characterName,
          realm: realm,
          equipment: equipmentArray,
          syncedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error updating equipment:', error);
      throw error;
    }
  }

  /**
   * Get upgrade recommendations for items
   * @param {Array<number>} itemIds Array of item IDs
   * @param {string} characterName Character name for context
   * @returns {Promise<Object>} Upgrade data keyed by item ID
   */
  async getUpgrades(itemIds, characterName) {
    try {
      const params = new URLSearchParams({
        itemIds: itemIds.join(','),
        character: characterName
      });

      const response = await fetch(`${this.baseUrl}/api/upgrades?${params}`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      // Expected format: { itemId: { stamina: "+15", armor: "+120", ... }, ... }
      return data.upgrades || {};
    } catch (error) {
      console.error('Error fetching upgrades:', error);
      // Return empty object on error so app can continue
      return {};
    }
  }

  /**
   * Bulk sync collected item data to the API
   * @param {string} account Account name
   * @param {string} realm Realm name
   * @param {Array} items Array of item objects
   * @returns {Promise<Object>} API response with created/updated counts
   */
  async bulkSyncItems(account, realm, items) {
    try {
      const response = await fetch(`${this.baseUrl}/api/items/bulk-sync`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          account,
          realm,
          syncTimestamp: Math.floor(Date.now() / 1000),
          items
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error bulk syncing items:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate mock upgrade data for testing
   * @param {Array<number>} itemIds Item IDs to generate data for
   * @returns {Object} Mock upgrade data
   */
  static generateMockUpgrades(itemIds) {
    const mockData = {};

    const stats = ['stamina', 'armor', 'strength', 'agility', 'defense', 'attackPower'];
    const notes = [
      'BIS for Phase 2',
      'Good for tanking',
      'Excellent DPS upgrade',
      'Pre-raid BIS',
      'Consider for PvP'
    ];

    itemIds.forEach(itemId => {
      const numStats = Math.floor(Math.random() * 4) + 2;
      const itemStats = {};

      for (let i = 0; i < numStats; i++) {
        const stat = stats[Math.floor(Math.random() * stats.length)];
        const value = Math.random() > 0.5
          ? `+${Math.floor(Math.random() * 50) + 1}`
          : `-${Math.floor(Math.random() * 10) + 1}`;
        itemStats[stat] = value;
      }

      const overall = `+${(Math.random() * 15).toFixed(1)}%`;
      itemStats.overall = overall;

      if (Math.random() > 0.5) {
        itemStats.note = notes[Math.floor(Math.random() * notes.length)];
      }

      mockData[itemId] = itemStats;
    });

    return mockData;
  }
}

module.exports = TurtleLootLineAPI;
