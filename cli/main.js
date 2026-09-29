// `claude-providers` — the extension's provider switcher as a terminal app.
// An arrow-key menu (no numbered items) over the same profiles VS Code uses:
// switch the `claude` CLI (and/or the VS Code extension), add / edit / delete /
// reorder providers, manage API keys, test connections, check health and change
// the extension's settings — all without VS Code running. It also switches
// Codex (~/.codex/config.toml, read by the `codex` CLI and the Codex extension).
// A few plain subcommands (list / current / use, codex …) cover scripting.

const fs = require('fs');
const os = require('os');
const path = require('path');
const tui = require('./tui');
const jsonc = require('./jsonc');
const { t, setLang } = require('./strings');
const { Store, HOTKEYS, uniqueName, firstFreeBadge } = require('./store');
const { CLAUDE_API_URL, COLOR_CHOICES, MANAGED_ENV_KEYS } = require('../src/constants');
const { keyFilePath } = require('../src/keyfile');
const { probeModelsList, httpProbe, httpProbeResponses, probeHealthy } = require('../src/http');
const codex = require('../src/agents/codex');

const { style } = tui;
let store;

// ---- language -------------------------------------------------------------------
// Same setting as the extension. `auto` follows VS Code's display language
// (the "locale" in ~/.vscode/argv.json), then the system locale.
function resolveLang() {
  const cfg = store.get('language', 'auto');
  if (cfg === 'en' || cfg === 'ru' || cfg === 'zh') return cfg;
  let loc = '';
  try {
    loc = jsonc.parse(fs.readFileSync(path.join(os.homedir(), '.vscode', 'argv.json'), 'utf8')).locale || '';
  } catch { /* no argv.json */ }
  loc = loc || process.env.LC_ALL || process.env.LC_MESSAGES || process.env.LANG || '';
  if (!loc) {
    try {
      loc = Intl.DateTimeFormat().resolvedOptions().locale;
    } catch { /* ignore */ }
  }
  loc = loc.toLowerCase();
  return loc.startsWith('ru') ? 'ru' : loc.startsWith('zh') ? 'zh' : 'en';
}

// ---- shared bits ----------------------------------------------------------------

function badge(p) {
  return p.color && !p.color.startsWith('icon:') ? p.color + ' ' : '';
}
function displayName(p) {
  return badge(p) + p.name;
}
function baseUrl(p) {
  return (p.env && p.env.ANTHROPIC_BASE_URL) || '';
}

// Status line for an env: the matching profile, the Claude default, or custom.
function envStatus(env, idx, profiles) {
  if (idx >= 0) return displayName(profiles[idx]);
  const managed = store.managedKeys();
  return Object.keys(env).some((k) => managed.has(k) && env[k] !== '') ? t('st_custom') : t('st_default');
}

function keyStatus(p) {
  if (!baseUrl(p)) return '';
  if (store.hasStoredToken(p)) return t('key_set');
  return store.token(p) ? t('key_fromEnv') : t('key_missing');
}

function findById(id) {
  store.reload();
  const list = store.profiles();
  const i = list.findIndex((p) => p.id === id);
  return { list, i, p: list[i] };
}

// Apply `fn` to the stored copy of profile `id` and save. If the profile is live
// in the terminal or VS Code and its env changed, re-apply it there so the
// active match doesn't break (as the extension's editor does).
function updateProfile(id, fn) {
  const { list, p } = findById(id);
  if (!p) return;
  const { wasCli, wasVs } = liveIn(id);
  const before = JSON.stringify(p.env || {});
  fn(p);
  store.saveProfiles(list);
  if (JSON.stringify(p.env || {}) !== before) reapply(p, wasCli, wasVs);
}
// Where profile `id` is the active one (the first match, as shown in the list —
// a blank new profile also "matches" an empty env, but isn't the active one).
function liveIn(id) {
  const list = store.profiles();
  const at = (i) => i >= 0 && list[i].id === id;
  return { wasCli: at(store.cliActiveIndex()), wasVs: at(store.vscodeActiveIndex()) };
}
function reapply(p, cli, vs) {
  if (cli) store.applyToCli(p);
  if (vs) store.applyToVsCode(p);
}

const ok = (s) => style.green(s);
const fail = (s) => style.red(s);

// Run an action; turn a thrown error into a red notice line.
function guard(fn) {
  try {
    return fn();
  } catch (e) {
    return fail(t('error', { msg: e.message }));
  }
}

// ---- switching ------------------------------------------------------------------

// Switch `target` ('cli' | 'vscode' | 'both') to profile `p`. A remote provider
// without a known key asks for one first (saved to the shared key file).
// Returns a notice line, or null when cancelled.
async function switchTo(p, target) {
  if (baseUrl(p) && !store.token(p)) {
    const v = await tui.prompt({
      title: t('noKeyTitle', { name: p.name }),
      header: [style.dim(t('keyNote', { path: keyFilePath() }))],
      label: t('noKeyLabel'),
      mask: true,
      footer: t('footer_input'),
    });
    if (v === null) return null;
    if (v.trim()) store.setToken(p.id, v);
  }
  return guard(() => {
    if (target !== 'vscode') store.applyToCli(p);
    if (target !== 'cli') store.applyToVsCode(p);
    const key = target === 'cli' ? 'switchedCli' : target === 'vscode' ? 'switchedVsCode' : 'switchedBoth';
    return ok(t(key, { name: p.name }));
  });
}

// ---- main menu ------------------------------------------------------------------

async function mainMenu() {
  let cursor = 0;
  let notice = [];
  for (;;) {
    store.reload();
    const profiles = store.profiles();
    const cliIdx = store.cliActiveIndex();
    const vsIdx = store.vscodeActiveIndex();
    const header = [
      t('hdr_cli', { name: envStatus(store.cliEnv(), cliIdx, profiles) }),
      t('hdr_vscode', {
        name: fs.existsSync(store.settingsPath) ? envStatus(store.vscodeEnv(), vsIdx, profiles) : t('notFound'),
      }),
    ];
    const showCodex = codexVisible();
    if (showCodex) header.push(t('hdr_codex', { name: codexStatus() }));
    if (store.settingsError) {
      header.push(fail(t('parseError', { path: store.settingsPath, msg: store.settingsError })), t('parseErrorHint'));
    }
    if (store.claudeError) header.push(fail(t('parseError', { path: store.claudePath, msg: store.claudeError })));
    if (profiles.some((p) => baseUrl(p) && !store.token(p)) && store.get('shareKeysWithTerminal') !== true) {
      header.push(style.dim(t('shareHint')));
    }
    header.push(...notice);
    notice = [];

    const items = [{ separator: true, label: t('providersSep') }];
    if (!profiles.length) items.push({ label: t('noProfiles'), disabled: true });
    profiles.forEach((p, i) => {
      const marks = [];
      if (i === cliIdx) marks.push(style.green(t('mark_cli')));
      if (i === vsIdx) marks.push(style.cyan(t('mark_vscode')));
      const where = baseUrl(p) || t('nativeSubscriptionParen');
      const ks = keyStatus(p);
      items.push({
        label: displayName(p),
        hint: [...marks, where, ks === t('key_missing') ? style.yellow(ks) : ''].filter(Boolean).join('  '),
        value: { profile: p.id },
      });
    });
    if (showCodex) items.push(...codexMenuItems());
    items.push(
      { separator: true, label: '' },
      { label: t('menu_add'), value: 'add' },
      ...(showCodex ? [{ label: t('menu_addCodex'), value: 'addCodex' }] : []),
      { label: t('menu_health'), value: 'health', disabled: !profiles.length && !store.codexProfiles().length },
      { label: t('menu_settings'), value: 'settings' },
      { label: t('menu_quit'), value: 'quit' }
    );

    const target = store.pref('enterTarget', 'cli');
    const res = await tui.select({
      title: t('appTitle'),
      header,
      items,
      index: cursor,
      footer: t('footer_main', { target: `(${t(target === 'both' ? 'target_both' : 'target_cli')})` }),
      keys: { right: 'actions' },
    });
    if (!res || res.item.value === 'quit') return;
    cursor = res.index;
    const v = res.item.value;

    if (v && v.codex) {
      const p = store.codexProfiles().find((x) => x.id === v.codex);
      const n = res.action === 'actions' ? await codexMenu(p.id) : await switchCodex(p);
      if (n) notice.push(n);
    } else if (v === 'codexReset') {
      notice.push(resetCodex());
    } else if (v === 'addCodex') {
      const n = await addCodexProvider();
      if (n) notice.push(n);
    } else if (v && v.profile) {
      const p = profiles.find((x) => x.id === v.profile);
      if (res.action === 'actions') {
        const n = await profileMenu(p.id);
        if (n) notice.push(n);
      } else {
        const n = await switchTo(p, target);
        if (n) notice.push(n);
      }
    } else if (v === 'add') {
      const n = await addProvider();
      if (n) notice.push(n);
    } else if (v === 'health') {
      await healthCheck();
    } else if (v === 'settings') {
      await settingsMenu();
    }
  }
}

