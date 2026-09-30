// The Codex side of the switcher: Codex (the `codex` CLI and its IDE extension)
// reads one file, $CODEX_HOME/config.toml (default ~/.codex/config.toml), so a
// switch is a file edit — no VS Code API involved. This module is pure Node and
// is shared by the extension and the terminal app.
//
// Current Codex has no "default profile" selector (a top-level `profile = …` is
// rejected; profiles are separate files picked with --profile), so a switch sets
// the top-level keys Codex reads directly. Layout it maintains:
//
//   model_provider = "cps-deepseek"   ← top-level keys: the active provider…
//   model = "…"                        ← …its model…
//   model_reasoning_effort = "high"    ← …and effort (removed when not set)
//   …the user's own keys and tables, untouched…
//   # >>> claude-provider-switcher … >>>
//   # active-profile = "cps-deepseek" ← which switcher profile set those keys
//   # active-provider = "cps-deepseek"
//   # previous model = "gpt-5"        ← the user's own values, restored on reset
//   [model_providers.cps-deepseek]     ← one per profile with a Base URL
//   name = "DeepSeek"
//   base_url = "https://…/v1"
//   wire_api = "responses"
//   auth = { command = "cat", args = ["…/codex-keys/<id>.key"] }
//   # <<< claude-provider-switcher <<<
//
// API keys never go into config.toml by default: each one lives in its own
// owner-only file (~/.claude-provider-switcher/codex-keys/<id>.key) and Codex
// reads it through `auth = { command }` (`cat`, or `cmd /c type` on Windows —
// no Node or PATH setup needed). The `codexKeyStorage = "config"` fallback
// writes the active provider's key as experimental_bearer_token instead.
//
// Each profile also gets $CODEX_HOME/<key>.config.toml (a Codex "profile" file)
// so `codex --profile <key>` runs it in parallel with whatever is active.
//
// A profile without a Base URL uses Codex's built-in `openai` provider (login
// via `codex login`), so it needs no table. A switcher profile counts as active
// while the top-level `model_provider` still equals the one we recorded — a
// hand edit (or another tool) that changes it hands control back to the user.

const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const path = require('path');
const toml = require('../toml');
const { keyDir } = require('../keyfile');

const BLOCK_BEGIN = '# >>> claude-provider-switcher: managed block (edit via the extension or claude-providers) >>>';
const BLOCK_END = '# <<< claude-provider-switcher <<<';

// The top-level keys a switch sets (and a reset restores).
const MANAGED_KEYS = ['model_provider', 'model', 'model_reasoning_effort'];
// Top-level key pointing Codex at a model-catalog file (see "model catalog").
const MODEL_CATALOG_KEY = 'model_catalog_json';
// Codex's built-in provider (ChatGPT login / OpenAI API key via `codex login`).
const BUILTIN_PROVIDER = 'openai';

// Reasoning-effort values Codex accepts for `model_reasoning_effort`.
const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];

// Hotkey slots for Codex profiles (Claude profiles use Ctrl+Alt+…).
const CODEX_HOTKEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => `Ctrl+Shift+Alt+${d}`);

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}
function configPath() {
  return path.join(codexHome(), 'config.toml');
}
function backupPath() {
  return configPath() + '.cps-backup';
}

// ---- key files ------------------------------------------------------------------
// One owner-only file per profile holding just its API key, read by Codex via
// `auth = { command }`. Named by profile id (ids are UUIDs — file-name safe).

const KEY_STORAGE_MODES = ['file', 'config'];

function keyFilesDir() {
  return path.join(keyDir(), 'codex-keys');
}
function keyFilePathFor(p) {
  const id = String((p && p.id) || '').replace(/[^A-Za-z0-9_-]/g, '_');
  return path.join(keyFilesDir(), `${id || 'unknown'}.key`);
}
function hasKeyFile(p) {
  try {
    return fs.statSync(keyFilePathFor(p)).size > 0;
  } catch {
    return false;
  }
}
function readKeyFileFor(p) {
  try {
    return fs.readFileSync(keyFilePathFor(p), 'utf8').trim();
  } catch {
    return '';
  }
}
function writeKeyFileFor(p, token) {
  const file = keyFilePathFor(p);
  if (readKeyFileFor(p) === token) return;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, token, { mode: 0o600 });
  fs.renameSync(tmp, file);
}
// Drop a profile's key file (its key was removed, or the profile deleted).
function forgetKey(p) {
  try {
    fs.unlinkSync(keyFilePathFor(p));
  } catch { /* already gone */ }
}
// Remove key files that belong to no profile (keep = ids to keep; null = none).
function pruneKeyFiles(keepIds) {
  let names = [];
  try {
    names = fs.readdirSync(keyFilesDir());
  } catch {
    return;
  }
  const keep = new Set([...(keepIds || [])].map((id) => path.basename(keyFilePathFor({ id }))));
  for (const n of names) {
    if (n.endsWith('.key') && !keep.has(n)) {
      try { fs.unlinkSync(path.join(keyFilesDir(), n)); } catch { /* ignore */ }
    }
  }
}

