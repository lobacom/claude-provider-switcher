const vscode = require('vscode');
const crypto = require('crypto');

const SELF = 'claudeProviderSwitcher';
const CLAUDE_SECTION = 'claudeCode';
const CLAUDE_KEY = 'environmentVariables';
const KB_FILE = 'keybindings.json';
const PIN_KEY = `${SELF}.pinnedProfileId`; // workspaceState: profile pinned to this workspace

// ---- provider templates ----------------------------------------------------
// Shown in the "Add provider" menu so the user doesn't have to hunt down each
// provider's Anthropic-compatible endpoint. `env` carries the known-good defaults
// (Base URL and, for providers with fixed model names, the tier→model mapping).
// The auth token is never bundled — the user adds it afterwards, and every field
// stays editable in the profile editor. Endpoints are stable; model names change
// more often, so treat the model defaults as a starting point.

const CLAUDE_API_URL = 'https://api.anthropic.com';

// Each entry's `icon` names a PNG under media/providers/ (provider logo).
// Aggregators (Fireworks, Novita, OpenRouter, …) host many models, so we ship
// only the Base URL and let the user pick the model (full slug); single-model
// providers also get a sensible tier→model mapping.
// Listed alphabetically (case-insensitive); the menu shows them in this order.
const PROVIDER_PRESETS = [
  {
    name: 'DeepInfra',
    icon: 'deepinfra.png',
    env: { ANTHROPIC_BASE_URL: 'https://api.deepinfra.com/anthropic' },
  },
  {
    name: 'DeepSeek',
    icon: 'deepseek.png',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'deepseek-v4-pro',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'deepseek-v4-flash',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'deepseek-v4-flash',
    },
  },
  {
    name: 'Fireworks AI',
    icon: 'fireworks.png',
    env: { ANTHROPIC_BASE_URL: 'https://api.fireworks.ai/inference' },
  },
  {
    name: 'Kimi (Moonshot)',
    icon: 'moonshot.png',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.moonshot.ai/anthropic',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'kimi-k2.5',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'kimi-k2.5',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'kimi-k2.5',
    },
  },
  {
    name: 'MiniMax',
    icon: 'minimax.png',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M3',
    },
  },
  {
    name: 'MiniMax (China)',
    icon: 'minimax.png',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.minimaxi.com/anthropic',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'MiniMax-M3',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'MiniMax-M3',
    },
  },
  {
    name: 'ModelScope',
    icon: 'modelscope.png',
    env: { ANTHROPIC_BASE_URL: 'https://api-inference.modelscope.cn' },
  },
  {
    name: 'Novita',
    icon: 'novita.png',
    env: { ANTHROPIC_BASE_URL: 'https://api.novita.ai/anthropic' },
  },
  {
    name: 'OpenRouter',
    icon: 'openrouter.png',
    env: { ANTHROPIC_BASE_URL: 'https://openrouter.ai/api' },
  },
  {
    // Routes to the official Anthropic bots, so the native claude-* names work.
    name: 'Poe',
    icon: 'poe.png',
    env: { ANTHROPIC_BASE_URL: 'https://api.poe.com' },
  },
  {
    name: 'Qwen (Alibaba)',
    icon: 'qwen.png',
    env: {
      ANTHROPIC_BASE_URL: 'https://dashscope-intl.aliyuncs.com/apps/anthropic',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'qwen3-max',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'qwen3-coder-plus',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'qwen3.5-flash',
    },
  },
  {
    name: 'SiliconFlow',
    icon: 'siliconflow.png',
    env: { ANTHROPIC_BASE_URL: 'https://api.siliconflow.com' },
  },
  {
    name: 'Vercel AI Gateway',
    icon: 'vercel.png',
    env: { ANTHROPIC_BASE_URL: 'https://ai-gateway.vercel.sh' },
  },
  {
    name: 'Z.ai (GLM)',
    icon: 'zai.png',
    env: {
      ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.1',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.7',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.5-air',
    },
  },
  {
    name: 'Zhipu GLM (China)',
    icon: 'zhipu.png',
    env: {
      ANTHROPIC_BASE_URL: 'https://open.bigmodel.cn/api/anthropic',
      ANTHROPIC_DEFAULT_OPUS_MODEL: 'glm-5.1',
      ANTHROPIC_DEFAULT_SONNET_MODEL: 'glm-4.7',
      ANTHROPIC_DEFAULT_HAIKU_MODEL: 'glm-4.5-air',
    },
  },
];

// Local servers with a native Anthropic-compatible /v1/messages endpoint and a
// well-known default port. The token is a throwaway placeholder (these ignore it,
// but Claude Code needs a non-empty one); set your loaded model id after picking.
const LOCAL_PRESETS = [
  {
    // llama-server; tool use needs the server started with --jinja.
    name: 'llama.cpp',
    icon: 'server', // codicon — no brand logo
    env: { ANTHROPIC_BASE_URL: 'http://localhost:8080', ANTHROPIC_AUTH_TOKEN: 'local' },
  },
  {
    name: 'LM Studio',
    icon: 'lmstudio.png',
    env: { ANTHROPIC_BASE_URL: 'http://localhost:1234', ANTHROPIC_AUTH_TOKEN: 'lmstudio' },
  },
  {
    name: 'Ollama',
    icon: 'ollama.png',
    env: { ANTHROPIC_BASE_URL: 'http://localhost:11434', ANTHROPIC_AUTH_TOKEN: 'local' },
  },
  {
    name: 'vLLM',
    icon: 'vllm.png',
    env: { ANTHROPIC_BASE_URL: 'http://localhost:8000', ANTHROPIC_AUTH_TOKEN: 'local' },
  },
];

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
let workspaceState; // context.workspaceState — holds this workspace's pinned profile id
let tokenCache = new Map(); // profile.id → token (string, '' when unset)
const healthCache = new Map(); // profile.id → 'ok' | 'down' (absent = unknown/not checked)
let healthTimer; // setInterval handle when health check mode is 'periodic'