// ---- Codex ------------------------------------------------------------------------
// Codex profiles (`codexProfiles`) switch ~/.codex/config.toml through the
// module the extension uses (src/agents/codex.js). One file serves both the
// `codex` CLI and the Codex extension, so there's no terminal / VS Code split.

function codexDescribe(p) {
  const c = p.codex || {};
  return [codex.baseUrl(p) || t('codexBuiltin'), c.model].filter(Boolean).join(' · ');
}
function codexStatus() {
  const id = store.codexActiveId();
  const p = store.codexProfiles().find((x) => x.id === id);
  return p ? displayName(p) : t('codex_default');
}
// The Codex section shows once Codex is installed (its home exists) or there
// are Codex profiles.
function codexVisible() {
  return store.codexProfiles().length > 0 || fs.existsSync(codex.codexHome());
}
function codexMenuItems() {
  const active = store.codexActiveId();
  const list = store.codexProfiles();
  const items = [{ separator: true, label: t('codexSep') }];
  if (!list.length) items.push({ label: t('noCodexProfiles'), disabled: true });
  for (const p of list) {
    const missing = codex.needsKey(p) && !store.codexToken(p);
    items.push({
      label: displayName(p),
      hint: [p.id === active ? style.green(t('mark_codex')) : '', codexDescribe(p), missing ? style.yellow(t('key_missing')) : '']
        .filter(Boolean).join('  '),
      value: { codex: p.id },
    });
  }
  if (active) items.push({ label: t('menu_codexReset'), value: 'codexReset' });
  return items;
}

// Run a config.toml write; turn a thrown error into a red notice line.
function guardCodex(fn) {
  try {
    return fn();
  } catch (e) {
    if (e && ['inlineTable', 'conflict', 'valueType'].includes(e.code)) {
      return fail(t(`codexErr_${e.code}`, { path: codex.configPath(), detail: e.detail }));
    }
    return fail(t('error', { msg: e.message }));
  }
}

async function switchCodex(p) {
  if (codex.needsKey(p) && !store.codexToken(p)) {
    const v = await tui.prompt({
      title: t('noKeyTitle', { name: p.name }),
      header: [style.dim(t('keyNote', { path: keyFilePath() }))],
      label: t('noKeyLabel'),
      mask: true,
      footer: t('footer_input'),
    });
    if (v === null) return null;
    if (v.trim()) store.setToken(p.id, v);
  }
  // Same setting as the extension: probe first and follow the fallback chain.
  if (store.get('autoFallbackOnApply') === true) return codexWithFallback(p);
  return guardCodex(() => {
    store.syncCodex(p.id);
    return ok(t('switchedCodex', { name: p.name }));
  });
}

// A tiny POST <base_url>/responses — proves the endpoint and the key.
function codexProbe(p) {
  return httpProbeResponses(codex.baseUrl(p), store.codexToken(p), (p.codex || {}).model, codex.requestExtra(p));
}

// Probe `startP`, walk its fallback chain and switch to the first provider that
// answers (the built-in OpenAI provider counts as up). Returns a notice line.
async function codexWithFallback(startP) {
  const list = store.codexProfiles();
  const chain = [];
  const seen = new Set();
  for (let p = startP; p && !seen.has(p.id); p = p.fallbackId ? list.find((x) => x.id === p.fallbackId) : null) {
    seen.add(p.id);
    chain.push(p);
  }
  const skipped = [];
  for (const cand of chain) {
    const healthy = !codex.baseUrl(cand) ||
      probeHealthy(await tui.busy(displayName(cand), t('checking', { name: cand.name }), codexProbe(cand)));
    if (healthy) {
      const err = guardCodex(() => {
        store.syncCodex(cand.id);
        return '';
      });
      if (err) return err;
      // one notice line: the fall-back message already names where we ended up
      return skipped.length
        ? style.yellow(t('fellBack', { skipped: skipped.join(', '), name: cand.name }))
        : ok(t('switchedCodex', { name: cand.name }));
    }
    skipped.push(`"${cand.name}"`);
  }
  guardCodex(() => store.syncCodex(startP.id));
  return fail(skipped.length > 1
    ? t('noReachableChain', { chain: skipped.join(' → '), name: startP.name })
    : t('unreachableNoFallback', { name: startP.name }));
}

async function testCodexConnection(p) {
  const r = await tui.busy(displayName(p), t('testing', { name: p.name }), codexProbe(p));
  let line;
  if (r.kind === 'error') line = fail(t('testUnreachable', { name: p.name, msg: r.msg }));
  else if (r.status === 200) line = ok(t('testConnected', { name: p.name }));
  else if (r.status === 401 || r.status === 403) line = fail(t('testAuthFailed', { name: p.name, s: r.status }));
  else if (r.status === 404) line = fail(t('testNotFound', { name: p.name }));
  else if (r.status === 400) line = ok(t('test400', { name: p.name }));
  else if (r.status === 429) line = style.yellow(t('test429', { name: p.name }));
  else line = style.yellow(t('testOther', { name: p.name, s: r.status }));
  await tui.message({ title: displayName(p), lines: [line], footer: t('footer_msg') });
}

// ---- Codex profile editor ---------------------------------------------------------

const CODEX_FIELDS = [
  { key: 'name', label: 'field_name' },
  { key: 'color', label: 'field_badge' },
  { key: 'hotkey', label: 'field_codexHotkey' },
  { key: 'fallback', label: 'field_fallback' },
  { key: 'base_url', label: 'field_codexBaseUrl' },
  { key: 'token', label: 'field_codexKey' },
  { key: 'model', label: 'field_codexModel' },
  { key: 'reasoning_effort', label: 'field_codexEffort' },
  { key: 'http_headers', label: 'field_codexHeaders', map: true },
  { key: 'query_params', label: 'field_codexQuery', map: true },
];

