const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer process
let cachedVersion = null;
try { cachedVersion = require('../package.json').version; } catch {}

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => cachedVersion || ipcRenderer.invoke('get-app-version'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  detectWowPath: () => ipcRenderer.invoke('detect-wow-path'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  testToken: (token) => ipcRenderer.invoke('test-token', token),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  syncNow: () => ipcRenderer.invoke('sync-now'),
  openWowFolder: () => ipcRenderer.invoke('open-wow-folder'),
  openDebugLog: () => ipcRenderer.invoke('open-debug-log'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitApp: () => ipcRenderer.invoke('quit-app'),
  getDebugLogs: () => ipcRenderer.invoke('get-debug-logs'),
  clearDebugLogs: () => ipcRenderer.invoke('clear-debug-logs'),
  onDebugLog: (callback) => {
    ipcRenderer.on('debug-log', (event, entry) => callback(entry));
  },
  // Tray window
  getTrayState: () => ipcRenderer.invoke('tray-get-state'),
  trayAction: (action) => ipcRenderer.invoke('tray-action', action),
  onTrayUpdate: (callback) => {
    ipcRenderer.on('tray-update', (event, state) => callback(state));
  },
  resizeTray: (height) => ipcRenderer.invoke('tray-resize', height)
});
