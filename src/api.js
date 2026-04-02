const fetch = require('node-fetch');

const API_BASE_PROD = 'https://g4440c8wko4kw8kswsw84c4o.cool.lastcloud.io';
const API_BASE_DEV = 'http://localhost:3000';

class TurtleLootLineAPI {
  constructor(syncToken, apiUrl) {
    this.syncToken = syncToken;
    this.baseUrl = apiUrl || API_BASE_PROD;
    this.apiAvailable = true;       // Circuit breaker flag
    this.lastFailTime = 0;
    this.cooldownMs = 5 * 60 * 1000; // 5 min cooldown after failure
  }

  /**
   * Check if API is available (circuit breaker)
   * Resets after cooldown period
   */
  isAvailable() {
    if (this.apiAvailable) return true;
    if (Date.now() - this.lastFailTime > this.cooldownMs) {
      this.apiAvailable = true;
      console.log('API circuit breaker reset — retrying');
      return true;
    }
    return false;
  }

  /**
   * Mark API as unavailable (trip circuit breaker)
   */
  tripBreaker(reason) {
    if (this.apiAvailable) {
      console.warn(`API unavailable — pausing requests for 5 min (${reason})`);
    }
    this.apiAvailable = false;
    this.lastFailTime = Date.now();
  }

  /**
   * Manually reset circuit breaker (e.g. manual sync)
   */
  resetBreaker() {
    this.apiAvailable = true;
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
    if (!this.isAvailable()) return { skipped: true };

    try {
      const charactersData = characters.map(char => ({
        name: char.name,
        realm: char.realm,
        account: char.account,
        class: char.class || undefined,
        race: char.race || undefined,
        level: char.level || undefined
      }));

      const response = await fetch(`${this.baseUrl}/api/characters/sync`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ characters: charactersData })
      });

      if (!response.ok) {
        this.tripBreaker(`${response.status} ${response.statusText}`);
        return { success: false, error: `${response.status}` };
      }

      return await response.json();
    } catch (error) {
      this.tripBreaker(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update character equipment and talents
   * @param {string} characterName Character name
   * @param {string} realm Realm name
   * @param {Object} equipment Equipment data
   * @param {Object} [talents] Talent data (optional)
   * @returns {Promise<Object>} API response
   */
  async updateEquipment(characterName, realm, equipment, talents, characterClass, characterRace, characterLevel) {
    if (!this.isAvailable()) return { skipped: true };

    try {
      // Convert equipment object to array format expected by API
      const equipmentArray = Object.entries(equipment).map(([slotId, item]) => ({
        slot: item.slot,
        slotId: parseInt(slotId),
        itemId: item.itemId,
        itemName: item.itemName,
        itemLink: item.itemLink
      }));

      const payload = {
        character: characterName,
        realm: realm,
        equipment: equipmentArray,
        syncedAt: new Date().toISOString()
      };

      // Include talent data if available
      if (talents) {
        payload.talents = talents;
      }

      // Include class and race if available
      if (characterClass) {
        payload.class = characterClass;
      }
      if (characterRace) {
        payload.race = characterRace;
      }
      if (characterLevel) {
        payload.level = characterLevel;
      }

      const response = await fetch(`${this.baseUrl}/api/characters/equipment`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        this.tripBreaker(`${response.status} ${response.statusText}`);
        return { success: false, error: `${response.status}` };
      }

      return await response.json();
    } catch (error) {
      this.tripBreaker(error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get full upgrade recommendations for all slots based on character gear
   * Uses the POST /api/upgrades endpoint (same as the web app's Upgrade Rec tab)
   * @param {string} characterClass Class name (e.g. "Mage")
   * @param {number} level Character level
   * @param {Object} equipment Equipment object keyed by slotId
   * @returns {Promise<Object>} Upgrade data keyed by item ID
   */
  async getFullUpgradeRecommendations(characterClass, level, equipment) {
    if (!this.isAvailable()) return {};

    try {
      // Map class + generic role to a profile key
      const classLower = (characterClass || 'warrior').toLowerCase();
      const defaultProfiles = {
        warrior: 'warrior-dps', paladin: 'paladin-tank', hunter: 'hunter-mm',
        rogue: 'rogue-combat', priest: 'priest-healer', shaman: 'shaman-resto',
        mage: 'mage-frost', warlock: 'warlock-aff', druid: 'druid-feral'
      };
      const profileKey = defaultProfiles[classLower] || `${classLower}-dps`;

      // Convert equipment to gear map (slot name -> itemId)
      const SLOT_TO_GEAR = {
        1: 'head', 2: 'neck', 3: 'shoulder', 5: 'chest', 6: 'waist',
        7: 'legs', 8: 'feet', 9: 'wrist', 10: 'hands', 11: 'finger1',
        12: 'finger2', 13: 'trinket1', 14: 'trinket2', 15: 'back',
        16: 'mainhand', 17: 'offhand', 18: 'ranged'
      };

      const gear = {};
      for (const [slotId, item] of Object.entries(equipment)) {
        const gearSlot = SLOT_TO_GEAR[parseInt(slotId)];
        if (gearSlot && item && item.itemId) {
          gear[gearSlot] = item.itemId;
        }
      }

      const response = await fetch(`${this.baseUrl}/api/upgrades`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          profileKey,
          level: level || 60,
          gear,
          minUpgradePercent: 5
        })
      });

      if (!response.ok) {
        this.tripBreaker(`${response.status} ${response.statusText}`);
        return {};
      }

      const data = await response.json();

      // Convert recommendations to flat upgrade map (itemId -> stat diffs)
      const upgrades = {};
      if (data.recommendations) {
        for (const rec of data.recommendations) {
          if (rec.items) {
            for (const item of rec.items) {
              if (item.itemId && item.upgradePercent) {
                upgrades[item.itemId] = {
                  overall: `+${item.upgradePercent.toFixed(1)}%`,
                  note: `${rec.slot} upgrade from ${item.source || 'Unknown'}`
                };
              }
            }
          }
        }
      }

      return upgrades;
    } catch (error) {
      this.tripBreaker(error.message);
      return {};
    }
  }

  /**
   * Get upgrade recommendations for items
   * @param {Array<number>} itemIds Array of item IDs
   * @param {string} characterName Character name for context
   * @returns {Promise<Object>} Upgrade data keyed by item ID
   */
  async getUpgrades(itemIds, characterName) {
    if (!this.isAvailable()) return {};

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
        this.tripBreaker(`${response.status} ${response.statusText}`);
        return {};
      }

      const data = await response.json();
      return data.upgrades || {};
    } catch (error) {
      this.tripBreaker(error.message);
      return {};
    }
  }

  /**
   * Sync bag and bank inventory for a character
   * @param {Object} data Character inventory data
   * @returns {Promise<Object>} API response
   */
  async syncInventory({ character, realm, account, bags, bank, bankSyncedAt }) {
    if (!this.isAvailable()) return { skipped: true };

    try {
      const payload = { character, realm, account };
      if (bags && bags.length > 0) payload.bags = bags;
      if (bank && bank.length > 0) {
        payload.bank = bank;
        payload.bankSyncedAt = bankSyncedAt || new Date().toISOString();
      }

      const response = await fetch(`${this.baseUrl}/api/characters/inventory`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Inventory sync failed (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Inventory sync error:', error.message);
      this.tripBreaker(error.message);
      return { success: false, error: error.message };
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
    if (!this.isAvailable()) return { success: false, error: 'API paused (circuit breaker)' };

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
        return { success: false, error: `${response.status} ${response.statusText}` };
      }

      return await response.json();
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get list of wanted item IDs from the server
   * @returns {Promise<Object>} { itemIds: number[], count: number }
   */
  async getWantedItems() {
    if (!this.isAvailable()) return { itemIds: [], count: 0 };

    try {
      const response = await fetch(`${this.baseUrl}/api/items/wanted`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        this.tripBreaker(`${response.status} ${response.statusText}`);
        return { itemIds: [], count: 0 };
      }

      return await response.json();
    } catch (error) {
      this.tripBreaker(error.message);
      return { itemIds: [], count: 0 };
    }
  }

  /**
   * Get wanted items as ready-to-write Lua file content
   * @returns {Promise<string|null>} Lua file content or null on failure
   */
  async getWantedLua() {
    if (!this.isAvailable()) return null;

    try {
      const response = await fetch(`${this.baseUrl}/api/items/wanted-lua`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        this.tripBreaker(`${response.status} ${response.statusText}`);
        return null;
      }

      return await response.text();
    } catch (error) {
      this.tripBreaker(error.message);
      return null;
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