// The `auth` inline table that makes Codex read a key file.
function authFor(p) {
  const file = keyFilePathFor(p);
  const cmd = process.platform === 'win32'
    ? { command: 'cmd', args: ['/d', '/c', 'type', file] }
    : { command: 'cat', args: [file] };
  return `{ command = ${toml.tomlString(cmd.command)}, args = [${cmd.args.map(toml.tomlString).join(', ')}] }`;
}

// ---- profile files ----------------------------------------------------------------
// $CODEX_HOME/<key>.config.toml, layered by Codex over config.toml when run with
// `--profile <key>`. Ours start with PROFILE_MARK; a file without it is the
// user's and is never touched.

const PROFILE_MARK = '# Managed by claude-provider-switcher';
const PROFILE_NAME_RE = /^[A-Za-z0-9_-]+$/; // what Codex accepts for --profile

function profileFilePath(key) {
  return path.join(codexHome(), `${key}.config.toml`);
}
function isOurProfileFile(file) {
  try {
    return fs.readFileSync(file, 'utf8').startsWith(PROFILE_MARK);
  } catch {
    return false;
  }
}
function renderProfileFile(p) {
  const k = profileKey(p);
  const c = p.codex || {};
  const lines = [
    `${PROFILE_MARK} — run \`codex --profile ${k}\`. Changes here are overwritten.`,
    `model_provider = ${toml.tomlString(providerOf(p))}`,
  ];
  if (c.model) lines.push(`model = ${toml.tomlString(c.model)}`);
  if (c.reasoning_effort) lines.push(`model_reasoning_effort = ${toml.tomlString(c.reasoning_effort)}`);
  return lines.join('\n') + '\n';
}
// Write every profile's file, remove ours that no profile owns any more.
function syncProfileFiles(profiles) {
  const want = new Map();
  for (const p of profiles) {
    const k = profileKey(p);
    if (PROFILE_NAME_RE.test(k)) want.set(k, renderProfileFile(p));
  }
  let names = [];
  try {
    names = fs.readdirSync(codexHome());
  } catch { /* no Codex home yet */ }
  for (const n of names) {
    const m = /^(.+)\.config\.toml$/.exec(n);
    if (m && !want.has(m[1]) && isOurProfileFile(path.join(codexHome(), n))) {
      try { fs.unlinkSync(path.join(codexHome(), n)); } catch { /* ignore */ }
    }
  }
  for (const [k, text] of want) {
    const file = profileFilePath(k);
    let cur = null;
    try { cur = fs.readFileSync(file, 'utf8'); } catch { /* new */ }
    if (cur === text) continue;
    if (cur !== null && !cur.startsWith(PROFILE_MARK)) continue; // the user's own file
    fs.mkdirSync(codexHome(), { recursive: true });
    fs.writeFileSync(file, text);
  }
}

// ---- model catalog ------------------------------------------------------------
// Codex's /model picker shows "Custom model" for a model id it doesn't know.
// `model_catalog_json` points it at a JSON file describing models — but that
// file REPLACES Codex's whole catalog (the ChatGPT-login models included), and
// Codex refuses to start at all if the path is missing or an entry doesn't
// match its schema. So:
//   - the key is set only while a third-party profile is active, and the file
//     holds that profile's model alone (the picker offers what it can serve);
//     switching to the built-in provider or resetting removes it again;
//   - the value is an absolute path (Codex expands `~` to the home directory,
//     not to $CODEX_HOME);
//   - `base_instructions` (Codex's system prompt, required per entry) is taken
//     from Codex's own bundled catalog, and the file is checked with the local
//     `codex` CLI before the key is written. Without a working CLI, or if the
//     check fails, no key is written — the model just shows as "Custom model".
//   - a `model_catalog_json` the user set themselves is left alone.