function codexFieldValue(p, key, list) {
  const c = p.codex || {};
  if (key === 'name') return p.name || '';
  if (key === 'color') return p.color || '';
  if (key === 'hotkey') return p.hotkey || '';
  if (key === 'fallback') {
    if (!p.fallbackId) return '';
    const tgt = list.find((x) => x.id === p.fallbackId);
    return tgt ? tgt.name : t('missing');
  }
  if (key === 'base_url') return c.base_url || t('codexBuiltin');
  if (key === 'token') return !codex.needsKey(p) ? t('codexKeyNotNeeded') : store.codexToken(p) ? '••••••••' : '';
  if (key === 'model' || key === 'reasoning_effort') return c[key] || t('tip_codexModelDefault');
  const n = Object.keys(c[key] || {}).length;
  return n ? t('extraEnvCount', { n }) : '';
}

// Save a change to Codex profile `id` and rewrite config.toml (re-applying the
// profile when it is the active one). Returns a notice line, '' when fine.
function saveCodexChange(id, fn) {
  return guardCodex(() => {
    updateCodexProfile(id, (x) => {
      x.codex = { ...(x.codex || {}) };
      fn(x);
    });
    store.syncCodex(undefined);
    return '';
  });
}

async function editCodexProfile(id) {
  let cursor = 0;
  let notice = [];
  for (;;) {
    store.reload();
    const list = store.codexProfiles();
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const items = CODEX_FIELDS.map((f) => ({ label: t(f.label), hint: codexFieldValue(p, f.key, list) || t('empty'), value: f }));
    items.push({ separator: true, label: '' }, { label: t('done'), value: 'done' });
    const res = await tui.select({ title: t('editingPlaceholder', { name: p.name }), header: notice, items, index: cursor, footer: t('footer_menu') });
    notice = [];
    if (!res || res.item.value === 'done') return;
    cursor = res.index;
    const n = await editCodexField(p, res.item.value, list);
    if (n) notice.push(n);
  }
}

async function editCodexField(p, f, list) {
  const title = `${p.name} — ${t(f.label)}`;
  const pick = async (items, cur) => {
    const idx = items.findIndex((x) => x.value === cur);
    const r = await tui.select({ title, items, index: Math.max(0, idx), footer: t('footer_menu') });
    return r ? r.item.value : undefined;
  };
  const c = p.codex || {};
  if (f.key === 'name') {
    const v = await tui.prompt({ title, label: t(f.label), value: p.name, footer: t('footer_input') });
    if (v !== null && v.trim()) return saveCodexChange(p.id, (x) => { x.name = v.trim(); });
  } else if (f.key === 'color') {
    const v = await pick(COLOR_CHOICES.map((cc) => ({
      label: cc.none ? t('noneLabel') : `${cc.value}  ${t('color_' + cc.color)}${cc.shape ? t('color_join') + t('shape_' + cc.shape) : ''}`,
      hint: cc.value === (p.color || '') ? t('current') : '',
      value: cc.value,
    })), p.color || '');
    if (v !== undefined) return saveCodexChange(p.id, (x) => { x.color = v; });
  } else if (f.key === 'hotkey') {
    const used = new Set(list.filter((x) => x.id !== p.id).map((x) => x.hotkey).filter(Boolean));
    const v = await pick([
      ...codex.CODEX_HOTKEYS.filter((h) => !used.has(h)).map((h) => ({ label: `⌨ ${h}`, hint: h === p.hotkey ? t('current') : t('free'), value: h })),
      { label: t('noneLabel'), value: '' },
    ], p.hotkey || '');
    if (v !== undefined) return saveCodexChange(p.id, (x) => { if (v) x.hotkey = v; else delete x.hotkey; });
  } else if (f.key === 'fallback') {
    const v = await pick([
      { label: t('noneLabel'), value: '' },
      { separator: true, label: t('codexSep') },
      ...list.filter((x) => x.id !== p.id).map((x) => ({
        label: displayName(x),
        hint: (x.id === p.fallbackId ? t('current') + '  ' : '') + codexDescribe(x),
        value: x.id,
      })),
    ], p.fallbackId || '');
    if (v !== undefined) return saveCodexChange(p.id, (x) => { if (v) x.fallbackId = v; else delete x.fallbackId; });
  } else if (f.key === 'base_url') {
    const v = await tui.prompt({
      title,
      label: t('codexBaseUrlPromptEdit'),
      value: c.base_url || '',
      placeholder: 'https://host/v1',
      validate: (s) => (!s.trim() || /^https?:\/\/\S+$/i.test(s.trim()) ? '' : t('codexBaseUrlInvalid')),
      footer: t('footer_input'),
    });
    if (v !== null) {
      return saveCodexChange(p.id, (x) => {
        const u = v.trim().replace(/\/+$/, '');
        if (u) x.codex.base_url = u;
        else delete x.codex.base_url;
      });
    }
  } else if (f.key === 'token') {
    if (!codex.needsKey(p)) return '';
    const v = await tui.prompt({
      title,
      header: [style.dim(t('keyNote', { path: keyFilePath() }))],
      label: t('keyLabel', { name: p.name }),
      value: store.codexToken(p),
      mask: true,
      footer: t('footer_input'),
    });
    if (v !== null) {
      return guardCodex(() => {
        store.setToken(p.id, v);
        if (!v.trim()) codex.forgetKey(p);
        store.syncCodex(undefined);
        return ok(t(v.trim() ? 'keySaved' : 'keyRemoved', { name: p.name }));
      });
    }
  } else if (f.key === 'model') {
    const m = await pickCodexModel(p, store.codexToken(p));
    if (m !== null) return saveCodexChange(p.id, (x) => { if (m) x.codex.model = m; else delete x.codex.model; });
  } else if (f.key === 'reasoning_effort') {
    const v = await pick([
      { label: t('tip_codexModelDefault'), value: '' },
      ...codex.REASONING_EFFORTS.map((e) => ({ label: e, hint: e === c.reasoning_effort ? t('current') : '', value: e })),
    ], c.reasoning_effort || '');
    if (v !== undefined) return saveCodexChange(p.id, (x) => { if (v) x.codex.reasoning_effort = v; else delete x.codex.reasoning_effort; });
  } else if (f.map) {
    await editCodexMap(p.id, f);
  }
  return '';
}

// add / edit / clear entries of http_headers or query_params
async function editCodexMap(id, f) {
  for (;;) {
    store.reload();
    const p = store.codexProfiles().find((x) => x.id === id);
    if (!p) return;
    const map = (p.codex && p.codex[f.key]) || {};
    const items = [
      { label: t('mapAdd'), value: { add: true } },
      ...Object.keys(map).sort().map((k) => ({ label: k, hint: String(map[k]), value: { key: k } })),
      { separator: true, label: '' },
      { label: t('done'), value: 'done' },
    ];
    const res = await tui.select({ title: t('mapPlaceholder', { label: t(f.label), name: p.name }), items, footer: t('footer_menu') });
    if (!res || res.item.value === 'done') return;
    let key = res.item.value.key;
    if (res.item.value.add) {
      key = await tui.prompt({
        title: p.name,
        label: t('mapKeyPrompt'),
        validate: (v) => (/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(v.trim()) ? '' : t('mapKeyInvalid')),
        footer: t('footer_input'),
      });
      if (key === null) continue;
      key = key.trim();
    }
    const value = await tui.prompt({ title: p.name, label: t('mapValuePrompt', { key }), value: map[key] || '', footer: t('footer_input') });
    if (value === null) continue;
    saveCodexChange(id, (x) => {
      const m = { ...(x.codex[f.key] || {}) };
      if (value === '') delete m[key];
      else m[key] = value;
      if (Object.keys(m).length) x.codex[f.key] = m;
      else delete x.codex[f.key];
    });
  }
}