function tokenKey(id) {
  return `${SELF}.token.${id}`;
}
function cachedToken(p) {
  return (p && p.id && tokenCache.get(p.id)) || '';
}
// The full env applied to Claude Code: the profile's stored env plus its secret
// token (if any). Used everywhere the previous code used `p.env` directly.
function fullEnv(p) {
  const env = { ...((p && p.env) || {}) };
  const t = cachedToken(p);
  if (t) env.ANTHROPIC_AUTH_TOKEN = t;
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

// ---- apply / select --------------------------------------------------------

async function applyProfile(p) {
  if (!p) return;
  await vscode.workspace
    .getConfiguration(CLAUDE_SECTION)
    .update(CLAUDE_KEY, fullEnv(p), vscode.ConfigurationTarget.Global);
  vscode.window.setStatusBarMessage(
    `Claude provider → ${p.name}. Restart the Claude Code session to apply.`,
    5000
  );
}

// User-initiated switch. When `autoFallbackOnApply` is on it probes the target
// and walks its fallback chain; otherwise it applies the profile directly.
function switchProfile(p) {
  if (!p) return;
  if (vscode.workspace.getConfiguration(SELF).get('autoFallbackOnApply') === true) {
    return applyProfileWithFallback(p);
  }
  return applyProfile(p);
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
    return {
      label: `${badgeTextPrefix(p.color)}${p.name}`,
      description:
        (i === active ? '● active   ' : '') +
        (env.ANTHROPIC_BASE_URL ? env.ANTHROPIC_BASE_URL : '(native subscription)'),
      detail: p.hotkey ? `⌨ ${p.hotkey}` : 'no hotkey',
      _idx: i,
    };
  });
  const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select a Claude Code provider' });
  if (pick) await switchProfile(profiles[pick._idx]);
}

function switchToIndex(n) {
  const p = getProfiles()[n];
  if (p) switchProfile(p);
  else vscode.window.showInformationMessage(`Provider #${n + 1} is not defined.`);
}

// Cycle to the next (dir=1) or previous (dir=-1) provider, wrapping around.
// With nothing active yet, dir=1 lands on the first profile, dir=-1 on the last.
function cycleProfile(dir) {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage('No providers configured yet.');
    return;
  }
  const cur = activeProfileIndex();
  const start = cur < 0 ? (dir > 0 ? -1 : 0) : cur;
  const next = (start + dir + profiles.length) % profiles.length;
  switchProfile(profiles[next]);
}

// ---- workspace pinning -----------------------------------------------------
// A workspace can pin one provider; when that workspace is (re)opened the
// extension auto-switches to it. The mapping lives in workspaceState (a VS Code
// Memento scoped to the workspace) so it never touches settings.json or the
// repo. Honoring the pin on open is gated by `applyPinnedOnOpen` (default true).

function getPinnedId() {
  return workspaceState ? workspaceState.get(PIN_KEY) : undefined;
}
async function setPinnedId(id) {
  if (workspaceState) await workspaceState.update(PIN_KEY, id || undefined);
}
function hasWorkspace() {
  const f = vscode.workspace.workspaceFolders;
  return !!(f && f.length);
}

// On open: if this workspace pins a provider that still exists and isn't already
// active, switch to it. Silent no-op otherwise.
async function applyPinnedProfile() {
  if (!workspaceState || !hasWorkspace()) return;
  if (vscode.workspace.getConfiguration(SELF).get('applyPinnedOnOpen') === false) return;
  const id = getPinnedId();
  if (!id) return;
  const p = getProfiles().find((x) => x.id === id);
  if (!p) return; // pinned profile was deleted
  if (envEqual(fullEnv(p), getActiveEnv())) return; // already active
  await switchProfile(p);
}

// Pin (or unpin) a provider for the current workspace. `arg` may be a tree item
// (right-click) — then pin that profile directly; otherwise prompt.
async function pinToWorkspace(arg) {
  if (!workspaceState) return;
  if (!hasWorkspace()) {
    vscode.window.showInformationMessage(
      'Open a folder or workspace first — there is nothing to pin a provider to.'
    );
    return;
  }
  const profiles = getProfiles();
  const pinned = getPinnedId();
  const folderName = vscode.workspace.workspaceFolders[0].name;

  let chosen; // { id } | { unpin: true } | undefined (cancelled)
  const i = resolveIndex(arg);
  if (i >= 0 && profiles[i]) {
    chosen = { id: profiles[i].id };
  } else {
    const items = [
      {
        label: '$(circle-slash) Don’t auto-switch (unpin)',
        description: pinned ? '' : '● current',
        _unpin: true,
      },
      { label: 'Providers', kind: vscode.QuickPickItemKind.Separator },
      ...profiles.map((p) => ({
        label: `${badgeTextPrefix(p.color)}${p.name}`,
        description:
          (p.id === pinned ? '● pinned   ' : '') +
          ((p.env && p.env.ANTHROPIC_BASE_URL) || '(native subscription)'),
        _id: p.id,
      })),
    ];
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: `Auto-switch to which provider when "${folderName}" opens?`,
      ignoreFocusOut: true,
    });
    if (!pick) return;
    chosen = pick._unpin ? { unpin: true } : { id: pick._id };
  }

  if (chosen.unpin) {
    await setPinnedId(undefined);
    vscode.window.showInformationMessage(`Provider unpinned from "${folderName}".`);
  } else {
    await setPinnedId(chosen.id);
    const p = profiles.find((x) => x.id === chosen.id);
    if (p) await applyProfile(p);
    vscode.window.showInformationMessage(
      `"${p ? p.name : 'Provider'}" pinned to "${folderName}" — it will auto-apply on open.`
    );
  }
  vscode.commands.executeCommand(`${SELF}.refresh`);
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
  { label: '🟩  Green square', value: '🟩' },
  { label: '🟦  Blue square', value: '🟦' },
  { label: '🟪  Purple square', value: '🟪' },
  { label: '🟨  Yellow square', value: '🟨' },
  { label: '🟧  Orange square', value: '🟧' },
  { label: '🟥  Red square', value: '🟥' },
  { label: '⬜  White square', value: '⬜' },
  { label: '🟫  Brown square', value: '🟫' },
  { label: '⬛  Black square', value: '⬛' },
  { label: '🔷  Blue diamond', value: '🔷' },
  { label: '🔶  Orange diamond', value: '🔶' },
  { label: '$(close)  None', value: '' },
];

