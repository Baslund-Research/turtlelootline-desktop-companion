const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const AutoLaunch = require('auto-launch');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');

// Set app name before anything else (fixes macOS menu bar showing "Electron")
app.name = 'TurtleLootLine Companion';

const Tray = require('./tray');
const Scanner = require('../src/scanner');
const Watcher = require('../src/watcher');
const Parser = require('../src/parser');
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
    firstRun: true,
    apiUrl: ''
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
let debugWindow = null;
let watcher = null;
let api = null;
let lootSync = null;

// Debug log buffer
const debugLogs = [];
const MAX_DEBUG_LOGS = 500;

function addDebugLog(type, message, data = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    type, // 'info' | 'error' | 'sync' | 'warn'
    message,
    data
  };
  debugLogs.push(entry);
  if (debugLogs.length > MAX_DEBUG_LOGS) {
    debugLogs.splice(0, debugLogs.length - MAX_DEBUG_LOGS);
  }
  // Notify debug window if open
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.webContents.send('debug-log', entry);
  }
}

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

// Set dock icon on macOS
if (process.platform === 'darwin') {
  const { nativeImage } = require('electron');
  const dockIcon = nativeImage.createFromPath(path.join(__dirname, '../assets/icon.png'));
  if (!dockIcon.isEmpty()) {
    app.dock.setIcon(dockIcon);
  }
}