function resetCodex() {
  return guardCodex(() => {
    store.syncCodex(null);
    return ok(t('codexResetDone'));
  });
}

function updateCodexProfile(id, fn) {
  store.reload();
  const list = store.codexProfiles();
  const x = list.find((p) => p.id === id);
  if (!x) return;
  fn(x);
  store.saveCodexProfiles(list);
}

// Pick a model from the endpoint's list, or type it. '' = Codex's default;
// null = cancelled.
async function pickCodexModel(p, token) {
  const cur = (p.codex && p.codex.model) || '';
  const title = `${p.name} — ${t('act_model')}`;
  const manual = async (header) => {
    const v = await tui.prompt({
      title,
      header,
      label: t('codexModelPrompt', { name: p.name }),
      value: cur,
      footer: t('footer_input'),
    });
    return v === null ? null : v.trim();
  };
  const url = codex.baseUrl(p);
  if (!url) return manual();
  const r = await tui.busy(title, t('fetchingModels', { name: p.name }), probeModelsList(url, token, codex.requestExtra(p)));
  if (!r.ok || !r.models.length) {
    const reason = !r.reachable ? t('reason_unreachable')
      : r.auth ? t('reason_auth')
        : r.serverError ? t('reason_serverError') : t('reason_noList');
    return manual([style.yellow(t('couldntListModels', { reason }))]);
  }
  const items = [
    { label: t('enterManually'), value: { manual: true } },
    { label: t('codexNoModel'), value: { v: '' } },
    { separator: true, label: t('modelsCount', { n: r.models.length }) },
    ...r.models.map((id) => ({ label: id, hint: id === cur ? t('current') : '', value: { v: id } })),
  ];
  const idx = cur ? items.findIndex((x) => x.value && x.value.v === cur) : -1;
  const res = await tui.select({ title, items, index: idx >= 0 ? idx : 0, footer: t('footer_menu') });
  if (!res) return null;
  return res.item.value.manual ? manual() : res.item.value.v;
}

function bundledCodexPresets() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'providers.json'), 'utf8'));
    const c = j.codex || {};
    const out = { remote: [...(c.remote || [])], local: [...(c.local || [])] };
    // plus custom providers that carry a Codex Base URL
    const list = store.get('customProviders', []);
    for (const x of Array.isArray(list) ? list : []) {
      const url = x && typeof x.codexBaseUrl === 'string' && x.codexBaseUrl.trim();
      if (!url || typeof x.name !== 'string' || !x.name.trim()) continue;
      (x.local ? out.local : out.remote).push({ name: x.name.trim(), codex: { base_url: url }, custom: true });
    }
    return out;
  } catch {
    return { remote: [], local: [] };
  }
}

async function addCodexProvider() {
  const b = bundledCodexPresets();
  const preset = (pr) => ({
    label: pr.name,
    hint: ((pr.codex && pr.codex.base_url) || '') + (pr.custom ? `  ${t('customTag')}` : ''),
    value: { name: pr.name, codex: { ...(pr.codex || {}) } },
  });
  const items = [
    { label: t('customLabel'), hint: t('codexCustomDesc'), value: { name: 'Custom', codex: {}, custom: true } },
    { separator: true, label: t('codexSepBuiltin') },
    { label: t('codexBuiltin'), hint: t('codexBuiltinDesc'), value: { name: 'OpenAI', codex: {} } },
    { separator: true, label: t('codexSepRemote') },
    ...b.remote.map(preset),
    { separator: true, label: t('sepLocal') },
    ...b.local.map(preset),
  ];
  const res = await tui.select({ title: t('codexAddPlaceholder'), items, footer: t('footer_menu') });
  if (!res) return null;
  const tpl = res.item.value;
  const list = store.codexProfiles();
  const p = {
    id: require('crypto').randomUUID(),
    name: uniqueName(tpl.name, list),
    color: firstFreeBadge(list),
    codex: tpl.codex,
  };
  if (tpl.custom) {
    const url = await tui.prompt({
      title: t('codexAddPlaceholder'),
      label: t('codexBaseUrlPrompt'),
      placeholder: 'https://host/v1',
      validate: (v) => (/^https?:\/\/\S+$/i.test(v.trim()) ? '' : t('codexBaseUrlInvalid')),
      footer: t('footer_input'),
    });
    if (url === null) return null;
    p.codex.base_url = url.trim().replace(/\/+$/, '');
  }
  let token = '';
  if (codex.needsKey(p)) {
    const v = await tui.prompt({
      title: p.name,
      header: [style.dim(t('keyNote', { path: keyFilePath() }))],
      label: t('keyLabel', { name: p.name }),
      mask: true,
      footer: t('footer_input'),
    });
    if (v === null) return null;
    token = v.trim();
  }
  const model = await pickCodexModel(p, token);
  if (model === null) return null;
  if (model) p.codex.model = model;
  return guardCodex(() => {
    codex.assignKey(p, list);
    const used = new Set(list.map((x) => x.hotkey).filter(Boolean));
    const hk = codex.CODEX_HOTKEYS.find((h) => !used.has(h));
    if (hk) p.hotkey = hk; // next free Ctrl+Shift+Alt+<n>, as in the extension
    list.push(p);
    store.saveCodexProfiles(list);
    if (token) store.setToken(p.id, token);
    store.syncCodex(undefined);
    return ok(t('added', { name: p.name }));
  });
}

