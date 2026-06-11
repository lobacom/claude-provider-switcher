// Import / export. Profiles round-trip as a plain JSON array. The local `id` is
// never exported (it's only meaningful for this machine's SecretStorage); imports
// get fresh ids. Tokens are excluded by default and only included on explicit
// request.

const vscode = require('vscode');
const crypto = require('crypto');
const { t } = require('./i18n');
const {
  getProfiles,
  cloneProfiles,
  saveProfiles,
  cachedToken,
  setToken,
  uniqueName,
} = require('./profiles');
const { firstFreeBadge } = require('./badges');
const { firstFreeHotkey } = require('./editor');

async function exportProfiles() {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage(t('noExport'));
    return;
  }
  const choice = await vscode.window.showQuickPick(
    [
      { label: t('exportWithout'), description: t('exportWithoutDesc'), _withTokens: false },
      { label: t('exportInclude'), description: t('exportIncludeDesc'), _withTokens: true },
    ],
    { placeHolder: t('exportPlaceholder'), ignoreFocusOut: true }
  );
  if (!choice) return;
  const out = profiles.map((p) => {
    const o = { name: p.name, env: { ...((p && p.env) || {}) } };
    if (p.color) o.color = p.color;
    if (p.hotkey) o.hotkey = p.hotkey;
    if (choice._withTokens) {
      const tk = cachedToken(p);
      if (tk) o.env.ANTHROPIC_AUTH_TOKEN = tk;
    }
    return o;
  });
  const uri = await vscode.window.showSaveDialog({
    saveLabel: t('exportLabel'),
    filters: { JSON: ['json'] },
    defaultUri: vscode.Uri.file('claude-providers.json'),
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(out, null, 2), 'utf8'));
  vscode.window.showInformationMessage(
    t('exportedMsg', { n: out.length, withKeys: choice._withTokens ? t('withKeysSuffix') : '' })
  );
}

async function importProfiles() {
  const picks = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: t('importLabel'),
    filters: { JSON: ['json'] },
  });
  if (!picks || !picks.length) return;
  let data;
  try {
    const buf = await vscode.workspace.fs.readFile(picks[0]);
    data = JSON.parse(Buffer.from(buf).toString('utf8'));
  } catch (e) {
    vscode.window.showErrorMessage(t('importReadError', { msg: e.message }));
    return;
  }
  if (!Array.isArray(data)) {
    vscode.window.showErrorMessage(t('importExpectArray'));
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
    vscode.window.showWarningMessage(t('importNoValid'));
    return;
  }
  await saveProfiles(draft);
  for (const [id, tk] of pendingTokens) await setToken(id, tk);
  vscode.window.showInformationMessage(
    t('importedMsg', {
      n: added,
      withKeys: pendingTokens.length ? t('importedKeysSuffix', { n: pendingTokens.length }) : '',
    })
  );
}

module.exports = { exportProfiles, importProfiles };