// All badge values in pick order (everything except the "None" entry).
const BADGE_VALUES = COLOR_CHOICES.map((c) => c.value).filter(Boolean);

// First badge not used by any other profile, so auto-assigned badges stay distinct.
// Falls back to spreading across the palette once every badge is taken.
function firstFreeBadge(profiles, excludeIndex) {
  const used = new Set(
    profiles
      .filter((_, i) => i !== excludeIndex)
      .map((p) => p.color)
      .filter(Boolean)
  );
  const free = BADGE_VALUES.find((v) => !used.has(v));
  return free || BADGE_VALUES[profiles.length % BADGE_VALUES.length];
}

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
  { key: '__fallback', label: 'Fallback provider (when unreachable)' },
  { key: 'ANTHROPIC_BASE_URL', label: 'Base URL (empty = native subscription)' },
  { key: 'ANTHROPIC_AUTH_TOKEN', label: 'Auth token (API key)', secret: true },
  { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', label: 'Opus model', model: true },
  { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', label: 'Sonnet model', model: true },
  { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', label: 'Haiku model', model: true },
  { key: 'API_TIMEOUT_MS', label: 'API timeout (ms, optional)' },
];

function fieldValue(p, key) {
  if (key === '__name') return p.name || '';
  if (key === '__color') return p.color || '';
  if (key === '__hotkey') return p.hotkey || '';
  if (key === '__fallback') {
    if (!p.fallbackId) return '';
    const t = getProfiles().find((x) => x.id === p.fallbackId);
    return t ? t.name : '(missing)';
  }
  // token lives in SecretStorage — only ever surface a masked placeholder
  if (key === 'ANTHROPIC_AUTH_TOKEN') return cachedToken(p) ? '••••••••' : '';
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
    // If we're editing the live provider, env/token changes must be re-applied to
    // claudeCode.environmentVariables — otherwise the active link breaks (the
    // status bar falls back to the bare old URL and the active dot disappears).
    const wasActive = envEqual(fullEnv(p), getActiveEnv());
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
    } else if (f.key === '__fallback') {
      const cur = p.fallbackId;
      const choices = [
        { label: '$(close) None', _value: '' },
        { label: 'Providers', kind: vscode.QuickPickItemKind.Separator },
        ...list
          .filter((x) => x.id !== p.id) // can't fall back to itself
          .map((x) => ({
            label: `${badgeTextPrefix(x.color)}${x.name}`,
            description:
              (x.id === cur ? '● current   ' : '') +
              ((x.env && x.env.ANTHROPIC_BASE_URL) || '(native subscription)'),
            _value: x.id,
          })),
      ];
      const picked = await vscode.window.showQuickPick(choices, {
        placeHolder: 'Fall back to which provider when this one is unreachable?',
        ignoreFocusOut: true,
      });
      if (!picked) continue;
      input = picked._value;
    } else if (f.secret) {
      // Edit the token directly in SecretStorage; never round-trip it through
      // the profile JSON. Pre-fill with the real value so edits don't wipe it.
      const entered = await vscode.window.showInputBox({
        prompt: f.label + ' (stored securely, not in settings.json)',
        value: cachedToken(p),
        password: true,
        ignoreFocusOut: true,
      });
      if (entered === undefined) continue;
      await setToken(p.id, entered);
      if (wasActive) await applyProfile(getProfiles()[index]);
      vscode.commands.executeCommand(`${SELF}.refresh`);
      continue;
    } else if (f.model) {
      // Offer a dropdown of models fetched from the endpoint (GET /v1/models),
      // falling back to manual entry. Returns null on cancel.
      const res = await pickModelValue(p, f);
      if (!res) continue;
      input = res.value; // may be '' to clear
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
    } else if (f.key === '__fallback') {
      if (input) dp.fallbackId = input;
      else delete dp.fallbackId;
    } else if (input === '') {
      delete dp.env[f.key];
    } else {
      dp.env[f.key] = input;
    }
    await saveProfiles(draft);
    // env-affecting fields on the live provider need re-applying (name/color/
    // hotkey don't change env, so the active match still holds).
    if (wasActive && !f.key.startsWith('__')) await applyProfile(draft[index]);
  }
}