async function codexMenu(id) {
  let cursor = 0;
  let notice = [];
  for (;;) {
    store.reload();
    const list = store.codexProfiles();
    const p = list.find((x) => x.id === id);
    if (!p) return null;
    const needs = codex.needsKey(p);
    const i = list.indexOf(p);
    const items = [
      { label: t('act_switchCodex'), value: 'switch' },
      { label: t('act_switchFallback'), hint: p.fallbackId ? '' : t('noFallbackSet'), value: 'fallback' },
      { separator: true, label: '' },
      { label: t('act_edit'), value: 'edit' },
      { label: t('act_model'), hint: (p.codex && p.codex.model) || t('tip_codexModelDefault'), value: 'model' },
      { label: t('act_key'), hint: needs ? (store.codexToken(p) ? t('key_set') : t('key_missing')) : '', value: 'key', disabled: !needs },
      { label: t('act_test'), value: 'test', disabled: !codex.baseUrl(p) },
      { label: t('act_duplicate'), value: 'duplicate' },
      { label: t('act_moveUp'), value: 'up', disabled: i === 0 },
      { label: t('act_moveDown'), value: 'down', disabled: i === list.length - 1 },
      { label: t('act_delete'), value: 'delete' },
      { separator: true, label: '' },
      { label: t('back'), value: 'back' },
    ];
    const res = await tui.select({
      title: displayName(p),
      header: [style.dim(codexDescribe(p)), ...notice],
      items,
      index: cursor,
      footer: t('footer_menu'),
    });
    notice = [];
    if (!res || res.item.value === 'back') return null;
    cursor = res.index;
    const a = res.item.value;

    if (a === 'switch') {
      const n = await switchCodex(p);
      if (n) return n;
    } else if (a === 'fallback') {
      return codexWithFallback(p);
    } else if (a === 'edit') {
      await editCodexProfile(id);
    } else if (a === 'test') {
      await testCodexConnection(p);
    } else if (a === 'duplicate') {
      notice.push(guardCodex(() => {
        const copy = JSON.parse(JSON.stringify(p));
        copy.id = require('crypto').randomUUID();
        copy.name = uniqueName(p.name + t('copySuffix'), list);
        delete copy.key; // its own name in config.toml
        delete copy.hotkey;
        codex.assignKey(copy, list);
        list.splice(i + 1, 0, copy);
        store.saveCodexProfiles(list);
        if (store.hasStoredToken(p)) store.setToken(copy.id, store.codexToken(p));
        store.syncCodex(undefined);
        return ok(t('duplicated', { name: p.name }));
      }));
    } else if (a === 'up' || a === 'down') {
      const j = i + (a === 'up' ? -1 : 1);
      notice.push(guardCodex(() => {
        [list[i], list[j]] = [list[j], list[i]];
        store.saveCodexProfiles(list);
        cursor = items.findIndex((x) => x.value === a);
        return '';
      }));
    } else if (a === 'model') {
      const m = await pickCodexModel(p, store.codexToken(p));
      if (m !== null) {
        notice.push(guardCodex(() => {
          updateCodexProfile(id, (x) => {
            x.codex = { ...(x.codex || {}) };
            if (m) x.codex.model = m;
            else delete x.codex.model;
          });
          store.syncCodex(undefined); // re-applies it when this profile is active
          return ok(t('codexModelSet', { name: p.name, model: m || t('tip_codexModelDefault') }));
        }));
      }
    } else if (a === 'key') {
      const v = await tui.prompt({
        title: displayName(p),
        header: [style.dim(t('keyNote', { path: keyFilePath() }))],
        label: t('keyLabel', { name: p.name }),
        value: store.codexToken(p),
        mask: true,
        footer: t('footer_input'),
      });
      if (v !== null) {
        notice.push(guardCodex(() => {
          store.setToken(p.id, v);
          if (!v.trim()) codex.forgetKey(p); // an empty key removes it for Codex too
          store.syncCodex(undefined);
          return ok(t(v.trim() ? 'keySaved' : 'keyRemoved', { name: p.name }));
        }));
      }
    } else if (a === 'delete') {
      const yes = await tui.select({
        title: t('deleteConfirm', { name: p.name }),
        items: [{ label: t('cancel'), value: false }, { label: t('deleteBtn'), value: true }],
        footer: t('footer_menu'),
      });
      if (yes && yes.item.value) {
        return guardCodex(() => {
          store.saveCodexProfiles(list.filter((x) => x.id !== id));
          if (store.hasStoredToken(p)) store.setToken(id, '');
          store.syncCodex(undefined); // the active one is gone → the user's own settings return
          return ok(t('deleted', { name: p.name }));
        });
      }
    }
  }
}

// ---- per-provider actions -------------------------------------------------------

async function profileMenu(id) {
  let cursor = 0;
  let notice = [];
  for (;;) {
    const { list, i, p } = findById(id);
    if (!p) return null;
    const header = [
      style.dim(baseUrl(p) || t('nativeSubscriptionParen')),
      ...notice,
    ];
    notice = [];
    const items = [
      { label: t('act_switchCli'), value: 'cli' },
      { label: t('act_switchVsCode'), value: 'vscode' },
      { label: t('act_switchBoth'), value: 'both' },
      { separator: true, label: '' },
      { label: t('act_edit'), value: 'edit' },
      { label: t('act_key'), hint: keyStatus(p), value: 'key', disabled: !baseUrl(p) },
      { label: t('act_test'), value: 'test', disabled: !baseUrl(p) },
      { label: t('act_duplicate'), value: 'duplicate' },
      { label: t('act_moveUp'), value: 'up', disabled: i === 0 },
      { label: t('act_moveDown'), value: 'down', disabled: i === list.length - 1 },
      { label: t('act_delete'), value: 'delete' },
      { separator: true, label: '' },
      { label: t('back'), value: 'back' },
    ];
    const res = await tui.select({ title: displayName(p), header, items, index: cursor, footer: t('footer_menu') });
    if (!res || res.item.value === 'back') return null;
    cursor = res.index;
    const a = res.item.value;

    if (a === 'cli' || a === 'vscode' || a === 'both') {
      const n = await switchTo(p, a);
      if (n) return n;
    } else if (a === 'edit') {
      await editProfile(id);
    } else if (a === 'key') {
      const n = await editKey(p);
      if (n) notice.push(n);
    } else if (a === 'test') {
      await testConnection(p);
    } else if (a === 'duplicate') {
      notice.push(guard(() => {
        const copy = JSON.parse(JSON.stringify(p));
        copy.id = require('crypto').randomUUID();
        copy.name = uniqueName(p.name + t('copySuffix'), list);
        delete copy.hotkey;
        list.splice(i + 1, 0, copy);
        store.saveProfiles(list);
        if (store.token(p)) store.setToken(copy.id, store.token(p));
        return ok(t('duplicated', { name: p.name }));
      }));
    } else if (a === 'up' || a === 'down') {
      const j = i + (a === 'up' ? -1 : 1);
      notice.push(guard(() => {
        [list[i], list[j]] = [list[j], list[i]];
        store.saveProfiles(list);
        cursor = items.findIndex((x) => x.value === a);
        return '';
      }));
    } else if (a === 'delete') {
      const yes = await tui.select({
        title: t('deleteConfirm', { name: p.name }),
        items: [{ label: t('cancel'), value: false }, { label: t('deleteBtn'), value: true }],
        footer: t('footer_menu'),
      });
      if (yes && yes.item.value) {
        return guard(() => {
          list.splice(i, 1);
          for (const x of list) if (x.fallbackId === id) delete x.fallbackId;
          store.saveProfiles(list);
          if (store.hasStoredToken(p)) store.setToken(id, '');
          return ok(t('deleted', { name: p.name }));
        });
      }
    }
    notice = notice.filter(Boolean);
  }
}

async function editKey(p) {
  const v = await tui.prompt({
    title: displayName(p),
    header: [style.dim(t('keyNote', { path: keyFilePath() }))],
    label: t('keyLabel', { name: p.name }),
    value: store.token(p),
    mask: true,
    footer: t('footer_input'),
  });
  if (v === null) return null;
  return guard(() => {
    const { wasCli, wasVs } = liveIn(p.id);
    store.setToken(p.id, v);
    reapply(p, wasCli, wasVs);
    return ok(t(v.trim() ? 'keySaved' : 'keyRemoved', { name: p.name }));
  });
}

