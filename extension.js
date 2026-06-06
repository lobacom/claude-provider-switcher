const vscode = require('vscode');

const SELF = 'claudeProviderSwitcher';
const CLAUDE_SECTION = 'claudeCode';
const CLAUDE_KEY = 'environmentVariables';
const KB_FILE = 'keybindings.json';

// ---- config helpers --------------------------------------------------------

function getProfiles() {
  const list = vscode.workspace.getConfiguration(SELF).get('profiles');
  return Array.isArray(list) ? list : [];
}
function cloneProfiles() {
  return JSON.parse(JSON.stringify(getProfiles()));
}
async function saveProfiles(list) {
  await vscode.workspace.getConfiguration(SELF).update('profiles', list, vscode.ConfigurationTarget.Global);
}
function getActiveEnv() {
  return vscode.workspace.getConfiguration(CLAUDE_SECTION).get(CLAUDE_KEY) || {};
}
function envEqual(a, b) {
  a = a || {};
  b = b || {};
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => String(a[k]) === String(b[k]));
}
function activeProfileIndex() {
  const cur = getActiveEnv();
  return getProfiles().findIndex((p) => envEqual(p.env || {}, cur));
}

// ---- apply / select --------------------------------------------------------

async function applyProfile(p) {
  if (!p) return;
  await vscode.workspace
    .getConfiguration(CLAUDE_SECTION)
    .update(CLAUDE_KEY, p.env || {}, vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(
    `Claude provider → ${p.name}. Restart the Claude Code session to apply.`,
    5000
  );
}

async function selectProfile() {
  const profiles = getProfiles();
  if (!profiles.length) {
    const add = 'Add provider';
    const r = await vscode.window.showInformationMessage('No providers configured yet.', add);
    if (r === add) vscode.commands.executeCommand(`${SELF}.add`);
    return;
  }
  const active = activeProfileIndex();
  const items = profiles.map((p, i) => {
    const env = p.env || {};
    const hk = p.hotkey ? `   ${p.hotkey}` : '';
    return {
      label: `${p.color ? p.color + ' ' : ''}${p.name}`,
      description:
        (i === active ? '● active   ' : '') +
        (env.ANTHROPIC_BASE_URL ? env.ANTHROPIC_BASE_URL : '(native subscription)'),
      detail: (p.hotkey ? `⌨ ${p.hotkey}` : 'no hotkey') + hk,
      _idx: i,
    };
  });
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select a Claude Code provider' });
  if (pick) await applyProfile(profiles[pick._idx]);
}

function switchToIndex(n) {
  const p = getProfiles()[n];
  if (p) applyProfile(p);
  else vscode.window.showInformationMessage(`Provider #${n + 1} is not defined.`);
}

// ---- CRUD ------------------------------------------------------------------

function resolveIndex(arg) {
  if (typeof arg === 'number') return arg;
  if (arg && arg.id != null) return parseInt(arg.id, 10);
  return -1;
}

const COLOR_CHOICES = [
  { label: '🟢  Green', value: '🟢' },
  { label: '🔵  Blue', value: '🔵' },
  { label: '🟣  Purple', value: '🟣' },
  { label: '🟡  Yellow', value: '🟡' },
  { label: '🟠  Orange', value: '🟠' },
  { label: '🔴  Red', value: '🔴' },
  { label: '⚪  White', value: '⚪' },
  { label: '🟤  Brown', value: '🟤' },
  { label: '⚫  Black', value: '⚫' },
  { label: '$(close)  None', value: '' },
];

// Hotkey choices — 10 slots (Ctrl+Alt+1..9, Ctrl+Alt+0).
const HOTKEY_PREFIXES = [
  { label: 'Ctrl+Alt', value: 'Ctrl+Alt' },
];
function hotkeyLabel(prefix, n) { // n 0..9  (display as 1..9, 0)
  const digit = n === 9 ? '0' : String(n + 1);
  return `${prefix}+${digit}`;
}
function buildHotkeyChoices() {
  const used = new Set(getProfiles().map((p) => p.hotkey).filter(Boolean));
  const out = [];
  for (const pref of HOTKEY_PREFIXES) {
    for (let n = 0; n < 10; n++) {
      const hk = hotkeyLabel(pref.value, n);
      out.push({ label: `$(keyboard) ${hk}`, value: hk, _free: !used.has(hk) });
    }
  }
  out.push({ label: '$(close) None', value: '', _free: true });
  return out;
}

const FIELDS = [
  { key: '__name', label: 'Name' },
  { key: '__color', label: 'Badge (color dot, optional)' },
  { key: '__hotkey', label: 'Hotkey (optional, auto-picks next free)' },
  { key: 'ANTHROPIC_BASE_URL', label: 'Base URL (empty = native subscription)' },
  { key: 'ANTHROPIC_AUTH_TOKEN', label: 'Auth token (API key)' },
  { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', label: 'Opus model' },
  { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', label: 'Sonnet model' },
  { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', label: 'Haiku model' },
  { key: 'API_TIMEOUT_MS', label: 'API timeout (ms, optional)' },
];

function fieldValue(p, key) {
  if (key === '__name') return p.name || '';
  if (key === '__color') return p.color || '';
  if (key === '__hotkey') return p.hotkey || '';
  return (p.env && p.env[key]) || '';
}

// Find the first slot (1..9, 0) for the given prefix that nobody else uses (excluding `excludeIndex`).
function firstFreeHotkey(profiles, excludeIndex, prefix) {
  const used = new Set(
    profiles
      .filter((_, i) => i !== excludeIndex)
      .map((p) => p.hotkey)
      .filter(Boolean)
  );
  for (const pref of HOTKEY_PREFIXES) {
    if (prefix && pref.value !== prefix) continue;
    for (let n = 0; n < 10; n++) {
      const hk = hotkeyLabel(pref.value, n);
      if (!used.has(hk)) return hk;
    }
  }
  return '';
}

async function editProfileFields(index) {
  for (;;) {
    const list = getProfiles();
    const p = list[index];
    if (!p) return;
    const items = FIELDS.map((f) => ({
      label: f.label,
      description: fieldValue(p, f.key) || '(empty)',
      _f: f,
    }));
    items.push({ label: '$(check) Done', _done: true });
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: `Editing "${p.name}" — pick a field, or Done`,
      ignoreFocusOut: true,
    });
    if (!pick || pick._done) return;

    const f = pick._f;
    let input;
    if (f.key === '__color') {
      const cur = fieldValue(p, f.key);
      const choices = COLOR_CHOICES.map((c) => ({
        label: c.label,
        description: c.value === cur ? '● current' : '',
        _value: c.value,
      }));
      const picked = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Pick a badge color (shown next to the name)',
        ignoreFocusOut: true,
      });
      if (!picked) continue;
      input = picked._value;
    } else if (f.key === '__hotkey') {
      const cur = fieldValue(p, f.key);
      const choices = buildHotkeyChoices()
        .filter((c) => c._free || c.value === cur) // only free, or current
        .map((c) => ({
          label: c.label,
          description:
            c.value === cur ? '● current' : c._free ? 'free' : 'in use',
          _value: c.value,
        }));
      const picked = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Pick a hotkey, or None to clear',
        ignoreFocusOut: true,
      });
      if (!picked) continue;
      input = picked._value;
    } else {
      input = await vscode.window.showInputBox({
        prompt: f.label,
        value: fieldValue(p, f.key),
        ignoreFocusOut: true,
      });
      if (input === undefined) continue;
    }

    const draft = cloneProfiles();
    const dp = draft[index];
    if (!dp) return;
    dp.env = dp.env || {};
    if (f.key === '__name') {
      if (input.trim()) dp.name = input.trim();
    } else if (f.key === '__color') {
      dp.color = input.trim();
    } else if (f.key === '__hotkey') {
      // empty string clears; otherwise validate it's one of the known slots
      if (input === '') {
        delete dp.hotkey;
      } else {
        const valid = buildHotkeyChoices().some((c) => c.value === input);
        if (valid) dp.hotkey = input;
      }
    } else if (input === '') {
      delete dp.env[f.key];
    } else {
      dp.env[f.key] = input;
    }
    await saveProfiles(draft);
  }
}

