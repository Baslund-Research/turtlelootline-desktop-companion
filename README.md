# TurtleLootLine Desktop Companion

Desktop companion app for TurtleLootLine - syncs character gear from Turtle WoW to the web platform and provides upgrade recommendations in-game.

## Features

- 🔄 **Automatic Sync**: Watches SavedVariables and syncs gear changes automatically
- 📊 **Real-time Updates**: Updates within seconds of gear changes in-game
- 🎯 **Tray Icon**: Runs quietly in system tray with status indicators
- 🚀 **Auto-start**: Optional auto-start with system
- 💾 **Offline Cache**: Caches upgrade data locally for reliability
- 🔍 **Auto-detection**: Automatically finds WoW installation

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run in development mode:
   ```bash
   npm run dev
   ```

3. Build for production:
   ```bash
   npm run build        # Build for current platform
   npm run build:mac    # Build for macOS
   npm run build:win    # Build for Windows
   ```

## Setup

On first launch, you'll be prompted to:

1. Enter your TurtleLootLine sync token (get from website)
2. Select your World of Warcraft installation path
3. Configure auto-start preference

## How It Works

1. **Scans WTF Folder**: Discovers all characters from `WTF/Account/*/Realm/Character/SavedVariables`
2. **Watches for Changes**: Monitors `GearSync.lua` files for equipment updates
3. **Syncs to API**: Sends character data to TurtleLootLine API
4. **Fetches Upgrades**: Gets upgrade recommendations from API
5. **Generates Lua**: Creates `UpgradeData.lua` for the WoW addon to display

## Configuration

Config is stored in `~/.turtlelootline/config.json`:

```json
{
  "syncToken": "ttl_abc123...",
  "wowPath": "/path/to/wow",
  "autoStart": true,
  "syncIntervalMinutes": 5
}
```

## Development

### Project Structure

```
turtlelootline-companion/
├── electron/          # Main Electron process
│   ├── main.js       # App entry point
│   ├── preload.js    # Preload script
│   └── tray.js       # Tray icon management
├── src/              # Core logic
│   ├── scanner.js    # WTF folder scanner
│   ├── watcher.js    # File watcher
│   ├── parser.js     # Lua parser
│   ├── generator.js  # Lua generator
│   ├── api.js        # API client
│   └── cache.js      # Local cache
├── ui/               # UI windows
│   ├── setup.html    # First-time setup
│   └── settings.html # Settings window
└── assets/           # Icons and assets
```

### Testing

The app includes mock data generators for testing without a WoW installation:

```javascript
const Parser = require('./src/parser');
const mockData = Parser.generateMockData();

const API = require('./src/api');
const mockUpgrades = API.generateMockUpgrades([12640, 11726]);
```

## Requirements

- Node.js 16+
- Electron 28+
- World of Warcraft (Turtle WoW)
- GearSync addon installed in WoW

## License

MIT
