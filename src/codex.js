// The extension's Codex switcher: the quick-pick, switching, add / delete and
// the key / model prompts. The config.toml work itself lives in
// agents/codex.js (shared with the terminal app); this module is the VS Code
// glue around it. Codex profiles are kept in `codexProfiles`, their API keys in
// SecretStorage next to the Claude ones (same id-keyed cache).

const vscode = require('vscode');
const crypto = require('crypto');
const { t } = require('./i18n');
const { SELF } = require('./constants');
const {
  getCodexProfiles,
  cloneCodexProfiles,
  saveCodexProfiles,
  cachedToken,
  setToken,
  uniqueName,
} = require('./profiles');
const { codexPresets } = require('./providers');
const { firstFreeBadge, badgeTextPrefix, providerIcon } = require('./badges');
const { probeModelsList, httpProbeResponses, probeHealthy } = require('./http');
const { healthOf, reportProbe } = require('./health');
const cx = require('./agents/codex');
const { codexTokenWindows, codexModelsUsed } = require('./codexTokens');
const { formatTokens } = require('./tokens');

// Repaint hook (tree + status bar), set by extension.js.
let repaint = () => {};
function onCodexChanged(fn) {
  repaint = fn;
}

// The active profile per config.toml, cached between repaints; invalidated by
// our own writes and by the config.toml file watcher.
let activeCache;
function codexActiveId() {
  if (activeCache === undefined) {
    try {
      activeCache = cx.activeId(getCodexProfiles());
    } catch {
      activeCache = null;
    }
  }
  return activeCache;
}
function invalidateCodexActive() {
  activeCache = undefined;
}

// Where Codex API keys go: 'file' (owner-only key files read via auth.command)
// or 'config' (the active key in config.toml as experimental_bearer_token).
function keyStorage() {
  const v = vscode.workspace.getConfiguration(SELF).get('codexKeyStorage');
  return cx.KEY_STORAGE_MODES.includes(v) ? v : 'file';
}

function errorText(e) {
  const path = cx.configPath();
  if (e && e.code && ['inlineTable', 'conflict', 'valueType'].includes(e.code)) {
    return t(`codexErr_${e.code}`, { path, detail: e.detail });
  }
  return t('codexWriteError', { path, msg: (e && e.message) || String(e) });
}

// Write the switcher's state into config.toml (see syncConfig for `activate`).
// Returns true when the file is in the requested state.
function syncCodex(activate) {
  let ok = true;
  try {
    cx.syncConfig({ profiles: getCodexProfiles(), activate, tokenFor: cachedToken, keyStorage: keyStorage() });
  } catch (e) {
    ok = false;
    vscode.window.showWarningMessage(errorText(e));
  }
  invalidateCodexActive();
  repaint();
  return ok;
}

function findCodex(arg) {
  const id = typeof arg === 'string' ? arg : arg && arg.profileId;
  return getCodexProfiles().find((p) => p.id === id);
}

function describe(p) {
  const c = p.codex || {};
  return [cx.baseUrl(p) || t('codexBuiltin'), c.model].filter(Boolean).join(' · ');
}

// ---- switching ------------------------------------------------------------------

async function promptKey(p) {
  const v = await vscode.window.showInputBox({
    prompt: t('codexKeyPrompt', { name: p.name }),
    value: cachedToken(p),
    password: true,
    ignoreFocusOut: true,
  });
  if (v === undefined) return false;
  await setToken(p.id, v);
  if (!v.trim()) cx.forgetKey(p); // an empty key removes it for Codex too
  return true;
}

// A remote provider without any known key: ask now rather than write a config
// Codex would fail on. Returns false when the user cancelled.
async function ensureKey(p) {
  if (!cx.needsKey(p) || cachedToken(p) || cx.tokenInConfig(p)) return true;
  return promptKey(p);
}

function applyCodex(p) {
  const ok = syncCodex(p.id);
  if (ok) vscode.window.setStatusBarMessage(t('codexApplyMessage', { name: p.name }), 5000);
  return ok;
}

