const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  detectWowPath: () => ipcRenderer.invoke('detect-wow-path'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  testToken: (token) => ipcRenderer.invoke('test-token', token),
  getSyncStatus: () => ipcRenderer.invoke('get-sync-status'),
  getDebugLogs: () => ipcRenderer.invoke('get-debug-logs'),
  clearDebugLogs: () => ipcRenderer.invoke('clear-debug-logs'),
  onDebugLog: (callback) => {
    ipcRenderer.on('debug-log', (event, entry) => callback(entry));
  }
});
