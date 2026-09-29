// Data layer of the terminal app. It works on the same files the extension
// uses, so both stay in sync without VS Code running:
//  - VS Code's user settings.json — the profiles, the extension's settings and
//    `claudeCode.environmentVariables` (the VS Code extension's active env);
//  - ~/.claude/settings.json — the `env` the `claude` CLI reads;
//  - Codex's ~/.codex/config.toml — via src/agents/codex.js, shared with the
//    extension (the `codex` CLI and the Codex extension both read it);
//  - the shared key file (src/keyfile.js) — API keys, since VS Code's
//    SecretStorage can't be read from outside the editor.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const jsonc = require('./jsonc');
const { SELF, CLAUDE_SECTION, CLAUDE_KEY, MANAGED_ENV_KEYS, COLOR_CHOICES } = require('../src/constants');
const { readKeyFile, writeKeyFile, keyDir } = require('../src/keyfile');
const codex = require('../src/agents/codex');

const VSCODE_ENV_KEY = `${CLAUDE_SECTION}.${CLAUDE_KEY}`;

// ---- locating VS Code's settings.json ------------------------------------------

// User-data folders of VS Code and its common forks, most likely first.
const EDITOR_DIRS = ['Code', 'Code - Insiders', 'VSCodium', 'Cursor', 'Windsurf'];

function userDirFor(app) {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), app, 'User');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', app, 'User');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), app, 'User');
}

// Explicit path (--settings / CLAUDE_PROVIDERS_VSCODE_SETTINGS) wins. Otherwise
// prefer an editor whose settings already hold our profiles, then any editor's
// existing settings.json, then VS Code's default location.
function findVsCodeSettings(explicit) {
  if (explicit) return path.resolve(explicit);
  const candidates = EDITOR_DIRS.map((d) => path.join(userDirFor(d), 'settings.json'));
  const existing = candidates.filter((f) => fs.existsSync(f));
  const withProfiles = existing.find((f) => {
    try {
      return fs.readFileSync(f, 'utf8').includes(`"${SELF}.profiles"`);
    } catch {
      return false;
    }
  });
  return withProfiles || existing[0] || candidates[0];
}

// ~/.claude/settings.json — honours CLAUDE_CONFIG_DIR like the claude CLI does.
function claudeSettingsPath() {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(dir, 'settings.json');
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function envEqual(a, b) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => String(a[k]) === String(b[k]));
}
function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}

// ---- the store ----------------------------------------------------------------

class Store {
  constructor({ settingsPath } = {}) {
    this.settingsPath = findVsCodeSettings(settingsPath || process.env.CLAUDE_PROVIDERS_VSCODE_SETTINGS);
    this.claudePath = claudeSettingsPath();
    this.prefsPath = path.join(keyDir(), 'cli.json');
    this.reload();
  }

  // Re-read everything from disk (cheap; done before every screen so edits made
  // by a running VS Code show up).
  reload() {
    this.settingsError = null;
    try {
      this.settings = jsonc.parse(readText(this.settingsPath));
      if (!isPlainObject(this.settings)) this.settings = {};
    } catch (e) {
      this.settings = {};
      this.settingsError = e.message;
    }
    this.keys = readKeyFile();
    this.claudeError = null;
    try {
      const txt = readText(this.claudePath);
      this.claude = txt.trim() ? JSON.parse(txt) : {};
      if (!isPlainObject(this.claude)) this.claude = {};
    } catch (e) {
      this.claude = {};
      this.claudeError = e.message;
    }
    try {
      this.prefs = JSON.parse(readText(this.prefsPath) || '{}');
    } catch {
      this.prefs = {};
    }
  }

  // ---- VS Code settings ----

  get(key, def) {
    const v = this.settings[`${SELF}.${key}`];
    return v === undefined ? def : v;
  }