// Make `base` unique among existing names by appending 2, 3, … ("DeepSeek2").
function uniqueName(base, profiles) {
  const used = new Set(profiles.map((p) => p.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

// Resolve an item icon: a "*.png" name → bundled logo Uri (needs the extension
// path), anything else → a codicon ThemeIcon id (used where there's no logo).
function providerIcon(icon) {
  if (!icon) return undefined;
  if (icon.endsWith('.png')) {
    return extensionUri
      ? vscode.Uri.joinPath(extensionUri, 'media', 'providers', icon)
      : undefined;
  }
  return new vscode.ThemeIcon(icon);
}

// ---- badges ----------------------------------------------------------------
// A badge (profile.color) is an emoji shape ("🟢") shown as a text prefix, or
// "" (none). Provider logos live only in the "Add provider" menu and in the
// hover tooltip — not as badges, since the tree has a single icon slot.
function badgeTextPrefix(c) {
  // ignore legacy "icon:*" badge values left over from older versions
  return c && !c.startsWith('icon:') ? c + ' ' : '';
}

// Match a Base URL to a built-in template and return its logo file / codicon id.
function normalizeUrl(u) {
  return (u || '').trim().replace(/\/+$/, '');
}
function iconForBaseUrl(url) {
  const n = normalizeUrl(url);
  if (!n) return undefined;
  if (n === normalizeUrl(CLAUDE_API_URL)) return 'claude.png';
  for (const pr of [...PROVIDER_PRESETS, ...LOCAL_PRESETS]) {
    if (normalizeUrl(pr.env.ANTHROPIC_BASE_URL) === n) return pr.icon;
  }
  return undefined;
}

// Read a bundled logo PNG once and cache it as a data: URI (so it can be
// embedded into a Markdown tooltip, which won't load local file images).
const _logoData = new Map();
function logoDataUri(file) {
  if (!file || !file.endsWith('.png') || !extensionUri) return undefined;
  if (_logoData.has(file)) return _logoData.get(file);
  let uri;
  try {
    const fsPath = vscode.Uri.joinPath(extensionUri, 'media', 'providers', file).fsPath;
    const b64 = require('fs').readFileSync(fsPath).toString('base64');
    uri = `data:image/png;base64,${b64}`;
  } catch {
    uri = undefined;
  }
  _logoData.set(file, uri);
  return uri;
}

// Tooltip (Markdown): the provider logo (matched by endpoint) plus name, hotkey,
// Base URL and the model mapping. Shared by the sidebar rows and the status bar.
function profileTooltip(p, extraLines) {
  const env = p.env || {};
  const lines = [`**${p.name}**`];
  if (p.hotkey) lines.push('Hotkey: ' + p.hotkey);
  lines.push('Base URL: ' + (env.ANTHROPIC_BASE_URL || '(native subscription)'));
  if (env.ANTHROPIC_DEFAULT_OPUS_MODEL) lines.push('opus → ' + env.ANTHROPIC_DEFAULT_OPUS_MODEL);
  if (env.ANTHROPIC_DEFAULT_SONNET_MODEL) lines.push('sonnet → ' + env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL) lines.push('haiku → ' + env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
  if (p.fallbackId) {
    const t = getProfiles().find((x) => x.id === p.fallbackId);
    if (t) lines.push('Fallback: ' + t.name);
  }
  if (extraLines) lines.push(...extraLines);

  const md = new vscode.MarkdownString();
  // empty Base URL = native Claude subscription → show the Claude logo
  const baseUrl = env.ANTHROPIC_BASE_URL;
  const logoFile = iconForBaseUrl(baseUrl) || (baseUrl ? undefined : 'claude.png');
  const logo = logoDataUri(logoFile);
  if (logo) md.appendMarkdown(`![logo](${logo}|width=40,height=40)\n\n`);
  md.appendMarkdown(lines.join('  \n'));
  return md;
}

// The "Add provider" menu: Custom (manual), a divider, the two Anthropic entries,
// a divider, then every built-in provider preset — each with its logo on the left.
// Returns the chosen template { name, env } or undefined.
async function pickProviderTemplate() {
  const sep = (label) => ({ label, kind: vscode.QuickPickItemKind.Separator });
  const items = [
    {
      label: '$(edit) Custom',
      description: 'Start blank and fill every field yourself',
      _tpl: { name: 'Custom', env: {} },
    },
    sep('Anthropic'),
    {
      label: 'Claude Subscription',
      description: 'Native Claude Code login — no API key, no Base URL',
      iconPath: providerIcon('claude.png'),
      _tpl: { name: 'Claude Subscription', env: {}, icon: 'claude.png' },
    },
    {
      label: 'Claude API',
      description: `${CLAUDE_API_URL} — pay-per-token API key`,
      iconPath: providerIcon('claude.png'),
      _tpl: { name: 'Claude API', env: { ANTHROPIC_BASE_URL: CLAUDE_API_URL }, icon: 'claude.png' },
    },
    sep('Anthropic-compatible providers'),
    ...PROVIDER_PRESETS.map((pr) => ({
      label: pr.name,
      description: pr.env.ANTHROPIC_BASE_URL || '',
      iconPath: providerIcon(pr.icon),
      _tpl: { name: pr.name, env: pr.env, icon: pr.icon },
    })),
    sep('Local servers'),
    ...LOCAL_PRESETS.map((pr) => ({
      label: pr.name,
      description: pr.env.ANTHROPIC_BASE_URL || '',
      iconPath: providerIcon(pr.icon),
      _tpl: { name: pr.name, env: pr.env, icon: pr.icon },
    })),
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: 'Pick a provider — fields are pre-filled and stay editable (add your API key)',
    ignoreFocusOut: true,
  });
  return pick ? pick._tpl : undefined;
}

async function addProfile() {
  const tpl = await pickProviderTemplate();
  if (!tpl) return;
  const draft = cloneProfiles();
  const env = JSON.parse(JSON.stringify(tpl.env || {}));
  // a preset may carry a placeholder token (local servers) — route it to secrets
  const presetToken = env.ANTHROPIC_AUTH_TOKEN;
  delete env.ANTHROPIC_AUTH_TOKEN;
  const newProfile = {
    id: crypto.randomUUID(),
    name: uniqueName(tpl.name, draft),
    // default badge: the provider's own logo; Custom (no icon) gets a free shape
    color: firstFreeBadge(draft, -1),
    env,
  };
  // auto-assign the next free hotkey
  newProfile.hotkey = firstFreeHotkey(draft, -1, null);
  draft.push(newProfile);
  await saveProfiles(draft);
  if (presetToken) await setToken(newProfile.id, presetToken);
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
  const wasActive = envEqual(fullEnv(list[i]), getActiveEnv());
  const removedId = list[i].id;
  const draft = cloneProfiles();
  draft.splice(i, 1);
  // drop any fallback links pointing at the deleted profile
  if (removedId) for (const x of draft) if (x.fallbackId === removedId) delete x.fallbackId;
  await saveProfiles(draft);
  if (removedId) await setToken(removedId, ''); // drop its secret
  if (removedId && removedId === getPinnedId()) await setPinnedId(undefined); // clear stale pin
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
  const sourceId = draft[i].id;
  const copy = JSON.parse(JSON.stringify(draft[i]));
  copy.id = crypto.randomUUID(); // fresh id → its own secret slot
  copy.name = copy.name + ' copy';
  delete copy.hotkey; // don't duplicate the hotkey
  draft.splice(i + 1, 0, copy);
  await saveProfiles(draft);
  const t = sourceId ? tokenCache.get(sourceId) : '';
  if (t) await setToken(copy.id, t); // carry the token over to the copy
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

// ---- model listing ---------------------------------------------------------
// Fetch the model catalog so the user can pick an id instead of typing it.
// The catch: a provider's Anthropic Base URL often carries a path (e.g.
// `https://api.deepseek.com/anthropic`) that routes /v1/messages, but the model
// list lives elsewhere — usually off the host root (`/v1/models` or `/models`).
// So we try several candidate URLs and use the first that returns a list.
// Responses come as { data: [{ id }] }, { models: [...] }, a bare array, or
// string ids — we accept all of those shapes.

// Candidate model-list URLs for a Base URL, most-specific first.
function modelListCandidates(baseUrl) {
  const n = normalizeUrl(baseUrl);
  const out = [n + '/v1/models', n + '/models'];
  try {
    const u = new (require('url').URL)(n);
    const root = `${u.protocol}//${u.host}`;
    if (root !== n) out.push(root + '/v1/models', root + '/models'); // strip the path
  } catch { /* invalid URL — handled by the caller */ }
  return [...new Set(out)];
}

// GET one model-list URL. Resolves { status, models } — status 0 means the host
// didn't answer (DNS/connection/timeout); models is null unless we parsed a 2xx
// body into a non-empty-capable list.
function fetchModelsAt(modelsUrl, token) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new (require('url').URL)(modelsUrl);
    } catch {
      resolve({ status: 0, models: null });
      return;
    }
    const lib = url.protocol === 'http:' ? require('http') : require('https');
    const headers = { 'anthropic-version': '2023-06-01', accept: 'application/json' };
    if (token) {
      headers['x-api-key'] = token;
      headers['authorization'] = `Bearer ${token}`;
    }
    const req = lib.request(url, { method: 'GET', headers, timeout: 8000 }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        const s = res.statusCode;
        let models = null;
        if (s >= 200 && s < 300) {
          try {
            const j = JSON.parse(raw);
            const arr = Array.isArray(j) ? j
              : Array.isArray(j.data) ? j.data
              : Array.isArray(j.models) ? j.models
              : [];
            models = arr
              .map((m) => (typeof m === 'string' ? m : (m && (m.id || m.name))))
              .filter(Boolean);
          } catch { /* leave models null — counts as a reachable non-list reply */ }
        }
        resolve({ status: s, models });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, models: null }); });
    req.on('error', () => resolve({ status: 0, models: null }));
    req.end();
  });
}

