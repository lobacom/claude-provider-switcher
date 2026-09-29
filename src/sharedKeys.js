// Opt-in sharing of API keys with the terminal app (`claude-providers`), gated
// by `shareKeysWithTerminal`. SecretStorage stays the extension's source of
// truth; the shared key file (keyfile.js) is a mirror the terminal app can read.
// Both sides write the file on every key change, so its contents are always the
// latest edit from either side — on import the file wins.

const vscode = require('vscode');
const { SELF } = require('./constants');
const { getProfiles, cachedToken, setToken, isActiveProfile } = require('./profiles');
const { keyDir, readKeyFile, writeKeyFile } = require('./keyfile');

function shareKeysEnabled() {
  return vscode.workspace.getConfiguration(SELF).get('shareKeysWithTerminal') === true;
}

// Write every profile's cached token into the key file (profiles without one,
// and ids that no longer exist, are dropped).
function exportSharedKeys() {
  if (!shareKeysEnabled()) return;
  const keys = {};
  for (const p of getProfiles()) if (p.id && cachedToken(p)) keys[p.id] = cachedToken(p);
  try {
    writeKeyFile(keys);
  } catch (e) {
    console.warn('claude-provider-switcher: could not write the shared key file —', e.message);
  }
}

// Pull keys from the file into SecretStorage, then write the merged set back.
// `preferFile` = the file is newer (the terminal app changed it); otherwise
// (sharing just got turned on) only fill in profiles that have no key yet.
// Returns true when a key changed. If the live provider's key changed, it's
// re-applied via `reapply` so the active match in the tree doesn't break.
async function syncSharedKeys({ preferFile, reapply } = {}) {
  if (!shareKeysEnabled()) return false;
  const file = readKeyFile();
  let changed = false;
  for (const p of getProfiles()) {
    const fromFile = p.id && file[p.id];
    if (!fromFile || fromFile === cachedToken(p)) continue;
    if (!preferFile && cachedToken(p)) continue;
    const wasActive = isActiveProfile(p);
    await setToken(p.id, fromFile);
    changed = true;
    if (wasActive && reapply) await reapply(p);
  }
  exportSharedKeys();
  return changed;
}

// Watch the key file for edits made by the terminal app.
function watchSharedKeys(onChange) {
  const w = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(keyDir()), 'keys.json')
  );
  w.onDidChange(onChange);
  w.onDidCreate(onChange);
  return w;
}

module.exports = { shareKeysEnabled, exportSharedKeys, syncSharedKeys, watchSharedKeys };
