// Workspace pinning. A workspace can pin one provider; when that workspace is
// (re)opened the extension auto-switches to it. The mapping lives in
// workspaceState (a VS Code Memento scoped to the workspace) so it never touches
// settings.json or the repo. Honoring the pin on open is gated by
// `applyPinnedOnOpen` (default true).

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF } = require('./constants');
const { getProfiles, getActiveEnv, envEqual, fullEnv, resolveIndex } = require('./profiles');
const { badgeTextPrefix } = require('./badges');
const { applyProfile, switchProfile } = require('./switching');

const PIN_KEY = `${SELF}.pinnedProfileId`; // workspaceState: profile pinned to this workspace

let workspaceState; // context.workspaceState — holds this workspace's pinned profile id

function initPinning(state) {
  workspaceState = state;
}

function getPinnedId() {
  return workspaceState ? workspaceState.get(PIN_KEY) : undefined;
}
async function setPinnedId(id) {
  if (workspaceState) await workspaceState.update(PIN_KEY, id || undefined);
}
function hasWorkspace() {
  const f = vscode.workspace.workspaceFolders;
  return !!(f && f.length);
}

// On open: if this workspace pins a provider that still exists and isn't already
// active, switch to it. Silent no-op otherwise.
async function applyPinnedProfile() {
  if (!workspaceState || !hasWorkspace()) return;
  if (vscode.workspace.getConfiguration(SELF).get('applyPinnedOnOpen') === false) return;
  const id = getPinnedId();
  if (!id) return;
  const p = getProfiles().find((x) => x.id === id);
  if (!p) return; // pinned profile was deleted
  if (envEqual(fullEnv(p), getActiveEnv())) return; // already active
  await switchProfile(p);
}

// Pin (or unpin) a provider for the current workspace. `arg` may be a tree item
// (right-click) — then pin that profile directly; otherwise prompt.
async function pinToWorkspace(arg) {
  if (!workspaceState) return;
  if (!hasWorkspace()) {
    vscode.window.showInformationMessage(t('openFolderFirst'));
    return;
  }
  const profiles = getProfiles();
  const pinned = getPinnedId();
  const folderName = vscode.workspace.workspaceFolders[0].name;

  let chosen; // { id } | { unpin: true } | undefined (cancelled)
  const i = resolveIndex(arg);
  if (i >= 0 && profiles[i]) {
    chosen = { id: profiles[i].id };
  } else {
    const items = [
      {
        label: t('dontAutoSwitch'),
        description: pinned ? '' : t('current'),
        _unpin: true,
      },
      { label: t('providersSep'), kind: vscode.QuickPickItemKind.Separator },
      ...profiles.map((p) => ({
        label: `${badgeTextPrefix(p.color)}${p.name}`,
        description:
          (p.id === pinned ? t('pinnedMarker') : '') +
          ((p.env && p.env.ANTHROPIC_BASE_URL) || t('nativeSubscriptionParen')),
        _id: p.id,
      })),
    ];
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('pinPlaceholder', { folder: folderName }),
      ignoreFocusOut: true,
    });
    if (!pick) return;
    chosen = pick._unpin ? { unpin: true } : { id: pick._id };
  }

  if (chosen.unpin) {
    await setPinnedId(undefined);
    vscode.window.showInformationMessage(t('unpinnedMsg', { folder: folderName }));
  } else {
    await setPinnedId(chosen.id);
    const p = profiles.find((x) => x.id === chosen.id);
    if (p) await applyProfile(p);
    vscode.window.showInformationMessage(
      t('pinnedMsg', { name: p ? p.name : t('providerWord'), folder: folderName })
    );
  }
  vscode.commands.executeCommand(`${SELF}.refresh`);
}

module.exports = { initPinning, getPinnedId, setPinnedId, applyPinnedProfile, pinToWorkspace };
