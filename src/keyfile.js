// The shared API-key file used by the terminal app (`claude-providers`).
// VS Code's SecretStorage is encrypted with the editor's own keychain entry, so
// nothing outside VS Code can read it. When `shareKeysWithTerminal` is on, the
// extension mirrors every profile's token into this file (and picks up keys the
// terminal app wrote there); the terminal app always reads/writes it. The file
// lives outside settings.json, is created with 0600 permissions, and maps
// profile id → token:  { "version": 1, "keys": { "<id>": "<token>" } }.
//
// Pure Node (no `vscode`), so the extension and the terminal app share it.

const fs = require('fs');
const os = require('os');
const path = require('path');

function keyDir() {
  return path.join(os.homedir(), '.claude-provider-switcher');
}
function keyFilePath() {
  return path.join(keyDir(), 'keys.json');
}

// id → token. A missing or unreadable file reads as empty.
function readKeyFile() {
  try {
    const j = JSON.parse(fs.readFileSync(keyFilePath(), 'utf8'));
    const keys = j && typeof j.keys === 'object' && !Array.isArray(j.keys) ? j.keys : {};
    const out = {};
    for (const [id, v] of Object.entries(keys)) if (typeof v === 'string' && v) out[id] = v;
    return out;
  } catch {
    return {};
  }
}

// Replace the whole map. Skips the write when nothing changed, so watchers on
// the other side don't ping-pong.
function writeKeyFile(keys) {
  const clean = {};
  for (const id of Object.keys(keys).sort()) if (keys[id]) clean[id] = keys[id];
  const text = JSON.stringify({ version: 1, keys: clean }, null, 2) + '\n';
  const file = keyFilePath();
  try {
    if (fs.readFileSync(file, 'utf8') === text) return false;
  } catch { /* doesn't exist yet */ }
  fs.mkdirSync(keyDir(), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, text, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* not supported (Windows) */ }
  return true;
}

module.exports = { keyDir, keyFilePath, readKeyFile, writeKeyFile };
