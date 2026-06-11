// The profile editor: a quick-pick loop over the profile's fields, with
// sub-editors for badges, hotkeys, the fallback target, the secret token,
// free-form env vars and model ids fetched from the endpoint.

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF, MANAGED_ENV_KEYS } = require('./constants');
const {
  getProfiles,
  cloneProfiles,
  saveProfiles,
  getActiveEnv,
  envEqual,
  cachedToken,
  fullEnv,
  setToken,
} = require('./profiles');
const { COLOR_CHOICES, colorLabel, badgeTextPrefix } = require('./badges');
const { probeModelsList } = require('./http');
const { applyProfile } = require('./switching');

// ---- hotkeys ----------------------------------------------------------------
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
  out.push({ label: `$(close) ${t('noneLabel')}`, value: '', _free: true });
  return out;
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

// ---- fields ------------------------------------------------------------------

const FIELDS = [
  { key: '__name', labelKey: 'field_name' },
  { key: '__color', labelKey: 'field_badge' },
  { key: '__hotkey', labelKey: 'field_hotkey' },
  { key: '__fallback', labelKey: 'field_fallback' },
  { key: 'ANTHROPIC_BASE_URL', labelKey: 'field_baseUrl' },
  { key: 'ANTHROPIC_AUTH_TOKEN', labelKey: 'field_token', secret: true },
  { key: 'ANTHROPIC_DEFAULT_OPUS_MODEL', labelKey: 'field_opus', model: true },
  { key: 'ANTHROPIC_DEFAULT_SONNET_MODEL', labelKey: 'field_sonnet', model: true },
  { key: 'ANTHROPIC_DEFAULT_HAIKU_MODEL', labelKey: 'field_haiku', model: true },
  { key: 'API_TIMEOUT_MS', labelKey: 'field_timeout' },
  { key: '__extraEnv', labelKey: 'field_extraEnv' },
];

// Extra (free-form) env vars on a profile: every env key that isn't one of the
// dedicated fields above (MANAGED_ENV_KEYS). Lets a profile carry any other
// CLAUDE_CODE_* / ANTHROPIC_* variable Claude Code understands without a bespoke
// field — e.g. CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY, ANTHROPIC_CUSTOM_HEADERS.
function extraEnvKeys(p) {
  const env = (p && p.env) || {};
  return Object.keys(env).filter((k) => !MANAGED_ENV_KEYS.includes(k)).sort();
}

// Localized label for a FIELDS entry (computed at render time so it follows the
// active language).
function fieldLabel(f) {
  return t(f.labelKey);
}

function fieldValue(p, key) {
  if (key === '__name') return p.name || '';
  if (key === '__color') return p.color || '';
  if (key === '__hotkey') return p.hotkey || '';
  if (key === '__fallback') {
    if (!p.fallbackId) return '';
    const tgt = getProfiles().find((x) => x.id === p.fallbackId);
    return tgt ? tgt.name : t('missing');
  }
  if (key === '__extraEnv') {
    const n = extraEnvKeys(p).length;
    return n ? t('extraEnvCount', { n }) : '';
  }
  // token lives in SecretStorage — only ever surface a masked placeholder
  if (key === 'ANTHROPIC_AUTH_TOKEN') return cachedToken(p) ? '••••••••' : '';
  return (p.env && p.env[key]) || '';
}

// Reject env-var names that collide with the dedicated fields or aren't valid
// shell identifiers. Returns an error string (blocks the input) or undefined (ok).
function validateEnvKey(v) {
  const k = (v || '').trim();
  if (!k) return t('extraEnvKeyEmpty');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return t('extraEnvKeyInvalid');
  if (MANAGED_ENV_KEYS.includes(k)) return t('extraEnvKeyReserved', { key: k });
  return undefined;
}

// Sub-editor for a profile's free-form env vars. Loops add / edit / clear until
// Done. Each change is saved immediately; the caller re-applies if the profile is
// live. Empty value on an existing key removes it.
async function editExtraEnv(index) {
  for (;;) {
    const list = getProfiles();
    const p = list[index];
    if (!p) return;
    const keys = extraEnvKeys(p);
    const items = [{ label: `$(add) ${t('extraEnvAdd')}`, _add: true }];
    if (keys.length) {
      items.push({ label: t('extraEnvExisting'), kind: vscode.QuickPickItemKind.Separator });
      for (const k of keys) items.push({ label: k, description: String(p.env[k]), _key: k });
    }
    items.push({ label: `$(check) ${t('done')}`, _done: true });
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('extraEnvPlaceholder', { name: p.name }),
      ignoreFocusOut: true,
    });
    if (!pick || pick._done) return;

    let key, curVal;
    if (pick._add) {
      key = await vscode.window.showInputBox({
        prompt: t('extraEnvKeyPrompt'),
        placeHolder: 'CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY',
        ignoreFocusOut: true,
        validateInput: validateEnvKey,
      });
      if (key === undefined) continue;
      key = key.trim();
      curVal = '';
    } else {
      key = pick._key;
      curVal = String(p.env[key]);
    }

    const value = await vscode.window.showInputBox({
      prompt: t('extraEnvValuePrompt', { key }),
      value: curVal,
      ignoreFocusOut: true,
    });
    if (value === undefined) continue;

    const draft = cloneProfiles();
    if (!draft[index]) return;
    draft[index].env = draft[index].env || {};
    if (value === '' && !pick._add) delete draft[index].env[key];
    else draft[index].env[key] = value;
    await saveProfiles(draft);
  }
}

