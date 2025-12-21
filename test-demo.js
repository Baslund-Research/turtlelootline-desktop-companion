#!/usr/bin/env node
/**
 * Demo/Test script for TurtleLootLine Companion
 * Demonstrates functionality without requiring WoW installation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const Parser = require('./src/parser');
const Generator = require('./src/generator');
const API = require('./src/api');
const Cache = require('./src/cache');
const Scanner = require('./src/scanner');

console.log('🐢 TurtleLootLine Companion - Demo Mode\n');

// 1. Test Parser with mock data
console.log('1️⃣  Testing Lua Parser...');
const mockCharacterData = Parser.generateMockData();
console.log('✓ Generated mock character data:');
console.log(`   - Character: ${mockCharacterData.character}`);
console.log(`   - Realm: ${mockCharacterData.realm}`);
console.log(`   - Class: ${mockCharacterData.class}`);
console.log(`   - Equipment slots: ${Object.keys(mockCharacterData.equipment).length}`);
console.log();

// 2. Test mock upgrade data generation
console.log('2️⃣  Testing API Mock Upgrade Generator...');
const itemIds = [12640, 11726, 19019];
const mockUpgrades = API.generateMockUpgrades(itemIds);
console.log('✓ Generated mock upgrade data:');
for (const [itemId, upgrades] of Object.entries(mockUpgrades)) {
  console.log(`   - Item ${itemId}:`);
  for (const [stat, value] of Object.entries(upgrades)) {
    console.log(`     ${stat}: ${value}`);
  }
}
console.log();

// 3. Test Cache system
console.log('3️⃣  Testing Local Cache...');
const cache = new Cache();
cache.updateUpgrades(mockUpgrades);
const stats = cache.getStats();
console.log('✓ Cache updated:');
console.log(`   - Items cached: ${stats.itemCount}`);
console.log(`   - Last sync: ${stats.lastSync}`);
console.log(`   - Cache size: ${stats.cacheSize} bytes`);
console.log();

// 4. Test Lua Generator
console.log('4️⃣  Testing Lua Generator...');
const demoDir = path.join(os.tmpdir(), 'turtlelootline-demo');
const demoWowPath = path.join(demoDir, 'WoW');
const demoAddonPath = path.join(demoWowPath, 'Interface', 'AddOns', 'GearSync');

// Create demo directory
if (!fs.existsSync(demoAddonPath)) {
  fs.mkdirSync(demoAddonPath, { recursive: true });
}

const generatedPath = Generator.generateUpgradeData(cache.getAllUpgrades(), demoWowPath);
console.log('✓ Generated UpgradeData.lua:');
console.log(`   - Path: ${generatedPath}`);
console.log(`   - Size: ${fs.statSync(generatedPath).size} bytes`);
console.log();

// 5. Show generated content
console.log('5️⃣  Generated UpgradeData.lua Content:');
console.log('─'.repeat(60));
const generatedContent = fs.readFileSync(generatedPath, 'utf8');
console.log(generatedContent);
console.log('─'.repeat(60));
console.log();

// 6. Test WoW path detection
console.log('6️⃣  Testing WoW Path Detection...');
const detectedPath = Scanner.detectWowPath();
if (detectedPath) {
  console.log(`✓ Auto-detected WoW installation: ${detectedPath}`);
} else {
  console.log('✗ No WoW installation detected (expected in demo mode)');
}
console.log();

// 7. Create mock SavedVariables
console.log('7️⃣  Creating Mock SavedVariables...');
const mockSavedVarsDir = path.join(demoDir, 'WTF', 'Account', 'TESTACCOUNT', 'Turtle WoW', 'TestChar', 'SavedVariables');
if (!fs.existsSync(mockSavedVarsDir)) {
  fs.mkdirSync(mockSavedVarsDir, { recursive: true });
}

// Generate mock SavedVariables file
const mockSavedVarsPath = path.join(mockSavedVarsDir, 'GearSync.lua');
const mockLuaContent = `GearSyncData = {
    ["lastUpdated"] = ${Math.floor(Date.now() / 1000)},
    ["character"] = "TestChar",
    ["realm"] = "Turtle WoW",
    ["class"] = "Paladin",
    ["equipment"] = {
        [1] = {
            ["slot"] = "Head",
            ["itemId"] = 12640,
            ["itemName"] = "Lionheart Helm",
            ["itemLink"] = "|cff1eff00|Hitem:12640:0:0:0|h[Lionheart Helm]|h|r",
        },
        [5] = {
            ["slot"] = "Chest",
            ["itemId"] = 11726,
            ["itemName"] = "Savage Gladiator Chain",
            ["itemLink"] = "|cff0070dd|Hitem:11726:0:0:0|h[Savage Gladiator Chain]|h|r",
        },
        [16] = {
            ["slot"] = "MainHand",
            ["itemId"] = 19019,
            ["itemName"] = "Thunderfury",
            ["itemLink"] = "|cffff8000|Hitem:19019:0:0:0|h[Thunderfury]|h|r",
        },
    },
}
`;

fs.writeFileSync(mockSavedVarsPath, mockLuaContent);
console.log('✓ Created mock SavedVariables file:');
console.log(`   - Path: ${mockSavedVarsPath}`);

// Parse it back
const parsedData = Parser.parseSavedVariables(mockSavedVarsPath);
if (parsedData) {
  console.log('✓ Successfully parsed SavedVariables:');
  console.log(`   - Character: ${parsedData.character}`);
  console.log(`   - Equipment slots: ${Object.keys(parsedData.equipment || {}).length}`);
} else {
  console.log('✗ Failed to parse SavedVariables');
}
console.log();

// 8. Summary
console.log('🎉 Demo Complete!');
console.log();
console.log('Demo files created in:');
console.log(`   ${demoDir}`);
console.log();
console.log('To run the actual app:');
console.log('   npm start');
console.log();
console.log('Note: For full functionality, you need:');
console.log('   - A valid TurtleLootLine sync token');
console.log('   - Turtle WoW installation');
console.log('   - GearSync addon installed in WoW');
