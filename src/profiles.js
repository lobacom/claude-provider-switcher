// Profile storage: the `profiles` setting (names, env, badges — everything but
// tokens) plus the secret-backed auth tokens that complement it.

const vscode = require('vscode');
const crypto = require('crypto');
const { SELF, CLAUDE_SECTION, CLAUDE_KEY, MANAGED_ENV_KEYS } = require('./constants');

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

// Every env key the extension may write — the dedicated keys plus any free-form
// (extra) keys any profile defines. Used by the CLI mirror to know which keys it
// owns (and may clear) in ~/.claude/settings.json, leaving the user's own
// hand-added keys there intact.
function managedEnvKeys() {
  const set = new Set(MANAGED_ENV_KEYS);
  for (const p of getProfiles()) {
    if (p.env) for (const k of Object.keys(p.env)) set.add(k);
  }
  return set;
}

// Tree items carry the profile's index as their `id`; commands may also get a
// bare number. Resolve either to an index (-1 = no usable argument).
function resolveIndex(arg) {
  if (typeof arg === 'number') return arg;
  if (arg && arg.id != null) return parseInt(arg.id, 10);
  return -1;
}

// Make `base` unique among existing names by appending 2, 3, … ("DeepSeek2").
function uniqueName(base, profiles) {
  const used = new Set(profiles.map((p) => p.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

// ---- secret-backed auth tokens --------------------------------------------
// API keys are never stored in `claudeProviderSwitcher.profiles` (which lives in
// settings.json, often synced or committed by accident). Instead each profile
// gets a stable `id` and its token lives in VS Code SecretStorage. We keep a
// synchronous in-memory cache (id → token) so the tree, status bar and
// active-profile matching can stay synchronous. The active provider's token is
// still written into `claudeCode.environmentVariables` when applied — that's
// unavoidable, since Claude Code reads it from there — but it's only ever the
// one active token, not the whole list.

let secretStorage;
let tokenCache = new Map(); // profile.id → token (string, '' when unset)

function initSecrets(secrets) {
  secretStorage = secrets;
}

function tokenKey(id) {
  return `${SELF}.token.${id}`;
}
function cachedToken(p) {
  return (p && p.id && tokenCache.get(p.id)) || '';
}
// The full env applied to Claude Code: the profile's stored env plus its secret
// token (if any). Used everywhere the pre-SecretStorage code used `p.env` directly.
function fullEnv(p) {
  const env = { ...((p && p.env) || {}) };
  const tk = cachedToken(p);
  if (tk) env.ANTHROPIC_AUTH_TOKEN = tk;
  return env;
}
async function setToken(id, value) {
  if (!secretStorage || !id) return;
  const v = (value || '').trim();
  if (v) {
    await secretStorage.store(tokenKey(id), v);
    tokenCache.set(id, v);
  } else {
    await secretStorage.delete(tokenKey(id));
    tokenCache.set(id, '');
  }
}
async function refreshTokenCache() {
  if (!secretStorage) return;
  const next = new Map();
  for (const p of getProfiles()) {
    if (p.id) next.set(p.id, (await secretStorage.get(tokenKey(p.id))) || '');
  }
  tokenCache = next;
}
// One-time migration: give every profile a stable id, and move any
// ANTHROPIC_AUTH_TOKEN out of the stored env into SecretStorage.
async function migrateProfiles() {
  if (!secretStorage) return;
  const draft = cloneProfiles();
  let changed = false;
  for (const p of draft) {
    if (!p.id) {
      p.id = crypto.randomUUID();
      changed = true;
    }
    if (p.env && p.env.ANTHROPIC_AUTH_TOKEN) {
      await setToken(p.id, p.env.ANTHROPIC_AUTH_TOKEN);
      delete p.env.ANTHROPIC_AUTH_TOKEN;
      changed = true;
    }
  }
  if (changed) await saveProfiles(draft);
}

function activeProfileIndex() {
  const cur = getActiveEnv();
  return getProfiles().findIndex((p) => envEqual(fullEnv(p), cur));
}

module.exports = {
  getProfiles,
  cloneProfiles,
  saveProfiles,
  getActiveEnv,
  envEqual,
  managedEnvKeys,
  resolveIndex,
  uniqueName,
  initSecrets,
  cachedToken,
  fullEnv,
  setToken,
  refreshTokenCache,
  migrateProfiles,
  activeProfileIndex,
};