// User-initiated switch (row click, menu, hotkey, cycle). Follows the same
// settings as Claude switches: `autoFallbackOnApply` probes the target and walks
// its fallback chain; `switchAction = switchAndReload` reloads the window after.
async function switchCodexTo(arg, { reload } = {}) {
  const p = findCodex(arg);
  if (!p) return;
  if (!(await ensureKey(p))) return;
  const cfg = vscode.workspace.getConfiguration(SELF);
  if (cfg.get('autoFallbackOnApply') === true) await applyCodexWithFallback(p);
  else applyCodex(p);
  if (reload || cfg.get('switchAction') === 'switchAndReload') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

// Pick a profile (or take the tree row) and run `fn` on it.
async function withCodexTarget(arg, placeHolder, fn) {
  let p = findCodex(arg);
  if (!p) {
    const profiles = getCodexProfiles();
    if (!profiles.length) {
      vscode.window.showInformationMessage(t('noCodexProviders'));
      return;
    }
    const pick = await vscode.window.showQuickPick(
      profiles.map((x) => ({ label: `${badgeTextPrefix(x.color)}${x.name}`, description: describe(x), _id: x.id })),
      { placeHolder }
    );
    if (!pick) return;
    p = findCodex(pick._id);
  }
  await fn(p);
}

async function switchCodexAndReload(arg) {
  await withCodexTarget(arg, t('switchReloadPlaceholder'), (p) => switchCodexTo(p.id, { reload: true }));
}

async function switchCodexToIndex(n) {
  const p = getCodexProfiles()[n];
  if (p) await switchCodexTo(p.id);
  else vscode.window.showInformationMessage(t('providerNotDefined', { n: n + 1 }));
}

// Next (dir=1) / previous (dir=-1) Codex profile, wrapping around; with nothing
// of ours active, dir=1 lands on the first profile and dir=-1 on the last.
async function cycleCodex(dir) {
  const profiles = getCodexProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage(t('noCodexProviders'));
    return;
  }
  const cur = profiles.findIndex((p) => p.id === codexActiveId());
  const start = cur < 0 ? (dir > 0 ? -1 : 0) : cur;
  await switchCodexTo(profiles[(start + dir + profiles.length) % profiles.length].id);
}

// ---- fallback / test -------------------------------------------------------------

function probeExtra(p) {
  const c = p.codex || {};
  return { headers: c.http_headers || {}, query: c.query_params || {} };
}
function codexProbe(p) {
  return httpProbeResponses(cx.baseUrl(p), cachedToken(p) || cx.tokenInConfig(p), (p.codex || {}).model, probeExtra(p));
}

// Probe `startP` and walk its fallback chain (fallbackId), applying the first
// provider that answers (HTTP 200/400). The built-in OpenAI provider can't be
// probed and counts as up — a natural end of a chain.
async function applyCodexWithFallback(startP) {
  const profiles = getCodexProfiles();
  const chain = [];
  const seen = new Set();
  for (let p = startP; p && !seen.has(p.id); p = p.fallbackId ? profiles.find((x) => x.id === p.fallbackId) : null) {
    seen.add(p.id);
    chain.push(p);
  }
  const skipped = [];
  for (const cand of chain) {
    let healthy = true;
    if (cx.baseUrl(cand)) {
      const r = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('checking', { name: cand.name }) },
        () => codexProbe(cand)
      );
      healthy = probeHealthy(r);
    }
    if (healthy) {
      applyCodex(cand);
      if (skipped.length) {
        vscode.window.showWarningMessage(t('fellBack', { skipped: skipped.join(', '), name: cand.name }));
      }
      return cand;
    }
    skipped.push(`"${cand.name}"`);
  }
  applyCodex(startP);
  vscode.window.showErrorMessage(
    skipped.length > 1
      ? t('noReachableChain', { chain: skipped.join(' → '), name: startP.name })
      : t('unreachableNoFallback', { name: startP.name })
  );
  return startP;
}

