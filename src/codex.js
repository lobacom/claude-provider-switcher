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
const { probeModelsList } = require('./http');
const cx = require('./agents/codex');

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
    cx.syncConfig({ profiles: getCodexProfiles(), activate, tokenFor: cachedToken });
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
  return true;
}

async function switchCodexTo(arg) {
  const p = findCodex(arg);
  if (!p) return;
  // A remote provider without any known key: ask now rather than write a
  // config Codex would fail on.
  if (cx.needsKey(p) && !cachedToken(p) && !cx.tokenInConfig(p)) {
    if (!(await promptKey(p))) return;
  }
  if (syncCodex(p.id)) vscode.window.setStatusBarMessage(t('codexApplyMessage', { name: p.name }), 5000);
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
    description: (pr.codex && pr.codex.base_url) || '',
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
  list.push(p);
  await saveCodexProfiles(list);
  if (token) await setToken(p.id, token);
  syncCodex(undefined);
  const go = t('codexSwitchNow');
  const r = await vscode.window.showInformationMessage(t('codexAdded', { name: p.name }), go);
  if (r === go) await switchCodexTo(p.id);
}

async function deleteCodexProfile(arg) {
  const p = findCodex(arg);
  if (!p) return;
  const del = t('deleteBtn');
  const ok = await vscode.window.showWarningMessage(t('deleteConfirm', { name: p.name }), { modal: true }, del);
  if (ok !== del) return;
  await saveCodexProfiles(cloneCodexProfiles().filter((x) => x.id !== p.id));
  await setToken(p.id, '');
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

// ---- tooltip -----------------------------------------------------------------------

function codexTooltip(p, extraLines) {
  const c = p.codex || {};
  const lines = [`**${p.name}**`];
  lines.push(t('tip_codexProvider', { v: cx.baseUrl(p) || t('codexBuiltin') }));
  lines.push(t('tip_codexModel', { v: c.model || t('tip_codexModelDefault') }));
  if (cx.needsKey(p)) {
    lines.push(t('tip_codexKey', { v: cachedToken(p) || cx.tokenInConfig(p) ? t('codexKeyStored') : t('codexKeyMissing') }));
  }
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