// Try every candidate; return the first model list found. On failure, report
// whether the host was reachable at all and whether auth was rejected, so
// callers can give a useful message / health verdict.
async function probeModelsList(baseUrl, token) {
  let reachable = false;
  let auth = false;
  let serverError = false;
  for (const u of modelListCandidates(baseUrl)) {
    const r = await fetchModelsAt(u, token);
    if (r.status === 0) continue; // host didn't answer at this URL
    reachable = true;
    if (r.models && r.models.length) return { ok: true, models: r.models, reachable: true };
    if (r.status === 401 || r.status === 403) auth = true;
    if (r.status >= 500) serverError = true;
  }
  return { ok: false, models: [], reachable, auth, serverError };
}

// Resolve a model field value: query the endpoint and let the user pick from a
// list, with "Enter manually…" and "Clear" escapes. Returns { value } (value
// may be '' to clear) or null if the user cancelled.
async function pickModelValue(p, f) {
  const cur = (p.env && p.env[f.key]) || '';
  const base = p.env && p.env.ANTHROPIC_BASE_URL;
  const tier = f.label.toLowerCase(); // "opus model" → readable placeholder
  const manual = async () => {
    const v = await vscode.window.showInputBox({
      prompt: `${f.label} — type the model id`,
      value: cur,
      ignoreFocusOut: true,
    });
    return v === undefined ? null : { value: v.trim() };
  };
  // Native subscription / no endpoint → nothing to query, just ask for the id.
  if (!base) return manual();

  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Fetching models from "${p.name}"…` },
    () => probeModelsList(base, cachedToken(p))
  );
  if (!r.ok || !r.models.length) {
    const reason = !r.reachable
      ? 'endpoint unreachable'
      : r.auth
        ? 'auth failed — check the API key'
        : r.serverError
          ? 'server error'
          : "this provider doesn't expose a model list";
    vscode.window.showWarningMessage(`Couldn't list models (${reason}). Enter the id manually.`);
    return manual();
  }

  const items = [
    { label: '$(edit) Enter manually…', _manual: true },
    ...(cur ? [{ label: '$(close) Clear', _clear: true }] : []),
    { label: `${r.models.length} models`, kind: vscode.QuickPickItemKind.Separator },
    ...r.models.map((id) => ({
      label: id,
      description: id === cur ? '● current' : '',
      _value: id,
    })),
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: `Pick the ${tier}`,
    matchOnDescription: true,
    ignoreFocusOut: true,
  });
  if (!pick) return null;
  if (pick._manual) return manual();
  if (pick._clear) return { value: '' };
  return { value: pick._value };
}