async function switchCodexWithFallback(arg) {
  await withCodexTarget(arg, t('switchFallbackPlaceholder'), async (p) => {
    if (await ensureKey(p)) await applyCodexWithFallback(p);
  });
}

// A real (tiny) POST /responses — verifies the endpoint and the key.
async function testCodexProfile(arg) {
  await withCodexTarget(arg, t('codexSelectPlaceholder'), async (p) => {
    if (!cx.baseUrl(p)) {
      vscode.window.showInformationMessage(t('codexNothingToTest', { name: p.name }));
      return;
    }
    const r = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('testing', { name: p.name }) },
      () => codexProbe(p)
    );
    reportProbe(p.name, r);
  });
}

// ---- duplicate / reorder -----------------------------------------------------------

async function duplicateCodexProfile(arg) {
  const src = findCodex(arg);
  if (!src) return;
  const list = cloneCodexProfiles();
  const i = list.findIndex((x) => x.id === src.id);
  const copy = JSON.parse(JSON.stringify(list[i]));
  copy.id = crypto.randomUUID();
  copy.name = uniqueName(`${src.name} copy`, list);
  delete copy.key; // a key of its own in config.toml
  delete copy.hotkey;
  cx.assignKey(copy, list);
  list.splice(i + 1, 0, copy);
  await saveCodexProfiles(list);
  if (cachedToken(src)) await setToken(copy.id, cachedToken(src));
  syncCodex(undefined);
}

async function moveCodexProfile(arg, dir) {
  const p = findCodex(arg);
  if (!p) return;
  const list = cloneCodexProfiles();
  const i = list.findIndex((x) => x.id === p.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await saveCodexProfiles(list);
}

async function resetCodex() {
  if (syncCodex(null)) vscode.window.setStatusBarMessage(t('codexResetMessage'), 5000);
}

async function selectCodex() {
  const profiles = getCodexProfiles();
  const active = codexActiveId();
  const items = profiles.map((p) => ({
    label: `${badgeTextPrefix(p.color)}${p.name}`,
    description: (p.id === active ? t('activeMarker') : '') + describe(p),
    _id: p.id,
  }));
  items.push(
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    { label: t('codexDefault'), description: (active ? '' : t('activeMarker')) + t('codexDefaultDesc'), _reset: true },
    { label: t('codexAddItem'), _add: true }
  );
  const pick = await vscode.window.showQuickPick(items, { placeHolder: t('codexSelectPlaceholder') });
  if (!pick) return;
  if (pick._add) return addCodexProfile();
  if (pick._reset) return resetCodex();
  await switchCodexTo(pick._id);
}

// ---- add / delete / edit ----------------------------------------------------------

async function pickCodexTemplate() {
  const sep = (label) => ({ label, kind: vscode.QuickPickItemKind.Separator });
  const preset = (pr) => ({
    label: pr.name,
    description: ((pr.codex && pr.codex.base_url) || '') + (pr.custom ? `   ${t('customTag')}` : ''),
    iconPath: providerIcon(pr.icon),
    _tpl: { name: pr.name, codex: { ...(pr.codex || {}) } },
  });
  const { remote, local } = codexPresets();
  const items = [
    { label: `$(edit) ${t('customLabel')}`, description: t('codexCustomDesc'), _tpl: { name: 'Custom', codex: {}, custom: true } },
    sep(t('codexSepBuiltin')),
    { label: t('codexBuiltin'), description: t('codexBuiltinDesc'), iconPath: providerIcon('account'), _tpl: { name: 'OpenAI', codex: {} } },
    sep(t('codexSepRemote')),
    ...remote.map(preset),
    sep(t('sepLocal')),
    ...local.map(preset),
  ];
  const pick = await vscode.window.showQuickPick(items, { placeHolder: t('codexAddPlaceholder'), ignoreFocusOut: true });
  return pick ? pick._tpl : undefined;
}

// Pick a model: from the endpoint's list (GET /v1/models) when it answers, else
// typed. Returns the id ('' = Codex default) or undefined when cancelled.
async function pickCodexModel(p, token) {
  const cur = (p.codex && p.codex.model) || '';
  const url = cx.baseUrl(p);
  let models = [];
  if (url) {
    const r = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('codexModelsFetching', { url }) },
      () => probeModelsList(url, token)
    );
    models = r.ok ? r.models : [];
  }
  if (models.length) {
    const items = [
      ...models.map((id) => ({ label: id, description: id === cur ? t('current') : '', _v: id })),
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      { label: t('codexModelManual'), _manual: true },
      { label: t('codexModelDefault'), _v: '' },
    ];
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('codexModelPlaceholder', { name: p.name }),
      ignoreFocusOut: true,
    });
    if (!pick) return undefined;
    if (!pick._manual) return pick._v;
  }
  const v = await vscode.window.showInputBox({
    prompt: t('codexModelPrompt', { name: p.name }),
    value: cur,
    ignoreFocusOut: true,
  });
  return v === undefined ? undefined : v.trim();
}

