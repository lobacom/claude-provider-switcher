const vscode = require('vscode');
const { t } = require('./i18n');
const cx = require('./agents/codex');
const { probeModelsList } = require('./http');

async function availableModels(p, token) {
  const url = cx.baseUrl(p);
  let remote = [];
  if (url) {
    const r = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: t('codexModelsFetching', { url }) },
      () => probeModelsList(url, token, cx.requestExtra(p))
    );
    remote = r.ok ? r.models : [];
  }
  return [...new Set([...cx.modelIds(p), ...remote])];
}

// Select the default model, including saved models when discovery is unavailable.
async function pickCodexModel(p, token) {
  const cur = (p.codex && p.codex.model) || '';
  const models = await availableModels(p, token);
  if (models.length) {
    const pick = await vscode.window.showQuickPick([
      ...models.map((id) => ({ label: id, description: id === cur ? t('current') : '', _v: id })),
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      { label: t('codexModelManual'), _manual: true },
      { label: t('codexModelDefault'), _v: '' },
    ], { placeHolder: t('codexModelPlaceholder', { name: p.name }), ignoreFocusOut: true });
    if (!pick) return undefined;
    if (!pick._manual) return pick._v;
  }
  const v = await vscode.window.showInputBox({
    prompt: t('codexModelPrompt', { name: p.name }), value: cur, ignoreFocusOut: true,
  });
  return v === undefined ? undefined : v.trim();
}

// Repeated multi-select allows mixing discovered and manually entered model ids.
// Cancelling leaves the profile unchanged; an empty selection clears the list.
async function pickCodexModels(p, token) {
  let selected = cx.modelIds(p);
  let models = await availableModels(p, token);
  for (;;) {
    if (models.length) {
      const picks = await vscode.window.showQuickPick([
        ...models.map((id) => ({ label: id, _v: id, picked: selected.includes(id) })),
        { label: t('codexModelManual'), _manual: true },
      ], {
        canPickMany: true, placeHolder: t('codexModelsPlaceholder', { name: p.name }), ignoreFocusOut: true,
      });
      if (picks === undefined) return undefined;
      selected = picks.filter((p) => !p._manual).map((p) => p._v);
      if (!picks.some((p) => p._manual)) return selected;
    }
    const value = await vscode.window.showInputBox({
      prompt: t('codexModelsPrompt', { name: p.name }),
      value: selected.join(', '), ignoreFocusOut: true,
    });
    if (value === undefined) return undefined;
    selected = [...new Set(value.split(/[,;\n]+/).map((id) => id.trim()).filter(Boolean))];
    if (!models.length) return selected;
    models = [...new Set([...models, ...selected])];
  }
}

module.exports = { pickCodexModel, pickCodexModels };
