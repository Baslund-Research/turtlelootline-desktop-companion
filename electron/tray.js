const { Tray, Menu, nativeImage, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

class TurtleLootLineTray {
  constructor(store, callbacks) {
    this.store = store;
    this.callbacks = callbacks;
    this.tray = null;
    this.trayWindow = null;
    this.status = 'disconnected';
    this.lastSync = null;
    this.characters = [];

    this.createTray();
    this.registerIPC();
  }

  createTray() {
    const trayIconPath = path.join(__dirname, '../assets/tray-icon.png');
    const iconPath = path.join(__dirname, '../assets/icon.png');
    let icon;

    try {
      icon = nativeImage.createFromPath(trayIconPath);
      if (icon.isEmpty()) {
        icon = nativeImage.createFromPath(iconPath);
      }
      if (icon.isEmpty()) {
        icon = this.createFallbackIcon();
      }
    } catch (error) {
      icon = this.createFallbackIcon();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip('TurtleLootLine Companion');

    // On macOS, both click and right-click should show our custom popup
    this.tray.on('click', (event, bounds) => {
      this.toggleTrayWindow(bounds);
    });

    this.tray.on('right-click', (event, bounds) => {
      this.toggleTrayWindow(bounds);
    });
  }

  createFallbackIcon() {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4wMCDDQJvXfU8wAAAKFJREFUOMvNk7ENwjAQRZ8FEhWpGIARWIERWIE1WIEOJmAENqCnYgJSUCFfZUNsSGQ7Eif9dHd//+/sn9nMzPqYAVNgDpyAM3ACzsAJ+AAH4Aj8gCOwBw7AAX4e8ALW8H3gBayAPfACVsAK2MO3Bzbw1bAFNvBtwRpYwbcGK2AF3wasgA18G7AEv4alsIC/BCWwgr8AJbCE/w0U4H8DBfh/QAH+A1AeV7s+J7iEAAAAAElFTkSuQmCC';
    return nativeImage.createFromDataURL(dataUrl);
  }

  registerIPC() {
    ipcMain.handle('tray-get-state', () => ({
      status: this.status,
      lastSync: this.lastSync,
      characters: this.characters.map(c => ({
        name: c.name,
        realm: c.realm,
        class: c.class || null,
        level: c.level || null,
        syncedId: c.syncedId || null
      }))
    }));

    ipcMain.handle('tray-resize', (event, height) => {
      if (this.trayWindow && !this.trayWindow.isDestroyed()) {
        const bounds = this.trayWindow.getBounds();
        this.trayWindow.setBounds({ x: bounds.x, y: bounds.y, width: 296, height: Math.min(height + 20, 700) });
      }
    });

    ipcMain.handle('tray-action', (event, action) => {
      if (action === 'sync') {
        // Don't close — let the tray show sync feedback
        this.callbacks.onSyncNow();
        return;
      }
      if (typeof action === 'object' && action.type === 'open-character') {
        this.hideTrayWindow();
        const { shell } = require('electron');
        const apiUrl = this.store.get('apiUrl') || 'https://turtlelootline.com';
        const baseUrl = apiUrl || 'https://turtlelootline.com';
        shell.openExternal(`${baseUrl}/?synced=${action.id}`);
        return;
      }
      this.hideTrayWindow();
      switch (action) {
        case 'settings': this.callbacks.onOpenSettings(); break;
        case 'wow-folder': this.callbacks.onOpenWowFolder(); break;
        case 'debug-log': if (this.callbacks.onOpenDebugLog) this.callbacks.onOpenDebugLog(); break;
        case 'quit': this.callbacks.onQuit(); break;
      }
    });
  }

  createTrayWindow() {
    this.trayWindow = new BrowserWindow({
      width: 296,
      height: 580,
      show: false,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    this.trayWindow.loadFile(path.join(__dirname, '../ui/tray.html'));

    this.trayWindow.on('blur', () => {
      this.hideTrayWindow();
    });

    this.trayWindow.on('closed', () => {
      this.trayWindow = null;
    });
  }

  toggleTrayWindow(bounds) {
    if (this.trayWindow && this.trayWindow.isVisible()) {
      this.hideTrayWindow();
      return;
    }

    if (!this.trayWindow) {
      this.createTrayWindow();
    }

    // Position window below the tray icon
    const { x, y, width, height } = bounds || this.tray.getBounds();
    const windowBounds = this.trayWindow.getBounds();

    let xPos = Math.round(x + width / 2 - windowBounds.width / 2);
    let yPos;

    if (process.platform === 'darwin') {
      // macOS: tray is at top, window goes below
      yPos = y + height + 4;
    } else {
      // Windows/Linux: tray is at bottom, window goes above
      yPos = y - windowBounds.height - 4;
    }

    // Keep on screen
    const display = screen.getDisplayNearestPoint({ x: xPos, y: yPos });
    const screenBounds = display.workArea;
    if (xPos + windowBounds.width > screenBounds.x + screenBounds.width) {
      xPos = screenBounds.x + screenBounds.width - windowBounds.width;
    }
    if (xPos < screenBounds.x) xPos = screenBounds.x;

    this.trayWindow.setPosition(xPos, yPos);
    this.trayWindow.show();
    this.trayWindow.focus();

    // Send fresh state to the window
    this.trayWindow.webContents.send('tray-update', {
      status: this.status,
      lastSync: this.lastSync,
      characters: this.characters.map(c => ({
        name: c.name,
        realm: c.realm,
        class: c.class || null,
        level: c.level || null,
        syncedId: c.syncedId || null
      }))
    });
  }

  hideTrayWindow() {
    if (this.trayWindow && !this.trayWindow.isDestroyed()) {
      this.trayWindow.hide();
    }
  }

  setStatus(status) {
    this.status = status;
  }

  updateLastSync() {
    this.lastSync = Date.now();
  }

  updateCharacters(characters) {
    this.characters = characters;
  }

  getLastSyncText() {
    if (!this.lastSync) return 'Never synced';
    const diff = Date.now() - this.lastSync;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  destroy() {
    if (this.trayWindow) {
      this.trayWindow.destroy();
      this.trayWindow = null;
    }
    if (this.tray) {
      this.tray.destroy();
    }
  }
}

module.exports = TurtleLootLineTray;