// ---- test connection -------------------------------------------------------
// Fire a single small POST /v1/messages and classify the response. We don't care
// about the body — any HTTP reply means the host is reachable; the status code
// tells us whether auth worked. A 400 (e.g. unknown model) still proves the
// endpoint and key are fine, which is all we want to confirm here.

function httpProbe(baseUrl, token, model) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new (require('url').URL)(normalizeUrl(baseUrl) + '/v1/messages');
    } catch {
      resolve({ kind: 'error', msg: 'Invalid Base URL' });
      return;
    }
    const lib = url.protocol === 'http:' ? require('http') : require('https');
    const body = JSON.stringify({
      model: model || 'claude-3-5-haiku-latest',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    const headers = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'content-length': Buffer.byteLength(body),
    };
    if (token) {
      // Anthropic uses x-api-key; many gateways accept a Bearer token. Send both.
      headers['x-api-key'] = token;
      headers['authorization'] = `Bearer ${token}`;
    }
    const req = lib.request(url, { method: 'POST', headers, timeout: 12000 }, (res) => {
      res.on('data', () => {}); // drain so the socket can close
      res.on('end', () => resolve({ kind: 'status', status: res.statusCode }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ kind: 'error', msg: 'Timed out after 12s' }); });
    req.on('error', (e) => resolve({ kind: 'error', msg: e.message }));
    req.write(body);
    req.end();
  });
}

async function testProfile(arg) {
  const i = resolveIndex(arg);
  const p = getProfiles()[i];
  if (!p) return;
  const base = p.env && p.env.ANTHROPIC_BASE_URL;
  if (!base) {
    vscode.window.showInformationMessage(
      `"${p.name}" uses the native Claude subscription — nothing to test.`
    );
    return;
  }
  const env = p.env || {};
  const model =
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
    env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
    env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Testing "${p.name}"…` },
    () => httpProbe(base, cachedToken(p), model)
  );
  if (r.kind === 'error') {
    vscode.window.showErrorMessage(`✗ ${p.name}: unreachable — ${r.msg}`);
    return;
  }
  const s = r.status;
  if (s === 200) {
    vscode.window.showInformationMessage(`✓ ${p.name}: connected (HTTP 200).`);
  } else if (s === 401 || s === 403) {
    vscode.window.showErrorMessage(`✗ ${p.name}: reachable, but auth failed (HTTP ${s}) — check the API key.`);
  } else if (s === 404) {
    vscode.window.showErrorMessage(`✗ ${p.name}: endpoint not found (HTTP 404) — check the Base URL.`);
  } else if (s === 400) {
    vscode.window.showInformationMessage(`✓ ${p.name}: reachable and authorized (HTTP 400 — likely the test model name; the endpoint and key are fine).`);
  } else if (s === 429) {
    vscode.window.showWarningMessage(`⚠ ${p.name}: reachable, but rate-limited (HTTP 429).`);
  } else {
    vscode.window.showWarningMessage(`⚠ ${p.name}: reachable — server returned HTTP ${s}.`);
  }
}

// ---- auto-fallback ---------------------------------------------------------
// A profile may name a `fallbackId` — another profile to use when this one is
// unreachable. On switch (via `switchWithFallback`, or any switch when
// `autoFallbackOnApply` is on) we probe the target and, if it's down, walk the
// fallback chain and apply the first healthy provider. "Healthy" = HTTP 200/400
// (endpoint + key work). A native-subscription profile (no Base URL) can't be
// probed, so it's treated as always reachable — a good chain terminator.

function probeHealthy(r) {
  if (!r || r.kind === 'error') return false;
  return r.status === 200 || r.status === 400;
}

async function applyProfileWithFallback(startP) {
  if (!startP) return;
  const profiles = getProfiles();
  // Build the chain start → fallback → … stopping on a cycle or a dead link.
  const chain = [];
  const seen = new Set();
  let p = startP;
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    chain.push(p);
    p = p.fallbackId ? profiles.find((x) => x.id === p.fallbackId) : null;
  }

  const skipped = [];
  for (const cand of chain) {
    const base = cand.env && cand.env.ANTHROPIC_BASE_URL;
    let healthy;
    if (!base) {
      healthy = true; // native subscription — assume reachable
    } else {
      const env = cand.env || {};
      const model =
        env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
        env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
        env.ANTHROPIC_DEFAULT_OPUS_MODEL;
      const r = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Checking "${cand.name}"…` },
        () => httpProbe(base, cachedToken(cand), model)
      );
      healthy = probeHealthy(r);
    }
    if (healthy) {
      await applyProfile(cand);
      if (skipped.length) {
        vscode.window.showWarningMessage(
          `${skipped.join(', ')} unreachable — fell back to "${cand.name}".`
        );
      }
      return cand;
    }
    skipped.push(`"${cand.name}"`);
  }

  // Nothing in the chain answered — keep the user pointed at the original.
  await applyProfile(startP);
  vscode.window.showErrorMessage(
    skipped.length > 1
      ? `No reachable provider in the fallback chain: ${skipped.join(' → ')}. Kept "${startP.name}".`
      : `"${startP.name}" is unreachable and has no working fallback. Applied it anyway.`
  );
  return startP;
}