// A real 1-token /v1/messages request — verifies the key too.
async function testConnection(p) {
  const env = p.env || {};
  const model = env.ANTHROPIC_DEFAULT_HAIKU_MODEL || env.ANTHROPIC_DEFAULT_SONNET_MODEL || env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  const r = await tui.busy(displayName(p), t('testing', { name: p.name }), httpProbe(baseUrl(p), store.token(p), model));
  let line;
  if (r.kind === 'error') line = fail(t('testUnreachable', { name: p.name, msg: r.msg }));
  else if (r.status === 200) line = ok(t('testConnected', { name: p.name }));
  else if (r.status === 401 || r.status === 403) line = fail(t('testAuthFailed', { name: p.name, s: r.status }));
  else if (r.status === 404) line = fail(t('testNotFound', { name: p.name }));
  else if (r.status === 400) line = ok(t('test400', { name: p.name }));
  else if (r.status === 429) line = style.yellow(t('test429', { name: p.name }));
  else line = style.yellow(t('testOther', { name: p.name, s: r.status }));
  await tui.message({ title: displayName(p), lines: [line], footer: t('footer_msg') });
}

// Token-free reachability check (GET /v1/models & friends), as the extension's
// health indicator does.
async function checkOneHealth(p) {
  if (!baseUrl(p)) return 'ok';
  const r = await probeModelsList(baseUrl(p), store.token(p));
  if (r.ok) return 'ok';
  if (!r.reachable || r.auth || r.serverError) return 'down';
  return 'ok';
}
// The same verdict for a Codex profile (the built-in OpenAI provider counts as up).
async function checkOneCodexHealth(p) {
  const url = codex.baseUrl(p);
  if (!url) return 'ok';
  const r = await probeModelsList(url, store.codexToken(p), codex.requestExtra(p));
  if (r.ok) return 'ok';
  if (!r.reachable || r.auth || r.serverError) return 'down';
  return 'ok';
}
async function healthCheck() {
  const claude = store.profiles();
  const profiles = [...claude, ...store.codexProfiles()];
  const res = await tui.busy(t('healthTitle'), t('checkingHealth'), Promise.all(
    profiles.map((p, i) => (i < claude.length ? checkOneHealth(p) : checkOneCodexHealth(p)))
  ));
  const lines = profiles.map((p, i) =>
    `${res[i] === 'ok' ? t('health_reachable') : style.red(t('health_unreachable'))}   ${displayName(p)}`
  );
  const down = res.filter((s) => s !== 'ok').length;
  lines.push('', down
    ? style.yellow(t('healthSomeDown', {
      n: down,
      total: profiles.length,
      list: profiles.filter((_, i) => res[i] !== 'ok').map((p) => p.name).join(', '),
    }))
    : ok(t('healthAllOk', { total: profiles.length })));
  await tui.message({ title: t('healthTitle'), lines, footer: t('footer_msg') });
}

// ---- add provider ---------------------------------------------------------------