async function addProfile() {
  const name = await vscode.window.showInputBox({
    prompt: 'New provider name',
    placeHolder: 'e.g. My Gateway',
    ignoreFocusOut: true,
    validateInput: (v) => (v && v.trim() ? null : 'Name is required'),
  });
  if (!name) return;
  const draft = cloneProfiles();
  const newProfile = { name: name.trim(), color: '', env: {} };
  // auto-assign the next free hotkey
  newProfile.hotkey = firstFreeHotkey(draft, -1, null);
  draft.push(newProfile);
  await saveProfiles(draft);
  await editProfileFields(draft.length - 1);
}

async function editProfile(arg) {
  const i = resolveIndex(arg);
  if (i < 0) return;
  await editProfileFields(i);
}

async function deleteProfile(arg) {
  const i = resolveIndex(arg);
  const list = getProfiles();
  if (i < 0 || !list[i]) return;
  const ok = await vscode.window.showWarningMessage(
    `Delete provider "${list[i].name}"?`,
    { modal: true },
    'Delete'
  );
  if (ok !== 'Delete') return;
  const wasActive = envEqual(list[i].env || {}, getActiveEnv());
  const draft = cloneProfiles();
  draft.splice(i, 1);
  await saveProfiles(draft);
  if (wasActive) {
    if (draft.length) {
      await applyProfile(draft[0]);
    } else {
      await vscode.workspace
        .getConfiguration(CLAUDE_SECTION)
        .update(CLAUDE_KEY, {}, vscode.ConfigurationTarget.Global);
    }
  }
}