// A pre-release build wrote this value; Codex can't resolve it (see above).
const LEGACY_CATALOG_VALUE = '~/model-catalogs/cps-custom.json';

function catalogPath() {
  return path.join(codexHome(), 'model-catalogs', 'cps-custom.json');
}

// True when `model_catalog_json` is absent or points at our file.
function ownsCatalogKey(text) {
  if (!toml.hasTopLevelKey(text, MODEL_CATALOG_KEY)) return true;
  const v = toml.getTopLevelString(text, MODEL_CATALOG_KEY);
  if (!v) return false;
  return v === LEGACY_CATALOG_VALUE || path.resolve(v).toLowerCase() === path.resolve(catalogPath()).toLowerCase();
}

// The catalog entry for a third-party profile, without `base_instructions`;
// null when the profile has nothing to show (built-in provider or no model).
function catalogEntryFor(p) {
  if (!baseUrl(p)) return null;
  const c = p.codex || {};
  if (!c.model) return null;
  const effort = c.reasoning_effort;
  return {
    slug: c.model,
    display_name: c.model,
    description: p.name || '',
    supported_reasoning_levels: effort ? [{ effort, description: effort }] : [],
    default_reasoning_level: effort || 'none',
    shell_type: 'shell_command',
    visibility: 'list',
    supported_in_api: true,
    priority: 0,
    supports_reasoning_summaries: true,
    default_reasoning_summary: 'none',
    support_verbosity: false,
    supports_parallel_tool_calls: true,
    experimental_supported_tools: [],
    input_modalities: ['text'],
    truncation_policy: { mode: 'bytes', limit: 10000 },
  };
}