  // Write one top-level key into settings.json, preserving the rest of the file.
  // Re-reads the file first so a concurrent change by VS Code isn't clobbered.
  setSetting(fullKey, value) {
    if (this.settingsError) throw new Error(`${this.settingsPath}: ${this.settingsError}`);
    const text = jsonc.setProperty(readText(this.settingsPath), fullKey, value);
    writeText(this.settingsPath, text);
    this.settings = jsonc.parse(text);
  }
  set(key, value) {
    this.setSetting(`${SELF}.${key}`, value);
  }

  profiles() {
    const list = this.get('profiles', []);
    return Array.isArray(list) ? list.filter((p) => p && typeof p === 'object') : [];
  }
  // Every profile gets a stable id (links it to its key), as in the extension.
  saveProfiles(list) {
    for (const p of list) if (!p.id) p.id = crypto.randomUUID();
    this.set('profiles', list);
  }

  // ---- Codex ----

  codexProfiles() {
    const list = this.get('codexProfiles', []);
    return Array.isArray(list) ? list.filter((p) => p && typeof p === 'object') : [];
  }
  // Every profile gets an id (links it to its key). The config.toml key is set
  // once, when a profile is created (codex.assignKey) — never re-derived here,
  // or renaming / hand-edited profiles would lose track of the active one.
  saveCodexProfiles(list) {
    for (const p of list) if (!p.id) p.id = crypto.randomUUID();
    this.set('codexProfiles', list);
  }
  // A Codex profile's key: the shared key file, else the one config.toml holds
  // for it (only the active profile has one there).
  codexToken(p) {
    if (!p) return '';
    return (p.id && this.keys[p.id]) || codex.tokenInConfig(p);
  }
  codexActiveId() {
    try {
      return codex.activeId(this.codexProfiles());
    } catch {
      return null;
    }
  }
  // Write config.toml: `activate` = an id, null (back to the user's own
  // settings) or undefined (keep the active one, refresh the block). Throws a
  // CodexConfigError on conflicts.
  syncCodex(activate) {
    return codex.syncConfig({
      profiles: this.codexProfiles(),
      activate,
      tokenFor: (p) => (p.id && this.keys[p.id]) || '',
      keyStorage: codex.KEY_STORAGE_MODES.includes(this.get('codexKeyStorage')) ? this.get('codexKeyStorage') : 'file',
    });
  }

  // ---- terminal-app preferences ----