async function duplicateProfile(arg) {
  const i = resolveIndex(arg);
  const draft = cloneProfiles();
  if (i < 0 || !draft[i]) return;
  const copy = JSON.parse(JSON.stringify(draft[i]));
  copy.name = copy.name + ' copy';
  delete copy.hotkey; // don't duplicate the hotkey
  draft.splice(i + 1, 0, copy);
  await saveProfiles(draft);
}

async function moveProfile(arg, dir) {
  const i = resolveIndex(arg);
  const draft = cloneProfiles();
  const j = i + dir;
  if (i < 0 || !draft[i] || j < 0 || j >= draft.length) return;
  const tmp = draft[i];
  draft[i] = draft[j];
  draft[j] = tmp;
  await saveProfiles(draft);
}

// ---- dynamic keybindings ----------------------------------------------------
// We can't add user keybindings from an extension directly, but VS Code offers
// `vscode.commands.registerCommand` + the user can attach shortcuts via
// `keybindings.json`. To make this seamless we (a) own `claudeProviderSwitcher.*`
// commands and (b) read the per-profile `hotkey` field and write/remove
// `keybindings.json` entries automatically.

async function readKeybindingsFile() {
  // Try every existing keybindings.json
  const folders = vscode.workspace.workspaceFolders || [];
  const targets = [
    ...folders.map((f) => vscode.Uri.joinPath(f.uri, '.vscode', KB_FILE)),
    vscode.Uri.joinPath(vscode.Uri.file(require('os').homedir()), '.vscode', KB_FILE),
  ];
  for (const uri of targets) {
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      const text = Buffer.from(data).toString('utf8');
      let list = [];
      try { list = JSON.parse(text); } catch { list = []; }
      if (Array.isArray(list)) return { uri, list };
    } catch { /* not present */ }
  }
  return { uri: null, list: [] };
}