function bundledPresets() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'providers.json'), 'utf8'));
    return { remote: j.remote || [], local: j.local || [] };
  } catch {
    return { remote: [], local: [] };
  }
}
// User-defined `customProviders` entries, in the { name, env } template shape.
function customPresets() {
  const out = { remote: [], local: [] };
  const list = store.get('customProviders', []);
  if (!Array.isArray(list)) return out;
  for (const c of list) {
    if (!c || typeof c.name !== 'string' || !c.name.trim()) continue;
    if (c.codexBaseUrl && String(c.codexBaseUrl).trim() && !(c.baseUrl && String(c.baseUrl).trim())) continue; // Codex-only row
    const env = {};
    if (c.baseUrl && String(c.baseUrl).trim()) env.ANTHROPIC_BASE_URL = String(c.baseUrl).trim();
    if (c.opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = String(c.opusModel);
    if (c.sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = String(c.sonnetModel);
    if (c.haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = String(c.haikuModel);
    (c.local ? out.local : out.remote).push({ name: c.name.trim(), env, custom: true });
  }
  return out;
}

async function addProvider() {
  const b = bundledPresets();
  const c = customPresets();
  const preset = (pr) => ({
    label: pr.name,
    hint: ((pr.env && pr.env.ANTHROPIC_BASE_URL) || '') + (pr.custom ? `  ${t('customTag')}` : ''),
    value: { name: pr.name, env: pr.env || {} },
  });
  const items = [
    { label: t('customLabel'), hint: t('customDesc'), value: { name: 'Custom', env: {} } },
    { separator: true, label: t('sepAnthropic') },
    { label: t('claudeSub'), hint: t('claudeSubDesc'), value: { name: 'Claude Subscription', env: {} } },
    {
      label: t('claudeApi'),
      hint: t('claudeApiDesc', { url: CLAUDE_API_URL }),
      value: { name: 'Claude API', env: { ANTHROPIC_BASE_URL: CLAUDE_API_URL } },
    },
    { separator: true, label: t('sepCompatible') },
    ...[...b.remote, ...c.remote].map(preset),
    { separator: true, label: t('sepLocal') },
    ...[...b.local, ...c.local].map(preset),
  ];
  const res = await tui.select({ title: t('addMenuPlaceholder'), items, footer: t('footer_menu') });
  if (!res) return null;
  let created;
  const n = guard(() => {
    const { profile, presetToken } = store.newProfile(res.item.value);
    const list = store.profiles();
    list.push(profile);
    store.saveProfiles(list);
    if (presetToken) store.setToken(profile.id, presetToken);
    created = profile;
    return ok(t('added', { name: profile.name }));
  });
  if (created) await editProfile(created.id);
  return n;
}

// ---- profile editor -------------------------------------------------------------

const FIELDS = [
  { key: '__name', label: 'field_name' },
  { key: '__color', label: 'field_badge' },
  { key: '__hotkey', label: 'field_hotkey' },
  { key: '__fallback', label: 'field_fallback' },
  { key: 'ANTHROPIC_BASE_URL', label: 'field_baseUrl' },
  { key: '__token', label: 'field_token' },
  { key: 'ANTHROPIC_DEFAULT_FABLE_MODEL', label: 'field_fable', model: true },
  { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', label: 'field_opus', model: true },
  { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', label: 'field_sonnet', model: true },
  { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', label: 'field_haiku', model: true },
  { key: 'API_TIMEOUT_MS', label: 'field_timeout' },
  { key: '__extraEnv', label: 'field_extraEnv' },
];

function extraEnvKeys(p) {
  return Object.keys(p.env || {}).filter((k) => !MANAGED_ENV_KEYS.includes(k)).sort();
}

function fieldValue(p, key, list) {
  if (key === '__name') return p.name || '';
  if (key === '__color') return p.color || '';
  if (key === '__hotkey') return p.hotkey || '';
  if (key === '__fallback') {
    if (!p.fallbackId) return '';
    const tgt = list.find((x) => x.id === p.fallbackId);
    return tgt ? tgt.name : t('missing');
  }
  if (key === '__token') return store.token(p) ? '••••••••' : '';
  if (key === '__extraEnv') {
    const n = extraEnvKeys(p).length;
    return n ? t('extraEnvCount', { n }) : '';
  }
  return (p.env && p.env[key]) || '';
}

async function editProfile(id) {
  let cursor = 0;
  for (;;) {
    const { list, p } = findById(id);
    if (!p) return;
    const items = FIELDS.map((f) => ({
      label: t(f.label),
      hint: fieldValue(p, f.key, list) || t('empty'),
      value: f,
    }));
    items.push({ separator: true, label: '' }, { label: t('done'), value: 'done' });
    const res = await tui.select({
      title: t('editingPlaceholder', { name: p.name }),
      items,
      index: cursor,
      footer: t('footer_menu'),
    });
    if (!res || res.item.value === 'done') return;
    cursor = res.index;
    const f = res.item.value;
    try {
      await editField(p, f, list);
    } catch (e) {
      await tui.message({ title: p.name, lines: [fail(t('error', { msg: e.message }))], footer: t('footer_msg') });
    }
  }
}

async function editField(p, f, list) {
  const title = `${p.name} — ${t(f.label)}`;
  const pick = async (items, cur) => {
    const idx = items.findIndex((x) => x.value === cur);
    const r = await tui.select({ title, items, index: Math.max(0, idx), footer: t('footer_menu') });
    return r ? r.item.value : undefined;
  };
  const text = async (value, extra = {}) =>
    tui.prompt({ title, label: t(f.label), value, footer: t('footer_input'), ...extra });

  if (f.key === '__color') {
    const v = await pick(
      COLOR_CHOICES.map((c) => ({
        label: c.none
          ? t('noneLabel')
          : `${c.value}  ${t('color_' + c.color)}${c.shape ? t('color_join') + t('shape_' + c.shape) : ''}`,
        hint: c.value === (p.color || '') ? t('current') : '',
        value: c.value,
      })),
      p.color || ''
    );
    if (v !== undefined) updateProfile(p.id, (x) => { x.color = v; });
  } else if (f.key === '__hotkey') {
    const used = new Set(list.filter((x) => x.id !== p.id).map((x) => x.hotkey).filter(Boolean));
    const v = await pick(
      [
        ...HOTKEYS.filter((h) => !used.has(h)).map((h) => ({
          label: `⌨ ${h}`,
          hint: h === p.hotkey ? t('current') : t('free'),
          value: h,
        })),
        { label: t('noneLabel'), value: '' },
      ],
      p.hotkey || ''
    );
    if (v !== undefined) updateProfile(p.id, (x) => { if (v) x.hotkey = v; else delete x.hotkey; });
  } else if (f.key === '__fallback') {
    const v = await pick(
      [
        { label: t('noneLabel'), value: '' },
        { separator: true, label: t('providersSep') },
        ...list.filter((x) => x.id !== p.id).map((x) => ({
          label: displayName(x),
          hint: (x.id === p.fallbackId ? t('current') + '  ' : '') + (baseUrl(x) || t('nativeSubscriptionParen')),
          value: x.id,
        })),
      ],
      p.fallbackId || ''
    );
    if (v !== undefined) updateProfile(p.id, (x) => { if (v) x.fallbackId = v; else delete x.fallbackId; });
  } else if (f.key === '__token') {
    await editKey(p);
  } else if (f.key === '__extraEnv') {
    await editExtraEnv(p.id);
  } else if (f.model) {
    const v = await pickModel(p, f);
    if (v !== null) setEnv(p.id, f.key, v);
  } else if (f.key === '__name') {
    const v = await text(p.name);
    if (v !== null && v.trim()) updateProfile(p.id, (x) => { x.name = v.trim(); });
  } else {
    const v = await text((p.env && p.env[f.key]) || '');
    if (v !== null) setEnv(p.id, f.key, v.trim());
  }
}

function setEnv(id, key, value) {
  updateProfile(id, (x) => {
    x.env = x.env || {};
    if (value === '') delete x.env[key];
    else x.env[key] = value;
  });
}

// Pick a model id from the endpoint's list (GET /v1/models), or type it.
// Returns the value ('' clears) or null when cancelled.
async function pickModel(p, f) {
  const cur = (p.env && p.env[f.key]) || '';
  const title = `${p.name} — ${t(f.label)}`;
  const manual = async (header) => {
    const v = await tui.prompt({
      title,
      header,
      label: t('manualModelPrompt', { label: t(f.label) }),
      value: cur,
      footer: t('footer_input'),
    });
    return v === null ? null : v.trim();
  };
  if (!baseUrl(p)) return manual();
  const r = await tui.busy(title, t('fetchingModels', { name: p.name }), probeModelsList(baseUrl(p), store.token(p)));
  if (!r.ok || !r.models.length) {
    const reason = !r.reachable ? t('reason_unreachable')
      : r.auth ? t('reason_auth')
        : r.serverError ? t('reason_serverError') : t('reason_noList');
    return manual([style.yellow(t('couldntListModels', { reason }))]);
  }
  const items = [
    { label: t('enterManually'), value: { manual: true } },
    ...(cur ? [{ label: t('clear'), value: { v: '' } }] : []),
    { separator: true, label: t('modelsCount', { n: r.models.length }) },
    ...r.models.map((id) => ({ label: id, hint: id === cur ? t('current') : '', value: { v: id } })),
  ];
  const idx = cur ? items.findIndex((x) => x.value && x.value.v === cur) : -1;
  const res = await tui.select({
    title: t('pickTier', { tier: t(f.label).toLowerCase() }),
    items,
    index: idx >= 0 ? idx : 0,
    footer: t('footer_menu'),
  });
  if (!res) return null;
  return res.item.value.manual ? manual() : res.item.value.v;
}

function validateEnvKey(v) {
  const k = (v || '').trim();
  if (!k) return t('extraEnvKeyEmpty');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return t('extraEnvKeyInvalid');
  if (MANAGED_ENV_KEYS.includes(k)) return t('extraEnvKeyReserved', { key: k });
  return '';
}

async function editExtraEnv(id) {
  for (;;) {
    const { p } = findById(id);
    if (!p) return;
    const keys = extraEnvKeys(p);
    const items = [{ label: t('extraEnvAdd'), value: { add: true } }];
    if (keys.length) {
      items.push({ separator: true, label: t('extraEnvExisting') });
      for (const k of keys) items.push({ label: k, hint: String(p.env[k]), value: { key: k } });
    }
    items.push({ separator: true, label: '' }, { label: t('done'), value: { done: true } });
    const res = await tui.select({ title: t('extraEnvPlaceholder', { name: p.name }), items, footer: t('footer_menu') });
    if (!res || res.item.value.done) return;

    let key = res.item.value.key;
    if (res.item.value.add) {
      key = await tui.prompt({
        title: t('field_extraEnv'),
        label: t('extraEnvKeyPrompt'),
        placeholder: 'CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY',
        validate: validateEnvKey,
        footer: t('footer_input'),
      });
      if (key === null) continue;
      key = key.trim();
    }
    const value = await tui.prompt({
      title: t('field_extraEnv'),
      label: t('extraEnvValuePrompt', { key }),
      value: res.item.value.add ? '' : String(p.env[key]),
      footer: t('footer_input'),
    });
    if (value === null) continue;
    updateProfile(id, (x) => {
      x.env = x.env || {};
      if (value === '' && !res.item.value.add) delete x.env[key];
      else x.env[key] = value;
    });
  }
}

// ---- settings -------------------------------------------------------------------

// The extension's own settings, straight from package.json (profiles and the
// custom-provider table are edited elsewhere).
function extensionSettings() {
  const props = require('../package.json').contributes.configuration.properties;
  return Object.entries(props)
    .map(([full, schema]) => ({ key: full.split('.').pop(), schema }))
    .filter(({ schema }) => schema.type === 'boolean' || schema.type === 'number' || Array.isArray(schema.enum));
}

function settingLabel(key) {
  const s = t('s_' + key);
  return s === 's_' + key ? key : s;
}

function valueLabel(schema, v) {
  if (schema.type === 'boolean') return v ? t('on') : t('off');
  if (Array.isArray(schema.enum)) {
    const own = t('v_' + v);
    if (own !== 'v_' + v) return own;
    const i = schema.enum.indexOf(v);
    return (schema.enumItemLabels && schema.enumItemLabels[i]) || String(v);
  }
  return String(v);
}

async function settingsMenu() {
  let cursor = 0;
  let notice = [];
  for (;;) {
    store.reload();
    const target = store.pref('enterTarget', 'cli');
    const items = [
      { separator: true, label: t('set_app') },
      {
        label: t('set_enterTarget'),
        hint: t(target === 'both' ? 'target_both' : 'target_cli'),
        value: { pref: 'enterTarget' },
      },
      { separator: true, label: t('set_ext') },
      ...extensionSettings().map(({ key, schema }) => ({
        label: settingLabel(key),
        hint: valueLabel(schema, store.get(key, schema.default)),
        value: { key, schema },
      })),
      { separator: true, label: t('set_files') },
      { label: t('file_settings', { path: store.settingsPath }), disabled: true },
      { label: t('file_claude', { path: store.claudePath }), disabled: true },
      { label: t('file_keys', { path: keyFilePath() }), disabled: true },
      { separator: true, label: '' },
      { label: t('back'), value: { back: true } },
    ];
    const res = await tui.select({ title: t('set_title'), header: notice, items, index: cursor, footer: t('footer_menu') });
    notice = [];
    if (!res || res.item.value.back) return;
    cursor = res.index;
    const v = res.item.value;

    if (v.pref) {
      store.setPref('enterTarget', target === 'both' ? 'cli' : 'both');
      continue;
    }
    const { key, schema } = v;
    const cur = store.get(key, schema.default);
    let next;
    if (schema.type === 'boolean') {
      next = !cur;
    } else if (Array.isArray(schema.enum)) {
      const r = await tui.select({
        title: settingLabel(key),
        items: schema.enum.map((e) => ({ label: valueLabel(schema, e), hint: e === cur ? t('current') : '', value: e })),
        index: Math.max(0, schema.enum.indexOf(cur)),
        footer: t('footer_menu'),
      });
      if (!r) continue;
      next = r.item.value;
    } else {
      const min = schema.minimum != null ? schema.minimum : 0;
      const r = await tui.prompt({
        title: settingLabel(key),
        label: t('numberPrompt', { min }),
        value: String(cur),
        validate: (s) => (Number.isFinite(Number(s)) && Number(s) >= min ? '' : t('numberPrompt', { min })),
        footer: t('footer_input'),
      });
      if (r === null) continue;
      next = Number(r);
    }
    const err = guard(() => {
      store.set(key, next);
      return '';
    });
    if (err) notice.push(err);
    if (key === 'language') setLang(resolveLang());
  }
}

// ---- non-interactive commands -----------------------------------------------------

function findProfile(q) {
  const list = store.profiles();
  const m = /^#?(\d+)$/.exec(q);
  if (m) return list[Number(m[1]) - 1];
  const lq = q.toLowerCase();
  return list.find((p) => p.name.toLowerCase() === lq) || list.find((p) => p.name.toLowerCase().includes(lq));
}

function runCommand(cmd, args) {
  const profiles = store.profiles();
  if (cmd === 'list' || cmd === 'ls') {
    const cliIdx = store.cliActiveIndex();
    const vsIdx = store.vscodeActiveIndex();
    profiles.forEach((p, i) => {
      const marks = [i === cliIdx ? t('mark_cli') : '', i === vsIdx ? t('mark_vscode') : ''].filter(Boolean).join(' ');
      console.log(`${String(i + 1).padStart(2)}. ${displayName(p)}  ${baseUrl(p) || t('nativeSubscriptionParen')}${marks ? '  ' + marks : ''}`);
    });
    if (!profiles.length) console.log(t('noProviders'));
    return 0;
  }
  if (cmd === 'current') {
    console.log(envStatus(store.cliEnv(), store.cliActiveIndex(), profiles));
    return 0;
  }
  if (cmd === 'codex') return runCodexCommand(args[0], args.slice(1));
  if (cmd === 'use' || cmd === 'switch') {
    const vscode = args.includes('--vscode');
    const q = args.filter((a) => a !== '--vscode').join(' ');
    const p = q && findProfile(q);
    if (!p) {
      console.error(t('cli_notFound', { q }));
      return 1;
    }
    store.applyToCli(p);
    if (vscode) store.applyToVsCode(p);
    if (baseUrl(p) && !store.token(p)) console.error(style.yellow(`${t('noKeyTitle', { name: p.name })} — ${t('act_key')}`));
    console.log(t(vscode ? 'switchedBoth' : 'switchedCli', { name: p.name }));
    return 0;
  }
  console.log(t('usage'));
  return cmd === 'help' || cmd === '--help' || cmd === '-h' ? 0 : 1;
}

function findCodexProfile(q) {
  const list = store.codexProfiles();
  const m = /^#?(\d+)$/.exec(q);
  if (m) return list[Number(m[1]) - 1];
  const lq = q.toLowerCase();
  return list.find((p) => p.name.toLowerCase() === lq) || list.find((p) => p.name.toLowerCase().includes(lq));
}

// `claude-providers codex list | current | use <name|#n> | default`
function runCodexCommand(sub, args) {
  const list = store.codexProfiles();
  if (sub === 'list' || sub === 'ls') {
    const active = store.codexActiveId();
    list.forEach((p, i) => {
      console.log(`${String(i + 1).padStart(2)}. ${displayName(p)}  ${codexDescribe(p)}${p.id === active ? '  ' + t('mark_codex') : ''}`);
    });
    if (!list.length) console.log(t('noCodexProfiles'));
    return 0;
  }
  if (sub === 'current') {
    console.log(codexStatus());
    return 0;
  }
  if (sub === 'use' || sub === 'switch') {
    const q = args.join(' ');
    const p = q && findCodexProfile(q);
    if (!p) {
      console.error(t('cli_notFound', { q }));
      return 1;
    }
    const err = guardCodex(() => { store.syncCodex(p.id); return ''; });
    if (err) {
      console.error(err);
      return 1;
    }
    if (codex.needsKey(p) && !store.codexToken(p)) console.error(style.yellow(`${t('noKeyTitle', { name: p.name })} — ${t('act_key')}`));
    console.log(t('switchedCodex', { name: p.name }));
    return 0;
  }
  if (sub === 'default' || sub === 'reset') {
    const err = guardCodex(() => { store.syncCodex(null); return ''; });
    if (err) {
      console.error(err);
      return 1;
    }
    console.log(t('codexResetDone'));
    return 0;
  }
  console.log(t('usage'));
  return 1;
}

// ---- entry point -------------------------------------------------------------------

async function main(argv) {
  let settingsPath;
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--settings') settingsPath = argv[++i];
    else if (argv[i].startsWith('--settings=')) settingsPath = argv[i].slice('--settings='.length);
    else args.push(argv[i]);
  }
  store = new Store({ settingsPath });
  setLang(resolveLang());

  if (args.length) {
    try {
      return runCommand(args[0], args.slice(1));
    } catch (e) {
      console.error(t('error', { msg: e.message }));
      return 1;
    }
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(t('cli_needTty'));
    return 1;
  }
  tui.start();
  try {
    await mainMenu();
  } finally {
    tui.stop();
  }
  return 0;
}

module.exports = { main };