function validateUrl(v) {
  return /^https?:\/\/\S+$/i.test((v || '').trim()) ? undefined : t('codexBaseUrlInvalid');
}

async function addCodexProfile() {
  const tpl = await pickCodexTemplate();
  if (!tpl) return;
  const list = cloneCodexProfiles();
  const p = {
    id: crypto.randomUUID(),
    name: uniqueName(tpl.name, list),
    color: firstFreeBadge(list, -1),
    codex: tpl.codex,
  };
  if (tpl.custom) {
    const url = await vscode.window.showInputBox({
      prompt: t('codexBaseUrlPrompt'),
      placeHolder: 'https://host/v1',
      ignoreFocusOut: true,
      validateInput: validateUrl,
    });
    if (url === undefined) return;
    p.codex.base_url = url.trim().replace(/\/+$/, '');
  }
  let token = '';
  if (cx.needsKey(p)) {
    token = await vscode.window.showInputBox({
      prompt: t('codexKeyPrompt', { name: p.name }),
      password: true,
      ignoreFocusOut: true,
    });
    if (token === undefined) return;
    token = token.trim();
  }
  const model = await pickCodexModel(p, token);
  if (model === undefined) return;
  if (model) p.codex.model = model;
  cx.assignKey(p, list);
  const hk = firstFreeCodexHotkey(list);
  if (hk) p.hotkey = hk;
  list.push(p);
  await saveCodexProfiles(list);
  if (token) await setToken(p.id, token);
  syncCodex(undefined);
  const go = t('codexSwitchNow');
  const r = await vscode.window.showInformationMessage(t('codexAdded', { name: p.name }), go);
  if (r === go) await switchCodexTo(p.id);
}

// ---- pin to workspace --------------------------------------------------------------
// Like the Claude pin (pinning.js): a workspace can pin one Codex profile, kept
// in workspaceState; opening the workspace switches Codex to it (honours
// `applyPinnedOnOpen`). Codex's config.toml is global, so — as with Claude —
// the pin switches Codex for every window, on open.

const CODEX_PIN_KEY = `${SELF}.pinnedCodexProfileId`;
let workspaceState;
function initCodexPinning(state) {
  workspaceState = state;
}
function getPinnedCodexId() {
  return workspaceState ? workspaceState.get(CODEX_PIN_KEY) : undefined;
}
async function setPinnedCodexId(id) {
  if (workspaceState) await workspaceState.update(CODEX_PIN_KEY, id || undefined);
}

async function applyPinnedCodexProfile() {
  if (!workspaceState || !(vscode.workspace.workspaceFolders || []).length) return;
  if (vscode.workspace.getConfiguration(SELF).get('applyPinnedOnOpen') === false) return;
  const p = findCodex(getPinnedCodexId());
  if (!p || p.id === codexActiveId()) return;
  applyCodex(p); // quiet: no key prompt, no reload while the window opens
}

