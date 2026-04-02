const { execSync } = require('child_process');
const p = require('../package.json');

const version = p.version;
const msg = `release v${version}`;

console.log(`Tagging and pushing: ${msg}`);

execSync(`git add -A && git commit -m "${msg}" && git tag v${version} && git push && git push --tags`, {
  stdio: 'inherit',
});
