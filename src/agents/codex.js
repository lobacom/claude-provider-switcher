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
//   experimental_bearer_token = "…"   ← only for the active profile
//   # <<< claude-provider-switcher <<<
//
// A profile without a Base URL uses Codex's built-in `openai` provider (login
// via `codex login`), so it needs no table. A switcher profile counts as active
// while the top-level `model_provider` still equals the one we recorded — a
// hand edit (or another tool) that changes it hands control back to the user.

const fs = require('fs');
const os = require('os');
const path = require('path');
const toml = require('../toml');

const BLOCK_BEGIN = '# >>> claude-provider-switcher: managed block (edit via the extension or claude-providers) >>>';
const BLOCK_END = '# <<< claude-provider-switcher <<<';

// The top-level keys a switch sets (and a reset restores).
const MANAGED_KEYS = ['model_provider', 'model', 'model_reasoning_effort'];
// Codex's built-in provider (ChatGPT login / OpenAI API key via `codex login`).
const BUILTIN_PROVIDER = 'openai';

// Reasoning-effort values Codex accepts for `model_reasoning_effort`.
const REASONING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}
function configPath() {
  return path.join(codexHome(), 'config.toml');
}
function backupPath() {
  return configPath() + '.cps-backup';
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
  return blockInfo(text).tokens[profileKey(p)] || '';
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

function applyValues(text, values) {
  let out = text;
  for (const k of MANAGED_KEYS) {
    out = values[k] !== undefined
      ? toml.setTopLevel(out, k, toml.tomlString(values[k]))
      : toml.removeTopLevel(out, k);
  }
  return out;
}

function renderBlock(profiles, { active, token, previous }) {
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
    if (active && p.id === active.id && token) out.push(`experimental_bearer_token = ${toml.tomlString(token)}`);
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
//   tokenFor  — p → its API key ('' when unknown: an existing key for it in the
//               file is kept, so a client without the key doesn't drop it).
// Returns { changed, activeId }. Throws CodexConfigError on conflicts; the file
// is then left untouched.
function syncConfig({ profiles, activate, tokenFor = () => '' }) {
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
  const token = active ? tokenFor(active) || info.tokens[profileKey(active)] || '' : '';
  const body = renderBlock(profiles, { active, token, previous });
  if (!info.present && body === null && target === 'keep') return { changed: false, activeId: null };

  // Lift the block out first: top-level keys go before the first table, and the
  // block's own tables must not count as that table. It goes back at the end.
  let next = toml.setBlock(text, BLOCK_BEGIN, BLOCK_END, null);
  if (target === 'restore') next = applyValues(next, previous);
  else if (active) next = applyValues(next, valuesFor(active, previous));
  next = toml.setBlock(next, BLOCK_BEGIN, BLOCK_END, body);

  if (next !== text) writeConfig(next, exists && !info.present);
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
  BUILTIN_PROVIDER,
  REASONING_EFFORTS,
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
  readConfig,
  blockInfo,
  activeKey,
  activeId,
  tokenInConfig,
  renderBlock,
  syncConfig,
};
