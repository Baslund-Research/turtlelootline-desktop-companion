const fs = require('fs');
const path = require('path');

class LuaParser {
  /**
   * Parse SavedVariables Lua file
   * @param {string} filePath Path to GearSync.lua file
   * @returns {Object|null} Parsed data or null
   */
  static parseSavedVariables(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // Extract GearSyncData table
      const match = content.match(/GearSyncData\s*=\s*(\{[\s\S]*?\n\})/);

      if (!match) {
        console.warn(`No GearSyncData found in ${filePath}`);
        return null;
      }

      // Parse the Lua table to JSON
      const luaTable = match[1];
      const parsed = this.luaTableToJson(luaTable);

      return parsed;
    } catch (error) {
      console.error('Error parsing SavedVariables:', error);
      return null;
    }
  }

  /**
   * Convert Lua table syntax to JSON
   * This is a simplified parser that works for basic Lua tables
   * For complex cases, consider using a proper Lua parser library
   *
   * @param {string} luaTable Lua table string
   * @returns {Object} Parsed object
   */
  static luaTableToJson(luaTable) {
    let jsonString = luaTable;

    // Replace Lua table syntax with JSON syntax
    jsonString = jsonString
      // Handle ["key"] = value -> "key": value (including empty string keys)
      .replace(/\["([^"]*)"\]\s*=/g, '"$1":')
      // Handle [number] = value -> "number": value
      .replace(/\[(\d+)\]\s*=/g, '"$1":')
      // Handle key = value -> "key": value (for simple keys, but not inside strings)
      .replace(/(?<!["\w])(\w+)\s*=/g, '"$1":')
      // Remove trailing commas before closing braces/brackets
      .replace(/,(\s*[}\]])/g, '$1')
      // Handle Lua nil -> null
      .replace(/\bnil\b/g, 'null')
      // Handle Lua true/false (already valid JSON)
      .trim();

    // For very simple tables, JSON.parse might work after these replacements
    // For complex nested tables, we need a more sophisticated approach

    try {
      // Try direct JSON parse first
      return JSON.parse(jsonString);
    } catch (e) {
      // If that fails, use a more robust parsing approach
      return this.parseComplexLuaTable(luaTable);
    }
  }

  /**
   * More robust Lua table parser for complex nested structures
   * @param {string} luaTable Lua table string
   * @returns {Object} Parsed object
   */
  static parseComplexLuaTable(luaTable) {
    // This is a simplified parser - for production, use a library like 'luaparse'
    const result = {};

    // Remove outer braces
    let content = luaTable.trim();
    if (content.startsWith('{')) content = content.slice(1);
    if (content.endsWith('}')) content = content.slice(0, -1);

    // Split by lines and parse each key-value pair
    const lines = content.split('\n');
    let currentKey = null;
    let currentValue = '';
    let bracketDepth = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('--')) continue;

      // Count brackets to handle nested tables
      for (const char of trimmed) {
        if (char === '{') bracketDepth++;
        if (char === '}') bracketDepth--;
      }

      // Match key = value pattern
      const keyValueMatch = trimmed.match(/^\["?(\w+)"?\]\s*=\s*(.+),?$/);
      if (keyValueMatch && bracketDepth === 0) {
        const [, key, value] = keyValueMatch;
        result[key] = this.parseValue(value.replace(/,$/, ''));
      } else if (keyValueMatch && bracketDepth > 0) {
        // Start of nested table
        currentKey = keyValueMatch[1];
        currentValue = keyValueMatch[2];
      } else if (bracketDepth > 0 && currentKey) {
        // Continue nested table
        currentValue += '\n' + trimmed;
      } else if (bracketDepth === 0 && currentKey) {
        // End of nested table
        currentValue += '\n' + trimmed;
        result[currentKey] = this.parseValue(currentValue.replace(/,$/, ''));
        currentKey = null;
        currentValue = '';
      }
    }

    return result;
  }

  /**
   * Parse a Lua value (string, number, boolean, table)
   * @param {string} value Lua value string
   * @returns {any} Parsed value
   */
  static parseValue(value) {
    value = value.trim().replace(/,$/, '');

    // String
    if (value.startsWith('"') && value.endsWith('"')) {
      return value.slice(1, -1);
    }

    // Number
    if (/^-?\d+(\.\d+)?$/.test(value)) {
      return parseFloat(value);
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Nil
    if (value === 'nil') return null;

    // Table
    if (value.startsWith('{')) {
      return this.parseComplexLuaTable(value);
    }

    // Default: return as string
    return value;
  }

  /**
   * Parse GearSyncLootDB from account-level SavedVariables file
   * @param {string} filePath Path to account-level GearSync.lua
   * @returns {Object|null} Parsed loot DB or null
   */
  static parseLootDB(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');

      // Extract GearSyncLootDB table
      const match = content.match(/GearSyncLootDB\s*=\s*(\{[\s\S]*?\n\})/);

      if (!match) {
        console.log(`No GearSyncLootDB found in ${filePath}`);
        return null;
      }

      const luaTable = match[1];
      const parsed = this.luaTableToJson(luaTable);

      return parsed;
    } catch (error) {
      console.error('Error parsing LootDB:', error);
      return null;
    }
  }

  /**
   * Find account-level SavedVariables file containing GearSyncLootDB
   * @param {string} wowPath Root WoW installation path
   * @returns {Array<{account: string, filePath: string}>} Account files found
   */
  static findAccountSavedVariables(wowPath) {
    const results = [];
    const wtfPath = path.join(wowPath, 'WTF', 'Account');

    if (!fs.existsSync(wtfPath)) return results;

    try {
      const accounts = fs.readdirSync(wtfPath);
      for (const account of accounts) {
        const accountPath = path.join(wtfPath, account);
        if (!fs.statSync(accountPath).isDirectory()) continue;
        if (account === 'SavedVariables') continue;

        const svFile = path.join(accountPath, 'SavedVariables', 'GearSync.lua');
        if (fs.existsSync(svFile)) {
          results.push({ account, filePath: svFile });
        }
      }
    } catch (error) {
      console.error('Error finding account SavedVariables:', error);
    }

    return results;
  }

  /**
   * Generate mock SavedVariables data for testing
   * @returns {Object} Mock character data
   */
  static generateMockData() {
    return {
      lastUpdated: Math.floor(Date.now() / 1000),
      character: 'TestChar',
      realm: 'Turtle WoW',
      class: 'Paladin',
      equipment: {
        1: {
          slot: 'Head',
          itemId: 12640,
          itemName: 'Lionheart Helm',
          itemLink: '|cff0070dd|Hitem:12640:0:0:0|h[Lionheart Helm]|h|r'
        },
        5: {
          slot: 'Chest',
          itemId: 11726,
          itemName: 'Savage Gladiator Chain',
          itemLink: '|cff0070dd|Hitem:11726:0:0:0|h[Savage Gladiator Chain]|h|r'
        },
        16: {
          slot: 'MainHand',
          itemId: 19019,
          itemName: 'Thunderfury, Blessed Blade of the Windseeker',
          itemLink: '|cffff8000|Hitem:19019:0:0:0|h[Thunderfury, Blessed Blade of the Windseeker]|h|r'
        }
      }
    };
  }
}

module.exports = LuaParser;
