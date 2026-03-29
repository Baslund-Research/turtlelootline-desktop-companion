const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');

const Tray = require('./tray');
const Scanner = require('../src/scanner');
const Watcher = require('../src/watcher');
const API = require('../src/api');
const Cache = require('../src/cache');
const LootSync = require('../src/loot-sync');

// Initialize electron-store for config
const store = new Store({
  defaults: {
    syncToken: null,
    wowPath: null,
    autoStart: true,
    syncIntervalMinutes: 5,
    firstRun: true
  }
});

// Auto-launch setup
const autoLauncher = new AutoLaunch({
  name: 'TurtleLootLine Companion',
  path: app.getPath('exe')
});

let tray = null;
let setupWindow = null;
let settingsWindow = null;
let watcher = null;
let api = null;
let lootSync = null;

// Ensure single instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // Show setup or settings window if someone tries to launch again
    if (setupWindow) {
      setupWindow.focus();
    } else if (settingsWindow) {
      settingsWindow.focus();
    }
  });
}

// App lifecycle
app.whenReady().then(async () => {
  // Check if this is first run
  if (store.get('firstRun')) {
    showSetupWindow();
  } else {
    initializeApp();
  }

  // Create tray icon
  tray = new Tray(store, {
    onSyncNow: handleSyncNow,
    onOpenSettings: showSettingsWindow,
    onOpenWowFolder: openWowFolder,
    onQuit: () => app.quit()
  });

  // Set up auto-launch if enabled
  if (store.get('autoStart')) {
    autoLauncher.enable();
  }
});

app.on('window-all-closed', (e) => {
  // Prevent app from quitting when windows close (runs in tray)
  e.preventDefault();
});

app.on('before-quit', () => {
  if (watcher) {
    watcher.stop();
  }
});

// Initialize the main app after setup
function initializeApp() {
  const syncToken = store.get('syncToken');
  const wowPath = store.get('wowPath');

  if (!syncToken || !wowPath) {
    console.error('Missing configuration. Please run setup.');
    showSetupWindow();
    return;
  }

  // Initialize API client
  api = new API(syncToken);

  // Initialize loot sync
  lootSync = new LootSync(api);

  // Scan for characters initially
  scanAndSyncCharacters(wowPath);

  // Start watching SavedVariables (per-character + account-level)
  watcher = new Watcher(wowPath, handleSavedVariablesUpdate, handleLootDBUpdate);
  watcher.start();

  // Set up periodic sync
  const syncInterval = store.get('syncIntervalMinutes') * 60 * 1000;
  setInterval(() => {
    scanAndSyncCharacters(wowPath);
  }, syncInterval);

  if (tray) {
    tray.setStatus('connected');
  }
}

// Scan characters and sync to API
async function scanAndSyncCharacters(wowPath) {
  try {
    if (tray) tray.setStatus('syncing');

    const scanner = new Scanner(wowPath);
    const characters = scanner.scanCharacters();

    console.log(`Found ${characters.length} characters`);

    if (api && characters.length > 0) {
      await api.syncCharacters(characters);
      console.log('Characters synced to API');
    }

    if (tray) {
      tray.updateLastSync();
      tray.updateCharacters(characters);
      tray.setStatus('connected');
    }
  } catch (error) {
    console.error('Error scanning/syncing characters:', error);
    if (tray) tray.setStatus('error');
  }
}

// Handle SavedVariables file updates
async function handleSavedVariablesUpdate(data) {
  try {
    console.log(`SavedVariables updated for ${data.character} on ${data.realm}`);

    if (!api) return;

    if (tray) tray.setStatus('syncing');

    // Update equipment on API
    await api.updateEquipment(data.character, data.realm, data.equipment);

    // Get item IDs from equipment
    const itemIds = Object.values(data.equipment)
      .filter(item => item && item.itemId)
      .map(item => item.itemId);

    if (itemIds.length > 0) {
      // Fetch upgrade data from API
      const upgrades = await api.getUpgrades(itemIds, data.character);

      // Update local cache
      const cache = new Cache();
      cache.updateUpgrades(upgrades);

      // Generate UpgradeData.lua for the addon
      const Generator = require('../src/generator');
      const wowPath = store.get('wowPath');
      Generator.generateUpgradeData(cache.getAllUpgrades(), wowPath);

      console.log('Upgrade data generated');
    }

    if (tray) {
      tray.updateLastSync();
      tray.setStatus('connected');
    }
  } catch (error) {
    console.error('Error handling SavedVariables update:', error);
    if (tray) tray.setStatus('error');
  }
}

// Handle account-level SavedVariables updates (loot data)
async function handleLootDBUpdate(filePath, account) {
  try {
    if (!lootSync || !account) return;

    console.log(`Loot DB update detected for account: ${account}`);
    if (tray) tray.setStatus('syncing');

    const result = await lootSync.syncFromFile(filePath, account);
    console.log(`Loot sync complete: ${result.synced} synced, ${result.skipped} skipped`);

    if (tray) {
      tray.updateLastSync();
      tray.setStatus('connected');
    }
  } catch (error) {
    console.error('Error handling loot DB update:', error);
    if (tray) tray.setStatus('error');
  }
}

// Manual sync triggered from tray
function handleSyncNow() {
  const wowPath = store.get('wowPath');
  if (wowPath) {
    scanAndSyncCharacters(wowPath);

    // Also sync loot data
    if (lootSync) {
      lootSync.syncAll(wowPath).then(result => {
        console.log(`Manual loot sync: ${result.synced} synced, ${result.skipped} skipped`);
      }).catch(error => {
        console.error('Manual loot sync error:', error);
      });
    }
  }
}

// Open WoW folder in file explorer
function openWowFolder() {
  const wowPath = store.get('wowPath');
  if (wowPath && fs.existsSync(wowPath)) {
    const { shell } = require('electron');
    shell.openPath(wowPath);
  }
}

// Show setup window
function showSetupWindow() {
  if (setupWindow) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupWindow.loadFile(path.join(__dirname, '../ui/setup.html'));

  setupWindow.on('closed', () => {
    setupWindow = null;
  });
}

// Show settings window
function showSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.loadFile(path.join(__dirname, '../ui/settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// IPC handlers for setup/settings windows
ipcMain.handle('get-config', () => {
  return {
    syncToken: store.get('syncToken'),
    wowPath: store.get('wowPath'),
    autoStart: store.get('autoStart'),
    syncIntervalMinutes: store.get('syncIntervalMinutes')
  };
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    // Validate token with API
    const testApi = new API(config.syncToken);
    const valid = await testApi.validateToken();

    if (!valid) {
      throw new Error('Invalid sync token');
    }

    // Save config
    store.set('syncToken', config.syncToken);
    store.set('wowPath', config.wowPath);
    store.set('autoStart', config.autoStart);
    store.set('syncIntervalMinutes', config.syncIntervalMinutes);
    store.set('firstRun', false);

    // Update auto-launch
    if (config.autoStart) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }

    // Initialize or reinitialize app
    if (watcher) {
      watcher.stop();
    }
    initializeApp();

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-folder', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Select World of Warcraft folder'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('detect-wow-path', () => {
  const Scanner = require('../src/scanner');
  return Scanner.detectWowPath();
});