async function syncKeybindings() {
  // Build the desired map: hotkey string -> profile index.
  const profiles = getProfiles();
  const desired = new Map();
  profiles.forEach((p, i) => { if (p.hotkey) desired.set(p.hotkey, i); });

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
  const kept = userList.filter((e) => !(e && e.command && e.command.startsWith(`${SELF}.switchToIndex`)));
  for (const [hk, idx] of desired) {
    kept.push({ key: hk.toLowerCase(), command: `${SELF}.switchToIndex`, args: idx });
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

// ---- status bar ------------------------------------------------------------

let statusItem;
function updateStatus() {
  if (!statusItem) return;
  const profiles = getProfiles();
  if (vscode.workspace.getConfiguration(SELF).get('showStatusBarItem') === false || profiles.length === 0) {
    statusItem.hide();
    return;
  }
  const idx = activeProfileIndex();
  if (idx >= 0) {
    const p = profiles[idx];
    statusItem.text = `$(plug) ${p.color ? p.color + ' ' : ''}${p.name}`;
  } else {
    const base = getActiveEnv().ANTHROPIC_BASE_URL;
    statusItem.text = `$(plug) ${base ? base : 'Claude (default)'}`;
  }
  statusItem.tooltip = 'Claude provider — click to switch';
  statusItem.show();
}

// ---- tree view -------------------------------------------------------------

class ProfilesProvider {
  constructor() {
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._emitter.event;
  }
  refresh() { this._emitter.fire(); }
  getTreeItem(item) { return item; }
  getChildren() {
    const profiles = getProfiles();
    const active = activeProfileIndex();
    return profiles.map((p, i) => {
      const env = p.env || {};
      const it = new vscode.TreeItem(`${p.color ? p.color + ' ' : ''}${p.name}`);
      it.id = String(i);
      it.contextValue = 'claudeProfile';
      it.description =
        (i === active ? '● ' : '') + (env.ANTHROPIC_BASE_URL || 'native subscription');
      it.iconPath = new vscode.ThemeIcon(i === active ? 'pass-filled' : 'circle-large-outline');
      const tip = [p.name];
      if (p.hotkey) tip.push('Hotkey: ' + p.hotkey);
      tip.push('Base URL: ' + (env.ANTHROPIC_BASE_URL || '(native subscription)'));
      if (env.ANTHROPIC_DEFAULT_OPUS_MODEL) tip.push('opus → ' + env.ANTHROPIC_DEFAULT_OPUS_MODEL);
      if (env.ANTHROPIC_DEFAULT_SONNET_MODEL) tip.push('sonnet → ' + env.ANTHROPIC_DEFAULT_SONNET_MODEL);
      if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL) tip.push('haiku → ' + env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
      it.tooltip = tip.join('\n');
      return it;
    });
  }
}

// ---- activate --------------------------------------------------------------

function activate(context) {
  const provider = new ProfilesProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(`${SELF}.view`, provider)
  );

  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = `${SELF}.select`;
  context.subscriptions.push(statusItem);

  const reg = (name, fn) =>
    context.subscriptions.push(vscode.commands.registerCommand(`${SELF}.${name}`, fn));

  reg('select', selectProfile);
  reg('add', addProfile);
  reg('edit', editProfile);
  reg('delete', deleteProfile);
  reg('duplicate', duplicateProfile);
  reg('moveUp', (arg) => moveProfile(arg, -1));
  reg('moveDown', (arg) => moveProfile(arg, 1));
  reg('switchTo', (arg) => {
    const i = resolveIndex(arg);
    if (i >= 0) applyProfile(getProfiles()[i]);
  });
  reg('switchToIndex', (idx) => switchToIndex(typeof idx === 'number' ? idx : parseInt(idx, 10)));
  reg('refresh', () => {
    provider.refresh();
    updateStatus();
  });

  // initial sync
  syncKeybindings().then(() => vscode.window.setStatusBarMessage('Claude provider hotkeys synced', 2500));

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration(`${CLAUDE_SECTION}.${CLAUDE_KEY}`) ||
        e.affectsConfiguration(`${SELF}.profiles`) ||
        e.affectsConfiguration(`${SELF}.showStatusBarItem`)
      ) {
        provider.refresh();
        updateStatus();
        if (e.affectsConfiguration(`${SELF}.profiles`)) {
          syncKeybindings();
        }
      }
    })
  );

  updateStatus();
}

function deactivate() {}

module.exports = { activate, deactivate };