// Set macOS application menu with correct app name
if (process.platform === 'darwin') {
  const appName = 'TurtleLootLine Companion';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: appName,
      submenu: [
        { role: 'about', label: `About ${appName}` },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${appName}` }
      ]
    },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]));
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
    onOpenDebugLog: app.isPackaged ? null : showDebugWindow,
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

  // Initialize API client (use custom URL if set, otherwise production)
  const apiUrl = store.get('apiUrl') || '';
  api = new API(syncToken, apiUrl || undefined);
  console.log(`API target: ${api.baseUrl}`);
  addDebugLog('info', `App initialized — API target: ${api.baseUrl}`);

  // Initialize loot sync
  lootSync = new LootSync(api);

  // Scan for characters initially
  scanAndSyncCharacters(wowPath);

  // Start watching SavedVariables (per-character + account-level)
  watcher = new Watcher(wowPath, handleSavedVariablesUpdate, handleLootDBUpdate);
  watcher.start();
  addDebugLog('info', 'File watcher started');

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

    // Parse GearScore data for each character (enrich + sync equipment)
    for (const char of characters) {
      try {
        if (fs.existsSync(char.gearSyncFile)) {
          const data = Parser.parseSavedVariables(char.gearSyncFile);
          if (data) {
            if (data.class) char.class = data.class;
            if (data.race) char.race = data.race;
            if (data.level) char.level = data.level;

            // Also sync equipment if available
            if (data.equipment && api) {
              try {
                await api.updateEquipment(
                  data.character || char.name,
                  data.realm || char.realm,
                  data.equipment,
                  data.talents || null,
                  data.class || null,
                  data.race || null,
                  data.level || null
                );
                addDebugLog('sync', `Equipment synced for ${char.name} (${char.realm})`, {
                  slots: Object.keys(data.equipment).length
                });
              } catch (equipError) {
                addDebugLog('warn', `Equipment sync failed for ${char.name}: ${equipError.message}`);
              }
            }
          } else {
            addDebugLog('warn', `No GearScoreData found in ${char.gearSyncFile}`);
          }
        } else {
          addDebugLog('info', `No GearScore.lua for ${char.name} (${char.realm})`);
        }
      } catch (e) {
        addDebugLog('error', `Parse error for ${char.name}: ${e.message}`);
      }
    }

    console.log(`Found ${characters.length} characters`);
    addDebugLog('info', `Scanned ${characters.length} characters`, characters.map(c => `${c.name} (${c.realm})${c.class ? ' [' + c.class + ']' : ''}`));

    if (api && characters.length > 0) {
      try {
        await api.syncCharacters(characters);
        console.log('Characters synced to API');
        addDebugLog('sync', `Characters synced to API (${characters.length} characters)`);
      } catch (syncError) {
        console.warn('Character sync failed (API may not be ready):', syncError.message);
        addDebugLog('error', `Character sync failed: ${syncError.message}`);
      }
    }

    if (tray) {
      tray.updateLastSync();
      tray.updateCharacters(characters);
      tray.setStatus('connected');
    }
  } catch (error) {
    console.warn('Error scanning characters:', error.message);
    addDebugLog('error', `Error scanning characters: ${error.message}`);
    if (tray) tray.setStatus('connected');
  }
}

// Handle SavedVariables file updates
async function handleSavedVariablesUpdate(data) {
  try {
    console.log(`Equipment update: ${data.character} (${data.realm})`);
    addDebugLog('sync', `Equipment update: ${data.character} (${data.realm})`, {
      slots: Object.keys(data.equipment).length,
      class: data.class || 'unknown',
      level: data.level || '?'
    });

    if (!api) return;

    // Update equipment + talents on API (won't throw — circuit breaker handles failures)
    await api.updateEquipment(data.character, data.realm, data.equipment, data.talents || null, data.class || null, data.race || null, data.level || null);

    // Fetch upgrade recommendations from server
    try {
      const params = new URLSearchParams({ character: data.character });
      if (data.realm) params.set('realm', data.realm);

      const response = await fetch(`${api.baseUrl}/api/upgrades/recommendations?${params}`, {
        method: 'GET',
        headers: api.getHeaders()
      });

      if (response.ok) {
        const recData = await response.json();
        const upgrades = recData.upgrades || {};

        if (Object.keys(upgrades).length > 0) {
          const cache = new Cache();
          cache.clearCache();
          cache.updateUpgrades(upgrades);

          const Generator = require('../src/generator');
          const wowPath = store.get('wowPath');
          Generator.generateUpgradeData(upgrades, wowPath);
          console.log(`Upgrade data generated: ${Object.keys(upgrades).length} recommendations for ${data.character}`);
          addDebugLog('sync', `Upgrade data generated: ${Object.keys(upgrades).length} recommendations for ${data.character}`);
        }
      }
    } catch (upgradeError) {
      console.warn('Upgrade recommendations fetch failed:', upgradeError.message);
      addDebugLog('warn', `Upgrade recommendations fetch failed: ${upgradeError.message}`);
    }

    if (tray) {
      tray.updateLastSync();
      tray.setStatus('connected');
    }
  } catch (error) {
    console.warn('SavedVariables handler error:', error.message);
    addDebugLog('error', `SavedVariables handler error: ${error.message}`);
  }
}

// Handle account-level SavedVariables updates (loot data)
async function handleLootDBUpdate(filePath, account) {
  try {
    if (!lootSync || !account) return;

    console.log(`Loot DB update detected for account: ${account}`);
    addDebugLog('info', `Loot DB update detected for account: ${account}`);
    if (tray) tray.setStatus('syncing');

    const result = await lootSync.syncFromFile(filePath, account);
    console.log(`Loot sync: ${result.synced} synced, ${result.skipped} unchanged`);
    addDebugLog('sync', `Loot sync complete: ${result.synced} synced, ${result.skipped} unchanged`, result);

    if (tray) {
      tray.updateLastSync();
      tray.setStatus('connected');
    }
  } catch (error) {
    console.warn('Loot sync failed (API may not be ready):', error.message);
    addDebugLog('error', `Loot sync failed: ${error.message}`);
    if (tray) tray.setStatus('connected'); // Don't show error state for expected failures
  }
}

// Manual sync triggered from tray
function handleSyncNow() {
  const wowPath = store.get('wowPath');
  if (wowPath) {
    addDebugLog('info', 'Manual sync triggered');
    // Reset circuit breaker so manual sync always tries the API
    if (api) api.resetBreaker();

    scanAndSyncCharacters(wowPath);

    // Also sync loot data
    if (lootSync) {
      lootSync.syncAll(wowPath).then(result => {
        console.log(`Manual loot sync: ${result.synced} synced, ${result.skipped} skipped`);
        addDebugLog('sync', `Manual loot sync: ${result.synced} synced, ${result.skipped} skipped`, result);
      }).catch(error => {
        console.error('Manual loot sync error:', error);
        addDebugLog('error', `Manual loot sync error: ${error.message}`);
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

// Show debug window
function showDebugWindow() {
  if (debugWindow) {
    debugWindow.focus();
    return;
  }

  debugWindow = new BrowserWindow({
    width: 800,
    height: 500,
    minWidth: 600,
    minHeight: 300,
    resizable: true,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  debugWindow.setMenuBarVisibility(false);
  debugWindow.loadFile(path.join(__dirname, '../ui/debug.html'));

  // F12 opens DevTools in a separate window
  debugWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      debugWindow.webContents.toggleDevTools({ mode: 'detach' });
      event.preventDefault();
    }
  });

  debugWindow.on('closed', () => {
    debugWindow = null;
  });
}

// IPC handlers for setup/settings windows
ipcMain.handle('get-config', () => {
  return {
    syncToken: store.get('syncToken'),
    wowPath: store.get('wowPath'),
    autoStart: store.get('autoStart'),
    syncIntervalMinutes: store.get('syncIntervalMinutes'),
    apiUrl: store.get('apiUrl') || '',
    isDev: !app.isPackaged
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
    store.set('apiUrl', config.apiUrl || '');
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
    const apiUrl = store.get('apiUrl') || '';
    const testApi = new API(token, apiUrl || undefined);
    const valid = await testApi.validateToken();
    return { valid, error: null, url: testApi.baseUrl };
  } catch (error) {
    return { valid: false, error: error.message };
  }
});

ipcMain.handle('get-debug-logs', () => {
  return debugLogs;
});

ipcMain.handle('clear-debug-logs', () => {
  debugLogs.length = 0;
  return { success: true };
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
