const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

class TurtleLootLineTray {
  constructor(store, callbacks) {
    this.store = store;
    this.callbacks = callbacks;
    this.tray = null;
    this.status = 'disconnected'; // disconnected, connected, syncing, error
    this.lastSync = null;
    this.characters = [];

    this.createTray();
  }

  createTray() {
    // Create tray icon - use 16x16 tray-specific icon on Windows
    const trayIconPath = path.join(__dirname, '../assets/tray-icon.png');
    const iconPath = path.join(__dirname, '../assets/icon.png');
    let icon;

    try {
      // Try tray-specific icon first (16x16), then fall back to main icon
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

    this.updateMenu();
  }

  createFallbackIcon() {
    // Create a simple icon from a data URL (16x16 blue circle)
    // This is a base64-encoded PNG of a simple blue circle
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4wMCDDQJvXfU8wAAAKFJREFUOMvNk7ENwjAQRZ8FEhWpGIARWIERWIE1WIEOJmAENqCnYgJSUCFfZUNsSGQ7Eif9dHd//+/sn9nMzPqYAVNgDpyAM3ACzsAJ+AAH4Aj8gCOwBw7AAX4e8ALW8H3gBayAPfACVsAK2MO3Bzbw1bAFNvBtwRpYwbcGK2AF3wasgA18G7AEv4alsIC/BCWwgr8AJbCE/w0U4H8DBfh/QAH+A1AeV7s+J7iEAAAAAElFTkSuQmCC';
    return nativeImage.createFromDataURL(dataUrl);
  }

  setStatus(status) {
    this.status = status;
    this.updateMenu();
  }

  updateLastSync() {
    this.lastSync = Date.now();
    this.updateMenu();
  }

  updateCharacters(characters) {
    this.characters = characters;
    this.updateMenu();
  }

  getStatusIcon() {
    switch (this.status) {
      case 'connected':
        return '●'; // Green dot
      case 'syncing':
        return '↻'; // Refresh icon
      case 'error':
        return '✕'; // X icon
      default:
        return '○'; // Empty circle
    }
  }

  getStatusColor() {
    switch (this.status) {
      case 'connected':
        return '🟢';
      case 'syncing':
        return '🔄';
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  }

  getLastSyncText() {
    if (!this.lastSync) {
      return 'Never synced';
    }

    const now = Date.now();
    const diff = now - this.lastSync;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }

  updateMenu() {
    const statusIcon = this.getStatusColor();
    const lastSyncText = this.getLastSyncText();

    const menuTemplate = [
      {
        label: `TurtleLootLine ${statusIcon}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: '↻ Sync Now',
        click: this.callbacks.onSyncNow,
        enabled: this.status !== 'syncing'
      },
      {
        label: `Last sync: ${lastSyncText}`,
        enabled: false
      },
      { type: 'separator' }
    ];

    // Add characters submenu if we have characters
    if (this.characters.length > 0) {
      const charactersMenu = this.characters.map(char => ({
        label: `${char.name} (${char.realm})`,
        enabled: false
      }));

      menuTemplate.push({
        label: `Characters (${this.characters.length})`,
        submenu: charactersMenu
      });
      menuTemplate.push({ type: 'separator' });
    }

    // Settings and actions
    menuTemplate.push(
      {
        label: '🔧 Settings',
        click: this.callbacks.onOpenSettings
      },
      ...(this.callbacks.onOpenDebugLog ? [{
        label: '🪵 Debug Log',
        click: this.callbacks.onOpenDebugLog
      }] : []),
      {
        label: '📂 Open WoW Folder',
        click: this.callbacks.onOpenWowFolder
      },
      { type: 'separator' },
      {
        label: '✕ Quit',
        click: this.callbacks.onQuit
      }
    );

    const contextMenu = Menu.buildFromTemplate(menuTemplate);
    this.tray.setContextMenu(contextMenu);
  }

  destroy() {
    if (this.tray) {
      this.tray.destroy();
    }
  }
}

module.exports = TurtleLootLineTray;