// Explicit command — always probes + falls back, regardless of the setting.
async function switchWithFallback(arg) {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage('No providers configured yet.');
    return;
  }
  let p;
  const i = resolveIndex(arg);
  if (i >= 0 && profiles[i]) {
    p = profiles[i];
  } else {
    const items = profiles.map((x, idx) => ({
      label: `${badgeTextPrefix(x.color)}${x.name}`,
      description:
        ((x.env && x.env.ANTHROPIC_BASE_URL) || '(native subscription)') +
        (x.fallbackId ? '   ↪ has fallback' : ''),
      _idx: idx,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: 'Switch to (probe first, fall back if unreachable)…',
    });
    if (!pick) return;
    p = profiles[pick._idx];
  }
  await applyProfileWithFallback(p);
}

// ---- health indicator ------------------------------------------------------
// Shows each provider's reachability (🟢/🔴) in the tree and the active item's
// tooltip. The check reuses the token-free model-list probe (GET /v1/models &
// friends) — a metadata call that runs NO inference, so it costs zero tokens
// (unlike "Test connection", which fires a real /v1/messages request). That's
// what makes the periodic mode safe to leave on. Mode is controlled by
// `healthCheck` (manual | periodic); manual is default, so nothing runs until
// you press the check button.

function healthOf(p) {
  return (p && p.id && healthCache.get(p.id)) || 'unknown';
}
function healthLabel(s) {
  return s === 'ok' ? '🟢 reachable' : s === 'down' ? '🔴 unreachable' : '⚪ not checked';
}
function healthColor(s) {
  if (s === 'ok') return new vscode.ThemeColor('charts.green');
  if (s === 'down') return new vscode.ThemeColor('charts.red');
  return undefined; // unknown → theme default
}

// Reachability verdict for one provider, from the model-list probe. A host that
// answers anything other than an auth rejection or a 5xx counts as reachable —
// many providers 404 on /v1/models yet serve /v1/messages fine.
async function checkOneHealth(p) {
  const base = p.env && p.env.ANTHROPIC_BASE_URL;
  if (!base) return 'ok'; // native subscription — can't probe, assume up
  const r = await probeModelsList(base, cachedToken(p));
  if (r.ok) return 'ok';
  if (!r.reachable) return 'down'; // nothing answered
  if (r.auth || r.serverError) return 'down';
  return 'ok'; // host answered (e.g. 404 — no model list), but it's up
}

// Probe every profile concurrently and update the cache.
async function checkAllHealth() {
  await Promise.all(
    getProfiles().map(async (p) => {
      if (!p.id) return;
      healthCache.set(p.id, await checkOneHealth(p));
    })
  );
}

// Manual "Check health" command — runs the probe with a progress toast and
// reports a summary.
async function checkHealthCommand() {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage('No providers configured yet.');
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Checking provider health…' },
    () => checkAllHealth()
  );
  vscode.commands.executeCommand(`${SELF}.refresh`);
  const down = profiles.filter((p) => healthOf(p) === 'down').map((p) => p.name);
  if (down.length) {
    vscode.window.showWarningMessage(
      `Health: ${down.length} of ${profiles.length} unreachable — ${down.join(', ')}.`
    );
  } else {
    vscode.window.showInformationMessage(`Health: all ${profiles.length} provider(s) reachable.`);
  }
}

// (Re)arm the periodic timer from settings. Clears any existing timer first, so
// it's safe to call on activation and whenever the relevant settings change.
function restartHealthTimer() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = undefined;
  }
  const cfg = vscode.workspace.getConfiguration(SELF);
  if (cfg.get('healthCheck') !== 'periodic') return;
  const mins = Math.max(1, Number(cfg.get('healthCheckIntervalMinutes')) || 5);
  const run = async () => {
    await checkAllHealth();
    vscode.commands.executeCommand(`${SELF}.refresh`);
  };
  run(); // check once immediately so the indicators populate
  healthTimer = setInterval(run, mins * 60 * 1000);
}

// ---- import / export -------------------------------------------------------
// Profiles round-trip as a plain JSON array. The local `id` is never exported
// (it's only meaningful for this machine's SecretStorage); imports get fresh
// ids. Tokens are excluded by default and only included on explicit request.

async function exportProfiles() {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage('No providers to export.');
    return;
  }
  const choice = await vscode.window.showQuickPick(
    [
      { label: '$(shield) Without API keys', description: 'Recommended — safe to share or commit', _withTokens: false },
      { label: '$(key) Include API keys', description: 'Sensitive! Keys will be written in plain text', _withTokens: true },
    ],
    { placeHolder: 'Export API keys as well?', ignoreFocusOut: true }
  );
  if (!choice) return;
  const out = profiles.map((p) => {
    const o = { name: p.name, env: { ...((p && p.env) || {}) } };
    if (p.color) o.color = p.color;
    if (p.hotkey) o.hotkey = p.hotkey;
    if (choice._withTokens) {
      const t = cachedToken(p);
      if (t) o.env.ANTHROPIC_AUTH_TOKEN = t;
    }
    return o;
  });
  const uri = await vscode.window.showSaveDialog({
    saveLabel: 'Export',
    filters: { JSON: ['json'] },
    defaultUri: vscode.Uri.file('claude-providers.json'),
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(out, null, 2), 'utf8'));
  vscode.window.showInformationMessage(`Exported ${out.length} provider(s)${choice._withTokens ? ' with API keys' : ''}.`);
}