// Run the local `codex` CLI with CODEX_HOME set to `home`; returns stdout,
// throws when it is missing or fails. Through a shell so npm's `.cmd` shim
// resolves on Windows; `args` are our own constants, never user input.
function runCodexCli(args, home) {
  return execSync(`codex ${args.join(' ')}`, {
    env: { ...process.env, CODEX_HOME: home },
    encoding: 'utf8',
    timeout: 20000,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

// The runner syncConfig uses by default; tests swap it (null restores it).
let codexRunner = runCodexCli;
function setCodexRunner(fn) {
  codexRunner = fn || runCodexCli;
}

// Run `codex debug models` against a scratch CODEX_HOME holding `configText`
// (so neither the user's config nor our current catalog gets in the way).
function debugModels(run, configText) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-codex-'));
  try {
    fs.writeFileSync(path.join(dir, 'config.toml'), configText);
    const j = JSON.parse(run(['debug', 'models'], dir));
    return Array.isArray(j.models) ? j.models : [];
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Codex's own system prompt: that of its top listed bundled model.
function bundledInstructions(run) {
  const models = debugModels(run, '')
    .filter((m) => m && typeof m.base_instructions === 'string' && m.base_instructions)
    .sort((a, b) => (a.visibility === 'list' ? 0 : 1) - (b.visibility === 'list' ? 0 : 1) || (a.priority || 0) - (b.priority || 0));
  if (!models.length) throw new Error('no bundled base_instructions');
  return models[0].base_instructions;
}

// Make our catalog file hold `entry` in a form this Codex accepts. The file
// records the Codex version it was checked with; while the entry and the
// version are unchanged nothing is re-run. Returns true when the file is valid.
function ensureCatalog(entry, run) {
  const file = catalogPath();
  let version;
  try {
    version = run(['--version'], codexHome()).trim();
  } catch {
    return false;
  }
  let cur = null;
  try { cur = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  const m = cur && Array.isArray(cur.models) && cur.models.length === 1 ? cur.models[0] : null;
  if (m && m.base_instructions && cur.checked_with === version) {
    const rest = { ...m };
    delete rest.base_instructions;
    if (JSON.stringify(rest) === JSON.stringify(entry)) return true;
  }
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    const next = { checked_with: version, models: [{ ...entry, base_instructions: bundledInstructions(run) }] };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
    const seen = debugModels(run, `${MODEL_CATALOG_KEY} = ${toml.tomlString(tmp)}\n`);
    if (!seen.some((x) => x && x.slug === entry.slug)) throw new Error('catalog rejected');
    fs.renameSync(tmp, file);
    return true;
  } catch {
    fs.rmSync(tmp, { force: true });
    return false;
  }
}

// Point config.toml at our catalog while `active` is a third-party profile,
// drop the key (and the file) otherwise. A user-set key is left alone.
function applyCatalog(text, active, run) {
  if (!ownsCatalogKey(text)) return text;
  const entry = active && catalogEntryFor(active);
  if (entry && ensureCatalog(entry, run)) {
    return toml.setTopLevel(text, MODEL_CATALOG_KEY, toml.tomlString(catalogPath()));
  }
  fs.rmSync(catalogPath(), { force: true });
  return toml.removeTopLevel(text, MODEL_CATALOG_KEY);
}

// ---- profiles -----------------------------------------------------------------

function slugify(name) {
  const s = String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  return s || 'provider';
}

// The profile's key in config.toml (`[model_providers.<key>]`). Assigned once,
// when the profile is created (see assignKey), so renaming doesn't move it.
function profileKey(p) {
  return (p && p.key) || `cps-${String((p && p.id) || 'x').slice(0, 8)}`;
}

// Give `p` a key derived from its name, unique among `list`.
function assignKey(p, list) {
  if (p.key) return p.key;
  const used = new Set(list.filter((x) => x !== p).map(profileKey));
  const base = `cps-${slugify(p.name)}`;
  let k = base;
  let n = 2;
  while (used.has(k)) k = `${base}-${n++}`;
  p.key = k;
  return k;
}

function baseUrl(p) {
  return (p && p.codex && typeof p.codex.base_url === 'string' && p.codex.base_url.trim()) || '';
}

// The `model_provider` value a profile selects.
function providerOf(p) {
  return baseUrl(p) ? profileKey(p) : BUILTIN_PROVIDER;
}

// localhost-style endpoints need no API key.
function isLocalUrl(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]' || h.endsWith('.localhost');
  } catch {
    return false;
  }
}

// Does switching to `p` need an API key? (A remote provider does; the built-in
// OpenAI provider logs in through `codex login`, local servers need none.)
function needsKey(p) {
  const u = baseUrl(p);
  return !!u && !isLocalUrl(u);
}

// What a request to the profile's endpoint carries besides the key (for the
// connection test, the model list and the health check): its headers and query
// parameters; `openai` tells the model-list probe the Base URL ends in /v1.
function requestExtra(p) {
  const c = (p && p.codex) || {};
  return { headers: c.http_headers || {}, query: c.query_params || {}, openai: true };
}

// ---- reading the file ------------------------------------------------------------

function readConfig() {
  try {
    return { text: fs.readFileSync(configPath(), 'utf8'), exists: true };
  } catch {
    return { text: '', exists: false };
  }
}

// What the current managed block records: the active profile key and the
// provider it set, the user's previous values of MANAGED_KEYS, the provider
// tables it defines and the keys they carry (provider key → token).
function blockInfo(text) {
  const body = toml.getBlock(text, BLOCK_BEGIN, BLOCK_END);
  const info = { present: body !== null, active: null, activeProvider: null, previous: {}, providers: new Set(), tokens: {} };
  if (body === null) return info;
  let table = null;
  for (const line of body.split('\n')) {
    const meta = /^#\s*(active-profile|active-provider|previous\s+([A-Za-z0-9_]+))\s*=\s*(.*)$/.exec(line.trim());
    if (meta) {
      const v = toml.parseStringValue(meta[3]);
      if (v === undefined) continue;
      if (meta[1] === 'active-profile') info.active = v;
      else if (meta[1] === 'active-provider') info.activeProvider = v;
      else if (MANAGED_KEYS.includes(meta[2])) info.previous[meta[2]] = v;
      continue;
    }
    const h = /^\s*\[/.test(line) ? toml.headerName(line) : null;
    if (h !== null) {
      table = h;
      const m = /^model_providers\.(.+)$/.exec(h);
      if (m) info.providers.add(m[1]);
      continue;
    }
    const m = /^\s*experimental_bearer_token\s*=(.*)$/.exec(line);
    const pm = table && /^model_providers\.(.+)$/.exec(table);
    if (m && pm) {
      const v = toml.parseStringValue(m[1]);
      if (v) info.tokens[pm[1]] = v;
    }
  }
  return info;
}

// The key of the switcher profile that is active per config.toml, or null: the
// block records one and the top-level `model_provider` still has the value we
// set (so a hand edit hands control back to the user).
function activeKey(text, info = blockInfo(text)) {
  if (!info.active || !info.activeProvider) return null;
  return toml.getTopLevelString(text, 'model_provider') === info.activeProvider ? info.active : null;
}

// The id of the active switcher profile per config.toml, or null.
function activeId(profiles, text = readConfig().text) {
  const k = activeKey(text);
  if (!k) return null;
  const p = profiles.find((x) => profileKey(x) === k);
  return p ? p.id : null;
}

// The API key config.toml currently holds for `p` (only the active profile has
// one) — lets the terminal app switch without the shared key file.
function tokenInConfig(p, text = readConfig().text) {
  return blockInfo(text).tokens[profileKey(p)] || readKeyFileFor(p);
}

// ---- writing ---------------------------------------------------------------------

class CodexConfigError extends Error {
  constructor(code, detail) {
    super(`${code}${detail ? ': ' + detail : ''}`);
    this.code = code;
    this.detail = detail || '';
  }
}

// Things that would make our block produce an invalid config: `model_providers`
// defined as an inline table (immutable in TOML), or a provider table of ours
// that the user also wrote by hand outside the block.
function checkConflicts(text, profiles) {
  if (toml.hasTopLevelKey(text, 'model_providers')) throw new CodexConfigError('inlineTable', 'model_providers');
  const outside = new Set(toml.tableNames(text, BLOCK_BEGIN, BLOCK_END).map((t) => t.name));
  for (const p of profiles) {
    const name = `model_providers.${profileKey(p)}`;
    if (baseUrl(p) && outside.has(name)) throw new CodexConfigError('conflict', name);
  }
}

// The user's current values of MANAGED_KEYS (only the ones present). A present
// non-string value can't be restored faithfully, so it is refused.
function captureValues(text) {
  const out = {};
  for (const k of MANAGED_KEYS) {
    if (!toml.hasTopLevelKey(text, k)) continue;
    const v = toml.getTopLevelString(text, k);
    if (v === undefined) throw new CodexConfigError('valueType', k);
    out[k] = v;
  }
  return out;
}

// The top-level values a profile sets. A key the profile leaves empty is
// removed for a third-party provider (its models differ from OpenAI's); on the
// built-in provider it falls back to the user's own value.
function valuesFor(p, previous) {
  const c = p.codex || {};
  const own = !baseUrl(p);
  return {
    model_provider: providerOf(p),
    model: c.model || (own ? previous.model : undefined),
    model_reasoning_effort: c.reasoning_effort || (own ? previous.model_reasoning_effort : undefined),
  };
}

// `model` and `model_reasoning_effort` are usually the user's own keys, and a
// third-party profile may remove them; when set again they go back next to each
// other rather than to the end of the top level.
const NEIGHBOURS = {
  model: { before: ['model_reasoning_effort'] },
  model_reasoning_effort: { after: ['model'] },
};

function applyValues(text, values) {
  let out = text;
  for (const k of MANAGED_KEYS) {
    out = values[k] !== undefined
      ? toml.setTopLevel(out, k, toml.tomlString(values[k]), NEIGHBOURS[k])
      : toml.removeTopLevel(out, k);
  }
  return out;
}

function renderBlock(profiles, { active, token, previous, keyStorage = 'file' }) {
  const out = [];
  if (active) {
    out.push(`# active-profile = ${toml.tomlString(profileKey(active))}`);
    out.push(`# active-provider = ${toml.tomlString(providerOf(active))}`);
    for (const k of MANAGED_KEYS) {
      if (previous[k] !== undefined) out.push(`# previous ${k} = ${toml.tomlString(previous[k])}`);
    }
  }
  for (const p of profiles) {
    const url = baseUrl(p);
    if (!url) continue;
    const k = profileKey(p);
    const c = p.codex || {};
    if (out.length) out.push('');
    out.push(`[model_providers.${toml.tomlKey(k)}]`);
    out.push(`name = ${toml.tomlString(p.name || k)}`);
    out.push(`base_url = ${toml.tomlString(url)}`);
    out.push('wire_api = "responses"');
    if (keyStorage === 'config') {
      if (active && p.id === active.id && token) out.push(`experimental_bearer_token = ${toml.tomlString(token)}`);
    } else if (hasKeyFile(p)) {
      out.push(`auth = ${authFor(p)}`);
    }
    if (c.http_headers && Object.keys(c.http_headers).length) {
      out.push(`http_headers = ${toml.tomlInlineStrings(c.http_headers)}`);
    }
    if (c.query_params && Object.keys(c.query_params).length) {
      out.push(`query_params = ${toml.tomlInlineStrings(c.query_params)}`);
    }
  }
  return out.length ? out.join('\n') : null;
}

// Write the switcher's state into config.toml.
//   profiles  — every Codex profile (each with a Base URL gets a provider table);
//   activate  — undefined: keep whatever is active now (re-applying its current
//               values; if our active profile was removed, restore the user's
//               previous values); an id: make that profile active; null:
//               restore the previous values (the "Codex default" choice);
//   tokenFor  — p → its API key ('' when unknown: a key already on disk for it
//               is kept, so a client without the key doesn't drop it);
//   keyStorage — 'file' (default: key files + auth.command) or 'config'
//               (the active key as experimental_bearer_token);
//   runCodex  — (args, codexHome) → stdout of the `codex` CLI (tests stub it).
// Returns { changed, activeId }. Throws CodexConfigError on conflicts; the file
// is then left untouched.
function syncConfig({ profiles, activate, tokenFor = () => '', keyStorage = 'file', runCodex = codexRunner }) {
  const { text, exists } = readConfig();
  checkConflicts(text, profiles);
  const info = blockInfo(text);
  const curKey = activeKey(text, info);

  let target; // a profile, or 'restore' / 'keep'
  if (activate === null) target = curKey ? 'restore' : 'keep';
  else if (activate) target = profiles.find((p) => p.id === activate) || (curKey ? 'restore' : 'keep');
  else if (curKey) target = profiles.find((p) => profileKey(p) === curKey) || 'restore';
  else target = 'keep';

  // The user's own values: remembered in the block while one of ours is active,
  // captured afresh when taking over from the user's own settings.
  const previous = curKey ? info.previous : typeof target === 'object' ? captureValues(text) : {};

  const active = typeof target === 'object' ? target : null;
  let token = '';
  if (keyStorage === 'config') {
    token = active ? tokenFor(active) || info.tokens[profileKey(active)] || readKeyFileFor(active) : '';
    pruneKeyFiles(null); // keys live in config.toml in this mode
  } else {
    // Refresh each key file from the keys we know (or a key a previous version
    // left in config.toml); unknown keys keep whatever file exists.
    for (const p of profiles) {
      const tk = tokenFor(p) || info.tokens[profileKey(p)] || '';
      if (tk && baseUrl(p)) writeKeyFileFor(p, tk);
    }
    pruneKeyFiles(profiles.filter((p) => baseUrl(p)).map((p) => p.id));
  }
  const body = renderBlock(profiles, { active, token, previous, keyStorage });
  if (!info.present && body === null && target === 'keep') return { changed: false, activeId: null };

  // Lift the block out first: top-level keys go before the first table, and the
  // block's own tables must not count as that table. It goes back at the end.
  let next = toml.setBlock(text, BLOCK_BEGIN, BLOCK_END, null);
  if (target === 'restore') next = applyValues(next, previous);
  else if (active) next = applyValues(next, valuesFor(active, previous));
  next = applyCatalog(next, active, runCodex);
  next = toml.setBlock(next, BLOCK_BEGIN, BLOCK_END, body);

  if (next !== text) writeConfig(next, exists && !info.present);
  syncProfileFiles(profiles);
  return { changed: next !== text, activeId: active ? active.id : null };
}

// Write atomically (temp file + rename), keeping the file's permissions; a new
// file is created owner-only since it may hold an API key. The first time we
// add our block to an existing config, keep a one-time backup of the original.
function writeConfig(text, firstTime) {
  const file = configPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let mode = 0o600;
  try {
    mode = fs.statSync(file).mode & 0o777;
  } catch { /* new file */ }
  if (firstTime && !fs.existsSync(backupPath())) {
    try {
      fs.copyFileSync(file, backupPath());
    } catch { /* best effort */ }
  }
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode });
  fs.renameSync(tmp, file);
}

module.exports = {
  BLOCK_BEGIN,
  BLOCK_END,
  MANAGED_KEYS,
  MODEL_CATALOG_KEY,
  catalogPath,
  setCodexRunner,
  BUILTIN_PROVIDER,
  REASONING_EFFORTS,
  CODEX_HOTKEYS,
  CodexConfigError,
  codexHome,
  configPath,
  backupPath,
  slugify,
  profileKey,
  assignKey,
  baseUrl,
  providerOf,
  isLocalUrl,
  needsKey,
  requestExtra,
  readConfig,
  blockInfo,
  activeKey,
  activeId,
  tokenInConfig,
  renderBlock,
  syncConfig,
  KEY_STORAGE_MODES,
  keyFilePathFor,
  hasKeyFile,
  readKeyFileFor,
  forgetKey,
  profileFilePath,
};
