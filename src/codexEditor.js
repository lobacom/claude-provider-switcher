// The Codex profile editor: a quick-pick loop over a Codex profile's fields,
// mirroring the Claude editor (editor.js) — name, badge, hotkey, fallback,
// Base URL, API key, model (from the endpoint's list), reasoning effort, and
// the provider's extra HTTP headers / query parameters. Every change is saved
// right away and config.toml is re-synced (which re-applies the profile when
// it is the active one).

const vscode = require('vscode');
const { t } = require('./i18n');
const { getCodexProfiles, cloneCodexProfiles, saveCodexProfiles, cachedToken } = require('./profiles');
const { COLOR_CHOICES, colorLabel, badgeTextPrefix } = require('./badges');
const cx = require('./agents/codex');
const { findCodex, promptKey, pickCodexModel, syncCodex, CODEX_HOTKEYS, describe } = require('./codex');

const FIELDS = [
  { key: 'name', labelKey: 'field_name' },
  { key: 'color', labelKey: 'field_badge' },
  { key: 'hotkey', labelKey: 'field_codexHotkey' },
  { key: 'fallback', labelKey: 'field_fallback' },
  { key: 'base_url', labelKey: 'field_codexBaseUrl' },
  { key: 'token', labelKey: 'field_codexKey' },
  { key: 'model', labelKey: 'field_codexModel' },
  { key: 'reasoning_effort', labelKey: 'field_codexEffort' },
  { key: 'http_headers', labelKey: 'field_codexHeaders', map: true },
  { key: 'query_params', labelKey: 'field_codexQuery', map: true },
];

function fieldValue(p, key) {
  const c = p.codex || {};
  if (key === 'name') return p.name || '';
  if (key === 'color') return p.color || '';
  if (key === 'hotkey') return p.hotkey || '';
  if (key === 'fallback') {
    if (!p.fallbackId) return '';
    const tgt = getCodexProfiles().find((x) => x.id === p.fallbackId);
    return tgt ? tgt.name : t('missing');
  }
  if (key === 'base_url') return c.base_url || t('codexBuiltin');
  if (key === 'token') {
    if (!cx.needsKey(p)) return t('codexKeyNotNeeded');
    return cachedToken(p) || cx.tokenInConfig(p) ? '••••••••' : '';
  }
  if (key === 'model') return c.model || t('tip_codexModelDefault');
  if (key === 'reasoning_effort') return c.reasoning_effort || t('tip_codexModelDefault');
  if (key === 'http_headers' || key === 'query_params') {
    const n = Object.keys(c[key] || {}).length;
    return n ? t('extraEnvCount', { n }) : '';
  }
  return '';
}

// Save a change to profile `id` and re-sync config.toml.
async function update(id, fn) {
  const list = cloneCodexProfiles();
  const p = list.find((x) => x.id === id);
  if (!p) return;
  p.codex = { ...(p.codex || {}) };
  fn(p, list);
  await saveCodexProfiles(list);
  syncCodex(undefined);
}

// HTTP header names / query keys: a token of printable non-space characters.
function validateMapKey(v) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test((v || '').trim()) ? undefined : t('mapKeyInvalid');
}

// Sub-editor for a string map (http_headers / query_params): add, edit, clear.
async function editMap(id, f) {
  for (;;) {
    const p = findCodex(id);
    if (!p) return;
    const map = (p.codex && p.codex[f.key]) || {};
    const items = [{ label: `$(add) ${t('mapAdd')}`, _add: true }];
    const keys = Object.keys(map).sort();
    if (keys.length) {
      items.push({ label: t('extraEnvExisting'), kind: vscode.QuickPickItemKind.Separator });
      for (const k of keys) items.push({ label: k, description: String(map[k]), _key: k });
    }
    items.push({ label: `$(check) ${t('done')}`, _done: true });
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('mapPlaceholder', { label: t(f.labelKey), name: p.name }),
      ignoreFocusOut: true,
    });
    if (!pick || pick._done) return;
    let key = pick._key;
    if (pick._add) {
      key = await vscode.window.showInputBox({ prompt: t('mapKeyPrompt'), ignoreFocusOut: true, validateInput: validateMapKey });
      if (key === undefined) continue;
      key = key.trim();
    }
    const value = await vscode.window.showInputBox({
      prompt: t('mapValuePrompt', { key }),
      value: map[key] || '',
      ignoreFocusOut: true,
    });
    if (value === undefined) continue;
    await update(id, (x) => {
      const m = { ...(x.codex[f.key] || {}) };
      if (value === '') delete m[key];
      else m[key] = value;
      if (Object.keys(m).length) x.codex[f.key] = m;
      else delete x.codex[f.key];
    });
  }
}

