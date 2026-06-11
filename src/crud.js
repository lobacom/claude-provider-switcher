// Profile CRUD: the "Add provider" template menu, add / edit / delete /
// duplicate / reorder.

const vscode = require('vscode');
const crypto = require('crypto');
const { t } = require('./i18n');
const { SELF, CLAUDE_API_URL } = require('./constants');
const {
  getProfiles,
  cloneProfiles,
  saveProfiles,
  getActiveEnv,
  envEqual,
  cachedToken,
  fullEnv,
  setToken,
  resolveIndex,
  uniqueName,
} = require('./profiles');
const { allRemotePresets, allLocalPresets } = require('./providers');
const { firstFreeBadge, providerIcon } = require('./badges');
const { firstFreeHotkey, editProfileFields } = require('./editor');
const { applyProfile, writeActiveEnv } = require('./switching');
const { getPinnedId, setPinnedId } = require('./pinning');

// The "Add provider" menu: Custom (manual), a divider, the two Anthropic entries,
// a divider, then every built-in provider preset — each with its logo on the left.
// Returns the chosen template { name, env } or undefined.
async function pickProviderTemplate() {
  const sep = (label) => ({ label, kind: vscode.QuickPickItemKind.Separator });
  const customTag = `   ${t('customTag')}`;
  const items = [
    {
      label: `$(edit) ${t('customLabel')}`,
      description: t('customDesc'),
      _tpl: { name: 'Custom', env: {} },
    },
    sep(t('sepAnthropic')),
    {
      label: t('claudeSub'),
      description: t('claudeSubDesc'),
      iconPath: providerIcon('claude.png'),
      _tpl: { name: 'Claude Subscription', env: {}, icon: 'claude.png' },
    },
    {
      label: t('claudeApi'),
      description: t('claudeApiDesc', { url: CLAUDE_API_URL }),
      iconPath: providerIcon('claude.png'),
      _tpl: { name: 'Claude API', env: { ANTHROPIC_BASE_URL: CLAUDE_API_URL }, icon: 'claude.png' },
    },
    sep(t('sepCompatible')),
    ...allRemotePresets().map((pr) => ({
      label: pr.name,
      description: (pr.env.ANTHROPIC_BASE_URL || '') + (pr.custom ? customTag : ''),
      iconPath: providerIcon(pr.icon),
      _tpl: { name: pr.name, env: pr.env, icon: pr.icon },
    })),
    sep(t('sepLocal')),
    ...allLocalPresets().map((pr) => ({
      label: pr.name,
      description: (pr.env.ANTHROPIC_BASE_URL || '') + (pr.custom ? customTag : ''),
      iconPath: providerIcon(pr.icon),
      _tpl: { name: pr.name, env: pr.env, icon: pr.icon },
    })),
    sep(''),
    {
      label: `$(gear) ${t('manageCustom')}`,
      description: t('manageCustomDesc'),
      _manage: true,
    },
  ];
  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: t('addMenuPlaceholder'),
    ignoreFocusOut: true,
  });
  if (pick && pick._manage) {
    vscode.commands.executeCommand(`${SELF}.manageCustomProviders`);
    return undefined;
  }
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
  const del = t('deleteBtn');
  const ok = await vscode.window.showWarningMessage(
    t('deleteConfirm', { name: list[i].name }),
    { modal: true },
    del
  );
  if (ok !== del) return;
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
      await writeActiveEnv({});
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
  const tk = sourceId ? cachedToken({ id: sourceId }) : '';
  if (tk) await setToken(copy.id, tk); // carry the token over to the copy
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

module.exports = { addProfile, editProfile, deleteProfile, duplicateProfile, moveProfile };