async function importProfiles() {
  const picks = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Import',
    filters: { JSON: ['json'] },
  });
  if (!picks || !picks.length) return;
  let data;
  try {
    const buf = await vscode.workspace.fs.readFile(picks[0]);
    data = JSON.parse(Buffer.from(buf).toString('utf8'));
  } catch (e) {
    vscode.window.showErrorMessage('Could not read the file as JSON: ' + e.message);
    return;
  }
  if (!Array.isArray(data)) {
    vscode.window.showErrorMessage('Expected a JSON array of provider profiles.');
    return;
  }
  const draft = cloneProfiles();
  const pendingTokens = [];
  let added = 0;
  for (const raw of data) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) continue;
    const env = raw.env && typeof raw.env === 'object' ? { ...raw.env } : {};
    const token = env.ANTHROPIC_AUTH_TOKEN;
    delete env.ANTHROPIC_AUTH_TOKEN;
    const id = crypto.randomUUID();
    const prof = {
      id,
      name: uniqueName(raw.name.trim(), draft),
      color: raw.color || firstFreeBadge(draft, -1),
      env,
    };
    const hk = firstFreeHotkey(draft, -1, null);
    if (hk) prof.hotkey = hk;
    draft.push(prof);
    if (token) pendingTokens.push([id, token]);
    added++;
  }
  if (!added) {
    vscode.window.showWarningMessage('No valid profiles found in the file.');
    return;
  }
  await saveProfiles(draft);
  for (const [id, t] of pendingTokens) await setToken(id, t);
  vscode.window.showInformationMessage(
    `Imported ${added} provider(s)${pendingTokens.length ? ` (${pendingTokens.length} with an API key)` : ''}.`
  );
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

let extensionUri;
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
    // status bar is text-only, so a logo badge just shows the plug + name
    statusItem.text = `$(plug) ${badgeTextPrefix(p.color)}${p.name}`;
    const st = healthOf(p);
    statusItem.tooltip = profileTooltip(
      p,
      st !== 'unknown' ? ['', 'Status: ' + healthLabel(st), '', 'Click to switch'] : ['', 'Click to switch']
    );
  } else {
    const base = getActiveEnv().ANTHROPIC_BASE_URL;
    statusItem.text = `$(plug) ${base ? base : 'Claude (default)'}`;
    statusItem.tooltip = 'Claude provider — click to switch';
  }
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
    const pinnedId = getPinnedId();
    return profiles.map((p, i) => {
      const env = p.env || {};
      const isPinned = p.id && p.id === pinnedId;
      // Tree has a single icon slot — logos don't render here, only emoji
      // badges (text prefix) and the active/inactive marker.
      const status = healthOf(p);
      const it = new vscode.TreeItem(`${badgeTextPrefix(p.color)}${p.name}`);
      it.id = String(i);
      it.contextValue = 'claudeProfile';
      it.description = (isPinned ? '📌 ' : '') + (env.ANTHROPIC_BASE_URL || 'native subscription');
      // shape marks active/inactive; color (when known) marks health
      it.iconPath = new vscode.ThemeIcon(
        i === active ? 'pass-filled' : 'circle-large-outline',
        healthColor(status)
      );
      const extra = [];
      if (isPinned) extra.push('', '📌 Pinned to this workspace');
      if (status !== 'unknown') extra.push('', 'Status: ' + healthLabel(status));
      it.tooltip = profileTooltip(p, extra.length ? extra : undefined);
      return it;
    });
  }
}

// ---- activate --------------------------------------------------------------

function activate(context) {
  extensionUri = context.extensionUri;
  secretStorage = context.secrets;
  workspaceState = context.workspaceState;
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
    if (i >= 0) switchProfile(getProfiles()[i]);
  });
  reg('switchToIndex', (idx) => switchToIndex(typeof idx === 'number' ? idx : parseInt(idx, 10)));
  reg('next', () => cycleProfile(1));
  reg('previous', () => cycleProfile(-1));
  reg('test', testProfile);
  reg('export', exportProfiles);
  reg('import', importProfiles);
  reg('pinToWorkspace', pinToWorkspace);
  reg('switchWithFallback', switchWithFallback);
  reg('checkHealth', checkHealthCommand);
  reg('refresh', () => {
    provider.refresh();
    updateStatus();
  });

  // Migrate older profiles (assign ids, move tokens to SecretStorage), prime the
  // token cache, then repaint once everything is loaded.
  (async () => {
    await migrateProfiles();
    await refreshTokenCache();
    // If this workspace pins a provider, switch to it now (before a Claude Code
    // session starts). Runs after the token cache so fullEnv() matches correctly.
    await applyPinnedProfile();
    provider.refresh();
    updateStatus();
  })();

  // initial sync
  syncKeybindings().then(() => vscode.window.setStatusBarMessage('Claude provider hotkeys synced', 2500));

  // start periodic health checks if enabled (no-op in the default manual mode)
  restartHealthTimer();

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
      if (
        e.affectsConfiguration(`${SELF}.healthCheck`) ||
        e.affectsConfiguration(`${SELF}.healthCheckIntervalMinutes`)
      ) {
        restartHealthTimer();
      }
    })
  );

  updateStatus();
}

function deactivate() {
  if (healthTimer) clearInterval(healthTimer);
}

module.exports = { activate, deactivate };