async function pinCodexToWorkspace(arg) {
  if (!workspaceState) return;
  const folders = vscode.workspace.workspaceFolders || [];
  if (!folders.length) {
    vscode.window.showInformationMessage(t('openFolderFirst'));
    return;
  }
  const folder = folders[0].name;
  const pinned = getPinnedCodexId();
  let p = findCodex(arg);
  if (!p) {
    const pick = await vscode.window.showQuickPick(
      [
        { label: t('dontAutoSwitch'), description: pinned ? '' : t('current'), _unpin: true },
        { label: t('codexSelectPlaceholder'), kind: vscode.QuickPickItemKind.Separator },
        ...getCodexProfiles().map((x) => ({
          label: `${badgeTextPrefix(x.color)}${x.name}`,
          description: (x.id === pinned ? t('pinnedMarker') : '') + describe(x),
          _id: x.id,
        })),
      ],
      { placeHolder: t('pinPlaceholder', { folder }), ignoreFocusOut: true }
    );
    if (!pick) return;
    if (pick._unpin) {
      await setPinnedCodexId(undefined);
      vscode.window.showInformationMessage(t('unpinnedMsg', { folder }));
      repaint();
      return;
    }
    p = findCodex(pick._id);
  }
  await setPinnedCodexId(p.id);
  if (await ensureKey(p)) applyCodex(p);
  vscode.window.showInformationMessage(t('pinnedMsg', { name: p.name, folder }));
  repaint();
}

async function deleteCodexProfile(arg) {
  const p = findCodex(arg);
  if (!p) return;
  const del = t('deleteBtn');
  const ok = await vscode.window.showWarningMessage(t('deleteConfirm', { name: p.name }), { modal: true }, del);
  if (ok !== del) return;
  await saveCodexProfiles(cloneCodexProfiles().filter((x) => x.id !== p.id));
  await setToken(p.id, '');
  if (getPinnedCodexId() === p.id) await setPinnedCodexId(undefined); // clear a stale pin
  syncCodex(undefined); // the active one is gone → the user's own settings come back
}

async function setCodexKey(arg) {
  const p = findCodex(arg);
  if (p && (await promptKey(p))) syncCodex(undefined);
}

async function setCodexModel(arg) {
  const p = findCodex(arg);
  if (!p) return;
  const model = await pickCodexModel(p, cachedToken(p) || cx.tokenInConfig(p));
  if (model === undefined) return;
  const list = cloneCodexProfiles();
  const x = list.find((y) => y.id === p.id);
  if (!x) return;
  x.codex = { ...(x.codex || {}) };
  if (model) x.codex.model = model;
  else delete x.codex.model;
  await saveCodexProfiles(list);
  syncCodex(undefined); // re-applies the model when this profile is the active one
}

// ---- hotkeys ---------------------------------------------------------------------
// Codex profiles get their own slots, Ctrl+Shift+Alt+1…9, 0 (Claude uses
// Ctrl+Alt+…), synced into keybindings.json by keybindings.js.

const CODEX_HOTKEYS = cx.CODEX_HOTKEYS;
function firstFreeCodexHotkey(list, exceptId) {
  const used = new Set(list.filter((x) => x.id !== exceptId).map((x) => x.hotkey).filter(Boolean));
  return CODEX_HOTKEYS.find((h) => !used.has(h)) || '';
}

// ---- tooltip -----------------------------------------------------------------------