// ---- model picker -----------------------------------------------------------
// Resolve a model field value: query the endpoint and let the user pick from a
// list, with "Enter manually…" and "Clear" escapes. Returns { value } (value
// may be '' to clear) or null if the user cancelled.
async function pickModelValue(p, f) {
  const cur = (p.env && p.env[f.key]) || '';
  const base = p.env && p.env.ANTHROPIC_BASE_URL;
  const tier = fieldLabel(f).toLowerCase(); // "opus model" → readable placeholder
  const manual = async () => {
    const v = await vscode.window.showInputBox({
      prompt: t('manualModelPrompt', { label: fieldLabel(f) }),
      value: cur,
      ignoreFocusOut: true,
    });
    return v === undefined ? null : { value: v.trim() };
  };
  // Native subscription / no endpoint → nothing to query, just ask for the id.
  if (!base) return manual();

  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t('fetchingModels', { name: p.name }) },
    () => probeModelsList(base, cachedToken(p))
  );
  if (!r.ok || !r.models.length) {
    const reason = !r.reachable
      ? t('reason_unreachable')
      : r.auth
        ? t('reason_auth')
        : r.serverError
          ? t('reason_serverError')
          : t('reason_noList');
    vscode.window.showWarningMessage(t('couldntListModels', { reason }));
    return manual();
  }

  const items = [
    { label: `$(edit) ${t('enterManually')}`, _manual: true },
    ...(cur ? [{ label: `$(close) ${t('clear')}`, _clear: true }] : []),
    { label: t('modelsCount', { n: r.models.length }), kind: vscode.QuickPickItemKind.Separator },
    ...r.models.map((id) => ({
      label: id,
      description: id === cur ? t('current') : '',
      _value: id,
    })),
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: t('pickTier', { tier }),
    matchOnDescription: true,
    ignoreFocusOut: true,
  });
  if (!pick) return null;
  if (pick._manual) return manual();
  if (pick._clear) return { value: '' };
  return { value: pick._value };
}

// ---- the editor loop ----------------------------------------------------------

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
      label: fieldLabel(f),
      description: fieldValue(p, f.key) || t('empty'),
      _f: f,
    }));
    items.push({ label: `$(check) ${t('done')}`, _done: true });
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('editingPlaceholder', { name: p.name }),
      ignoreFocusOut: true,
    });
    if (!pick || pick._done) return;

    const f = pick._f;
    let input;
    if (f.key === '__color') {
      const cur = fieldValue(p, f.key);
      const choices = COLOR_CHOICES.map((c) => ({
        label: colorLabel(c),
        description: c.value === cur ? t('current') : '',
        _value: c.value,
      }));
      const picked = await vscode.window.showQuickPick(choices, {
        placeHolder: t('pickBadge'),
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
            c.value === cur ? t('current') : c._free ? t('free') : t('inUse'),
          _value: c.value,
        }));
      const picked = await vscode.window.showQuickPick(choices, {
        placeHolder: t('pickHotkey'),
        ignoreFocusOut: true,
      });
      if (!picked) continue;
      input = picked._value;
    } else if (f.key === '__fallback') {
      const cur = p.fallbackId;
      const choices = [
        { label: `$(close) ${t('noneLabel')}`, _value: '' },
        { label: t('providersSep'), kind: vscode.QuickPickItemKind.Separator },
        ...list
          .filter((x) => x.id !== p.id) // can't fall back to itself
          .map((x) => ({
            label: `${badgeTextPrefix(x.color)}${x.name}`,
            description:
              (x.id === cur ? t('current') + '   ' : '') +
              ((x.env && x.env.ANTHROPIC_BASE_URL) || t('nativeSubscriptionParen')),
            _value: x.id,
          })),
      ];
      const picked = await vscode.window.showQuickPick(choices, {
        placeHolder: t('pickFallback'),
        ignoreFocusOut: true,
      });
      if (!picked) continue;
      input = picked._value;
    } else if (f.secret) {
      // Edit the token directly in SecretStorage; never round-trip it through
      // the profile JSON. Pre-fill with the real value so edits don't wipe it.
      const entered = await vscode.window.showInputBox({
        prompt: t('secretPrompt', { label: fieldLabel(f) }),
        value: cachedToken(p),
        password: true,
        ignoreFocusOut: true,
      });
      if (entered === undefined) continue;
      await setToken(p.id, entered);
      if (wasActive) await applyProfile(getProfiles()[index]);
      vscode.commands.executeCommand(`${SELF}.refresh`);
      continue;
    } else if (f.key === '__extraEnv') {
      // Free-form env vars manage themselves (add/edit/clear in a sub-loop) and
      // save as they go; re-apply if this is the live provider, then refresh.
      await editExtraEnv(index);
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
        prompt: fieldLabel(f),
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

module.exports = { firstFreeHotkey, editProfileFields };
