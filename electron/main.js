const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

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

// Prevent crashes from unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.warn('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

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

  // Auto-updater — check for updates silently
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (msg) => console.log('[updater]', msg),
    warn: (msg) => console.warn('[updater]', msg),
    error: (msg) => console.error('[updater]', msg),
  };

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] Update available: v${info.version}`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[updater] Update downloaded: v${info.version} — will install on quit`);
    if (tray) {
      tray.tray.setToolTip(`TurtleLootLine Companion — Update v${info.version} ready, restart to install`);
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('[updater] Update check failed:', err.message);
  });

  // Check now, then every 4 hours
  autoUpdater.checkForUpdates().catch(() => {});
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
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
      try {
        await api.syncCharacters(characters);
        console.log('Characters synced to API');
      } catch (syncError) {
        console.warn('Character sync failed (API may not be ready):', syncError.message);
      }
    }

    if (tray) {
      tray.updateLastSync();
      tray.updateCharacters(characters);
      tray.setStatus('connected');
    }
  } catch (error) {
    console.warn('Error scanning characters:', error.message);
    if (tray) tray.setStatus('connected');
  }
}

// Handle SavedVariables file updates
async function handleSavedVariablesUpdate(data) {
  try {
    console.log(`Equipment update: ${data.character} (${data.realm})`);

    if (!api) return;

    // Update equipment on API (won't throw — circuit breaker handles failures)
    await api.updateEquipment(data.character, data.realm, data.equipment);

    // Get item IDs from equipment
    const itemIds = Object.values(data.equipment)
      .filter(item => item && item.itemId)
      .map(item => item.itemId);

    if (itemIds.length > 0) {
      const upgrades = await api.getUpgrades(itemIds, data.character);

      if (Object.keys(upgrades).length > 0) {
        const cache = new Cache();
        cache.updateUpgrades(upgrades);

        const Generator = require('../src/generator');
        const wowPath = store.get('wowPath');
        Generator.generateUpgradeData(cache.getAllUpgrades(), wowPath);
        console.log('Upgrade data generated');
      }
    }

    if (tray) {
      tray.updateLastSync();
      tray.setStatus('connected');
    }
  } catch (error) {
    console.warn('SavedVariables handler error:', error.message);
  }
}

// Handle account-level SavedVariables updates (loot data)
async function handleLootDBUpdate(filePath, account) {
  try {
    if (!lootSync || !account) return;

    console.log(`Loot DB update detected for account: ${account}`);
    if (tray) tray.setStatus('syncing');

    const result = await lootSync.syncFromFile(filePath, account);
    console.log(`Loot sync: ${result.synced} synced, ${result.skipped} unchanged`);

    if (tray) {
      tray.updateLastSync();
      tray.setStatus('connected');
    }
  } catch (error) {
    console.warn('Loot sync failed (API may not be ready):', error.message);
    if (tray) tray.setStatus('connected'); // Don't show error state for expected failures
  }
}

// Manual sync triggered from tray
function handleSyncNow() {
  const wowPath = store.get('wowPath');
  if (wowPath) {
    // Reset circuit breaker so manual sync always tries the API
    if (api) api.resetBreaker();

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
    width: 650,
    height: 680,
    minWidth: 500,
    minHeight: 500,
    resizable: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  setupWindow.setMenuBarVisibility(false);
  setupWindow.loadFile(path.join(__dirname, '../ui/setup.html'));

  // F12 opens DevTools in a separate window
  setupWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      setupWindow.webContents.toggleDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });

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
    width: 650,
    height: 680,
    minWidth: 500,
    minHeight: 500,
    resizable: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, '../ui/settings.html'));

  // F12 opens DevTools in a separate window
  settingsWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      settingsWindow.webContents.toggleDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });

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
    // Try to validate token with API, but don't block saving if API is unreachable
    let tokenValid = false;
    let validationWarning = null;

    try {
      const testApi = new API(config.syncToken);
      tokenValid = await testApi.validateToken();
    } catch (apiError) {
      console.warn('Token validation failed (API may be unreachable):', apiError.message);
      validationWarning = 'Could not reach API to validate token. Config saved anyway.';
    }

    if (!tokenValid && !validationWarning) {
      // API was reachable but token was rejected — still save but warn
      validationWarning = 'Token could not be validated. Config saved — sync may fail until a valid token is provided.';
    }

    // Save config regardless
    store.set('syncToken', config.syncToken);
    store.set('wowPath', config.wowPath);
    store.set('autoStart', config.autoStart);
    store.set('syncIntervalMinutes', config.syncIntervalMinutes);
    store.set('firstRun', false);

    // Update auto-launch (can fail on some systems, don't crash)
    try {
      if (config.autoStart) {
        await autoLauncher.enable();
      } else {
        await autoLauncher.disable();
      }
    } catch (autoLaunchError) {
      console.warn('Auto-launch setup failed:', autoLaunchError.message);
    }

    // Initialize or reinitialize app
    if (watcher) {
      watcher.stop();
    }
    initializeApp();

    return { success: true, warning: validationWarning };
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

ipcMain.handle('open-external', (event, url) => {
  const { shell } = require('electron');
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

ipcMain.handle('test-token', async (event, token) => {
  try {
    const testApi = new API(token);
    const valid = await testApi.validateToken();
    return { valid, error: null };
  } catch (error) {
    return { valid: false, error: error.message };
  }
});

ipcMain.handle('get-sync-status', () => {
  const wowPath = store.get('wowPath');
  const status = {
    apiAvailable: api ? api.isAvailable() : false,
    characters: 0,
    lootItems: 0,
    lootSynced: 0,
    lastSync: null,
    watcherActive: !!watcher,
  };

  // Count characters
  if (wowPath) {
    try {
      const scanner = new Scanner(wowPath);
      status.characters = scanner.scanCharacters().length;
    } catch (e) {}
  }

  // Loot stats
  if (lootSync) {
    const lootStats = lootSync.getStats();
    status.lootSynced = lootStats.syncedItemCount;
    status.lastSync = lootStats.lastSync;
  }

  // Count loot DB items from file
  if (wowPath) {
    try {
      const Parser = require('../src/parser');
      const accountFiles = Parser.findAccountSavedVariables(wowPath);
      for (const { filePath } of accountFiles) {
        const lootDB = Parser.parseLootDB(filePath);
        if (lootDB && lootDB.items) {
          status.lootItems += Object.keys(lootDB.items).length;
        }
      }
    } catch (e) {}
  }

  return status;
});
