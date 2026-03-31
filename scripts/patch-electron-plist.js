const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Only patch on macOS
if (process.platform !== 'darwin') process.exit(0);

const plistPath = path.join(
  __dirname, '..', 'node_modules', 'electron', 'dist',
  'Electron.app', 'Contents', 'Info.plist'
);

if (!fs.existsSync(plistPath)) process.exit(0);

const appName = 'TurtleLootLine Companion';

try {
  execSync(`plutil -replace CFBundleDisplayName -string "${appName}" "${plistPath}"`);
  execSync(`plutil -replace CFBundleName -string "${appName}" "${plistPath}"`);
  console.log(`Patched Electron plist with app name: ${appName}`);
} catch (e) {
  console.warn('Could not patch Electron plist:', e.message);
}