async function editCodexProfile(arg) {
  const start = findCodex(arg);
  if (!start) return;
  const id = start.id;
  for (;;) {
    const p = findCodex(id);
    if (!p) return;
    const items = FIELDS.map((f) => ({ label: t(f.labelKey), description: fieldValue(p, f.key) || t('empty'), _f: f }));
    items.push({ label: `$(check) ${t('done')}`, _done: true });
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('editingPlaceholder', { name: p.name }),
      ignoreFocusOut: true,
    });
    if (!pick || pick._done) return;
    const f = pick._f;

    if (f.key === 'name') {
      const v = await vscode.window.showInputBox({ prompt: t(f.labelKey), value: p.name, ignoreFocusOut: true });
      if (v !== undefined && v.trim()) await update(id, (x) => { x.name = v.trim(); });
    } else if (f.key === 'color') {
      const choices = COLOR_CHOICES.map((c) => ({
        label: colorLabel(c),
        description: c.value === (p.color || '') ? t('current') : '',
        _v: c.value,
      }));
      const c = await vscode.window.showQuickPick(choices, { placeHolder: t('pickBadge'), ignoreFocusOut: true });
      if (c) await update(id, (x) => { x.color = c._v; });
    } else if (f.key === 'hotkey') {
      const used = new Set(getCodexProfiles().filter((x) => x.id !== id).map((x) => x.hotkey).filter(Boolean));
      const choices = CODEX_HOTKEYS.filter((h) => !used.has(h)).map((h) => ({
        label: `$(keyboard) ${h}`,
        description: h === p.hotkey ? t('current') : t('free'),
        _v: h,
      }));
      choices.push({ label: `$(close) ${t('noneLabel')}`, _v: '' });
      const c = await vscode.window.showQuickPick(choices, { placeHolder: t('pickHotkey'), ignoreFocusOut: true });
      if (c) await update(id, (x) => { if (c._v) x.hotkey = c._v; else delete x.hotkey; });
    } else if (f.key === 'fallback') {
      const choices = [
        { label: `$(close) ${t('noneLabel')}`, _v: '' },
        { label: t('providersSep'), kind: vscode.QuickPickItemKind.Separator },
        ...getCodexProfiles()
          .filter((x) => x.id !== id)
          .map((x) => ({
            label: `${badgeTextPrefix(x.color)}${x.name}`,
            description: (x.id === p.fallbackId ? t('current') + '   ' : '') + describe(x),
            _v: x.id,
          })),
      ];
      const c = await vscode.window.showQuickPick(choices, { placeHolder: t('pickFallback'), ignoreFocusOut: true });
      if (c) await update(id, (x) => { if (c._v) x.fallbackId = c._v; else delete x.fallbackId; });
    } else if (f.key === 'base_url') {
      const v = await vscode.window.showInputBox({
        prompt: t('codexBaseUrlPromptEdit'),
        value: (p.codex && p.codex.base_url) || '',
        placeHolder: 'https://host/v1',
        ignoreFocusOut: true,
        validateInput: (s) => (!s.trim() || /^https?:\/\/\S+$/i.test(s.trim()) ? undefined : t('codexBaseUrlInvalid')),
      });
      if (v !== undefined) {
        await update(id, (x) => {
          const u = v.trim().replace(/\/+$/, '');
          if (u) x.codex.base_url = u;
          else delete x.codex.base_url;
        });
      }
    } else if (f.key === 'token') {
      if (!cx.needsKey(p)) continue;
      if (await promptKey(p)) syncCodex(undefined);
    } else if (f.key === 'model') {
      const m = await pickCodexModel(p, cachedToken(p) || cx.tokenInConfig(p));
      if (m !== undefined) await update(id, (x) => { if (m) x.codex.model = m; else delete x.codex.model; });
    } else if (f.key === 'reasoning_effort') {
      const cur = (p.codex && p.codex.reasoning_effort) || '';
      const choices = [
        { label: t('tip_codexModelDefault'), description: cur ? '' : t('current'), _v: '' },
        ...cx.REASONING_EFFORTS.map((e) => ({ label: e, description: e === cur ? t('current') : '', _v: e })),
      ];
      const c = await vscode.window.showQuickPick(choices, {
        placeHolder: t('pickEffort', { name: p.name }),
        ignoreFocusOut: true,
      });
      if (c) await update(id, (x) => { if (c._v) x.codex.reasoning_effort = c._v; else delete x.codex.reasoning_effort; });
    } else if (f.map) {
      await editMap(id, f);
    }
  }
}

module.exports = { editCodexProfile };