// Token lines for the tooltip (same format as Claude's): totals for today / 7 /
// 30 days, the in / out / cached split, and the models used. Read from Codex's
// session logs (codexTokens.js); gated by `showTokenStats`.
function tokenLines(p) {
  if (vscode.workspace.getConfiguration(SELF).get('showTokenStats') === false) return [];
  const profiles = getCodexProfiles();
  const { today, week, month } = codexTokenWindows(p, profiles);
  if (!(month.input || month.output || month.cacheRead || month.cacheCreate)) return [];
  const io = (x) => formatTokens(x.input + x.output);
  const lines = [t('tip_tokens', { today: io(today), week: io(week), month: io(month) })];
  if (week.input || week.output || week.cacheRead) {
    lines.push(t('tip_tokensBreakdown', { in: formatTokens(week.input), out: formatTokens(week.output), cache: formatTokens(week.cacheRead + week.cacheCreate) }));
  }
  lines.push(t('tip_tokensBreakdown30', { in: formatTokens(month.input), out: formatTokens(month.output), cache: formatTokens(month.cacheRead + month.cacheCreate) }));
  for (const mu of codexModelsUsed(p, profiles).slice(0, 4)) {
    lines.push(`   ${mu.model} ${t('tip_modelTokens', { today: io(mu.today), week: io(mu.week), month: io(mu.month) })}`);
  }
  return lines;
}

function codexTooltip(p, extraLines) {
  const c = p.codex || {};
  const lines = [`**${p.name}**`];
  lines.push(t('tip_codexProvider', { v: cx.baseUrl(p) || t('codexBuiltin') }));
  lines.push(t('tip_codexModel', { v: c.model || t('tip_codexModelDefault') }));
  if (cx.needsKey(p)) {
    lines.push(t('tip_codexKey', { v: cachedToken(p) || cx.tokenInConfig(p) ? t('codexKeyStored') : t('codexKeyMissing') }));
  }
  if (p.hotkey) lines.push(t('tip_hotkey', { hotkey: p.hotkey }));
  if (p.fallbackId) {
    const tgt = getCodexProfiles().find((x) => x.id === p.fallbackId);
    if (tgt) lines.push(t('tip_fallback', { name: tgt.name }));
  }
  const st = healthOf(p);
  if (st !== 'unknown') lines.push(t('tip_status', { status: st === 'ok' ? t('health_reachable') : t('health_unreachable') }));
  lines.push(...tokenLines(p));
  if (cx.baseUrl(p) || p.codex) lines.push(t('tip_codexParallel', { key: cx.profileKey(p) }));
  lines.push(t('tip_codexConfig', { path: cx.configPath() }));
  if (extraLines) lines.push(...extraLines);
  const md = new vscode.MarkdownString();
  md.appendMarkdown(lines.join('  \n'));
  return md;
}

// Whether to show the Codex view: Codex is installed (its home exists or its
// VS Code extension is present) or the user already has Codex profiles.
function codexDetected() {
  if (getCodexProfiles().length) return true;
  if (vscode.extensions.getExtension('openai.chatgpt')) return true;
  try {
    return require('fs').existsSync(cx.codexHome());
  } catch {
    return false;
  }
}
function updateCodexContext() {
  vscode.commands.executeCommand('setContext', `${SELF}.codexDetected`, codexDetected());
}

// Watch config.toml for edits made outside the extension (the terminal app,
// Codex itself, the user) so the active marker follows.
function watchCodexConfig(onChange) {
  const w = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(vscode.Uri.file(cx.codexHome()), 'config.toml')
  );
  const fire = () => {
    invalidateCodexActive();
    onChange();
  };
  w.onDidChange(fire);
  w.onDidCreate(fire);
  w.onDidDelete(fire);
  return w;
}

module.exports = {
  initCodexPinning,
  getPinnedCodexId,
  applyPinnedCodexProfile,
  pinCodexToWorkspace,
  CODEX_HOTKEYS,
  firstFreeCodexHotkey,
  findCodex,
  promptKey,
  pickCodexModel,
  switchCodexAndReload,
  switchCodexToIndex,
  cycleCodex,
  switchCodexWithFallback,
  testCodexProfile,
  duplicateCodexProfile,
  moveCodexProfile,
  onCodexChanged,
  codexActiveId,
  invalidateCodexActive,
  syncCodex,
  switchCodexTo,
  resetCodex,
  selectCodex,
  addCodexProfile,
  deleteCodexProfile,
  setCodexKey,
  setCodexModel,
  codexTooltip,
  describe,
  updateCodexContext,
  watchCodexConfig,
};
