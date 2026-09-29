// Dynamic keybindings. We can't add user keybindings from an extension directly,
// but VS Code reads them from the User keybindings.json. To make per-profile
// hotkeys seamless we (a) own the `claudeProviderSwitcher.switchToIndex` command
// and (b) read each profile's `hotkey` field and write/remove the matching
// keybindings.json entries automatically.

const vscode = require('vscode');
const { SELF } = require('./constants');
const { getProfiles, getCodexProfiles } = require('./profiles');

const KB_FILE = 'keybindings.json';

async function syncKeybindings() {
  // Build the desired map: hotkey string -> profile index.
  const profiles = getProfiles();
  const desired = new Map();
  profiles.forEach((p, i) => { if (p.hotkey) desired.set(p.hotkey, i); });
  // Codex profiles have their own slots (Ctrl+Shift+Alt+…) and command.
  const codexDesired = new Map();
  getCodexProfiles().forEach((p, i) => { if (p.hotkey) codexDesired.set(p.hotkey, i); });

  // Resolve the User keybindings.json location.
  // On Windows VS Code stores it under %APPDATA%\Code\User\keybindings.json;
  // on macOS / Linux under ~/.config/Code/User/keybindings.json.
  let userDir;
  if (process.platform === 'win32') {
    userDir = vscode.Uri.file(process.env.APPDATA + '\\Code\\User');
  } else if (process.platform === 'darwin') {
    userDir = vscode.Uri.file(require('os').homedir() + '/Library/Application Support/Code/User');
  } else {
    userDir = vscode.Uri.file(require('os').homedir() + '/.config/Code/User');
  }
  const userUri = vscode.Uri.joinPath(userDir, KB_FILE);

  let userList = [];
  let oldUserText = '';
  try {
    const data = await vscode.workspace.fs.readFile(userUri);
    oldUserText = Buffer.from(data).toString('utf8');
    userList = JSON.parse(oldUserText || '[]');
  } catch { /* file doesn't exist yet */ }
  if (!Array.isArray(userList)) userList = [];

  // Remove our managed entries, keep the rest of the user's file intact.
  const managed = [`${SELF}.switchToIndex`, `${SELF}.switchCodexToIndex`];
  const kept = userList.filter((e) => !(e && e.command && managed.includes(e.command)));
  for (const [hk, idx] of desired) {
    kept.push({ key: hk.toLowerCase(), command: `${SELF}.switchToIndex`, args: idx });
  }
  for (const [hk, idx] of codexDesired) {
    kept.push({ key: hk.toLowerCase(), command: `${SELF}.switchCodexToIndex`, args: idx });
  }
  const newUserText = JSON.stringify(kept, null, 4);
  if (newUserText !== oldUserText) {
    // Ensure the directory exists.
    try { await vscode.workspace.fs.createDirectory(userDir); } catch { /* already exists */ }
    await vscode.workspace.fs.writeFile(userUri, Buffer.from(newUserText, 'utf8'));
    return true;
  }
  return false;
}

module.exports = { syncKeybindings };