  pref(key, def) {
    return this.prefs[key] === undefined ? def : this.prefs[key];
  }
  setPref(key, value) {
    this.prefs[key] = value;
    fs.mkdirSync(path.dirname(this.prefsPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(this.prefsPath, JSON.stringify(this.prefs, null, 2) + '\n');
  }

  // ---- API keys ----

  // The key for a profile: the shared key file, else recovered from an env the
  // profile is currently applied to (VS Code's or the CLI's — they carry it).
  token(p) {
    if (!p) return '';
    if (p.id && this.keys[p.id]) return this.keys[p.id];
    for (const env of [this.vscodeEnv(), this.cliEnv()]) {
      if (env.ANTHROPIC_AUTH_TOKEN && this.matches(p, env, '')) return String(env.ANTHROPIC_AUTH_TOKEN);
    }
    return '';
  }
  hasStoredToken(p) {
    return !!(p && p.id && this.keys[p.id]);
  }
  setToken(id, value) {
    const keys = readKeyFile();
    const v = (value || '').trim();
    if (v) keys[id] = v;
    else delete keys[id];
    writeKeyFile(keys);
    this.keys = keys;
  }

  // ---- envs ----

  // The env applied for a profile — mirrors fullEnv() in src/profiles.js.
  fullEnv(p, token = this.token(p)) {
    const env = { ...((p && p.env) || {}) };
    if (token) env.ANTHROPIC_AUTH_TOKEN = token;
    if (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_DEFAULT_OPUS_MODEL && !env.ANTHROPIC_DEFAULT_FABLE_MODEL) {
      env.ANTHROPIC_DEFAULT_FABLE_MODEL = env.ANTHROPIC_DEFAULT_OPUS_MODEL;
    }
    return env;
  }

  // Keys the switcher owns in ~/.claude/settings.json: the dedicated ones plus
  // any free-form key some profile defines (mirrors managedEnvKeys()).
  managedKeys() {
    const set = new Set(MANAGED_ENV_KEYS);
    for (const p of this.profiles()) if (p.env) for (const k of Object.keys(p.env)) set.add(k);
    return set;
  }

  vscodeEnv() {
    const v = this.settings[VSCODE_ENV_KEY];
    return isPlainObject(v) ? v : {};
  }
  cliEnv() {
    return isPlainObject(this.claude.env) ? this.claude.env : {};
  }

  // Does profile `p` match `env`? Only the managed keys count (the CLI's env may
  // hold unrelated user keys). With an unknown token (`''`), the token is
  // ignored. Accepts the pre-Fable legacy shape, as isActiveProfile() does.
  matches(p, env, token = this.token(p)) {
    const want = this.fullEnv(p, token);
    const have = {};
    for (const k of this.managedKeys()) if (env[k] !== undefined && env[k] !== '') have[k] = env[k];
    if (!token) delete have.ANTHROPIC_AUTH_TOKEN;
    if (envEqual(want, have)) return true;
    if (want.ANTHROPIC_DEFAULT_FABLE_MODEL && !(p.env && p.env.ANTHROPIC_DEFAULT_FABLE_MODEL)) {
      delete want.ANTHROPIC_DEFAULT_FABLE_MODEL;
      return envEqual(want, have);
    }
    return false;
  }
  activeIndex(env) {
    return this.profiles().findIndex((p) => this.matches(p, env));
  }
  cliActiveIndex() {
    return this.activeIndex(this.cliEnv());
  }
  vscodeActiveIndex() {
    return this.activeIndex(this.vscodeEnv());
  }

  // Write the profile's env into ~/.claude/settings.json: clear every managed
  // key, set the new ones, keep everything else. Same as the extension's mirror.
  applyToCli(p) {
    if (this.claudeError) throw new Error(`${this.claudePath}: ${this.claudeError}`);
    const obj = this.claude;
    const env = { ...this.cliEnv() };
    for (const k of this.managedKeys()) delete env[k];
    Object.assign(env, this.fullEnv(p));
    obj.env = env;
    writeText(this.claudePath, JSON.stringify(obj, null, 2));
  }
  // Point the VS Code extension at the profile (claudeCode.environmentVariables);
  // a running VS Code picks the change up live.
  applyToVsCode(p) {
    this.setSetting(VSCODE_ENV_KEY, this.fullEnv(p));
  }

  // ---- helpers for new profiles ----

  newProfile(tpl) {
    const list = this.profiles();
    const env = JSON.parse(JSON.stringify(tpl.env || {}));
    const presetToken = env.ANTHROPIC_AUTH_TOKEN;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const p = {
      id: crypto.randomUUID(),
      name: uniqueName(tpl.name, list),
      color: firstFreeBadge(list),
      env,
    };
    const hk = firstFreeHotkey(list);
    if (hk) p.hotkey = hk;
    return { profile: p, presetToken };
  }
}

function uniqueName(base, profiles) {
  const used = new Set(profiles.map((p) => p.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

const BADGE_VALUES = COLOR_CHOICES.map((c) => c.value).filter(Boolean);
function firstFreeBadge(profiles, exclude = -1) {
  const used = new Set(profiles.filter((_, i) => i !== exclude).map((p) => p.color).filter(Boolean));
  return BADGE_VALUES.find((v) => !used.has(v)) || BADGE_VALUES[profiles.length % BADGE_VALUES.length];
}

// Hotkey slots Ctrl+Alt+1..9, 0 — the same set the extension offers.
const HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `Ctrl+Alt+${d}`);
function firstFreeHotkey(profiles, exclude = -1) {
  const used = new Set(profiles.filter((_, i) => i !== exclude).map((p) => p.hotkey).filter(Boolean));
  return HOTKEYS.find((h) => !used.has(h)) || '';
}

module.exports = { Store, HOTKEYS, uniqueName, firstFreeBadge };
