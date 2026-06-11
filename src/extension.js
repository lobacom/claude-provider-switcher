// Entry point: wires the modules together — registers commands, the tree view
// and the status bar, runs the one-time migrations, and reacts to setting
// changes. All behaviour lives in the sibling modules.

const vscode = require('vscode');
const { t, setLang } = require('./i18n');
const { SELF, CLAUDE_SECTION, CLAUDE_KEY } = require('./constants');
const {
  getProfiles,
  getActiveEnv,
  initSecrets,
  refreshTokenCache,
  migrateProfiles,
  resolveIndex,
  activeProfileIndex,
} = require('./profiles');
const { loadBundledProviders } = require('./providers');
const { initBadges } = require('./badges');
const { initStatusBar, updateStatus } = require('./statusbar');
const {
  writeClaudeCliSettings,
  selectProfile,
  switchProfile,
  switchToIndex,
  cycleProfile,
  switchAndReload,
  switchWithFallback,
} = require('./switching');
const { initPinning, applyPinnedProfile, pinToWorkspace } = require('./pinning');
const { addProfile, editProfile, deleteProfile, duplicateProfile, moveProfile } = require('./crud');
const { exportProfiles, importProfiles } = require('./transfer');
const { restartHealthTimer, disposeHealthTimer, checkHealthCommand, testProfile } = require('./health');
const { manageCustomProviders, relocalizeCustomProvidersPanel } = require('./customProviders');
const { syncKeybindings } = require('./keybindings');
const { ProfilesProvider } = require('./tree');
const { initUsage, resumeUsage, tickUsage, resetUsage } = require('./usage');
const { initTokens, scanTokens, resetTokens } = require('./tokens');

// Token scanning reads Claude Code's transcripts; gated so users who turn it off
// pay nothing (no file reads at all).
function tokenStatsEnabled() {
  return vscode.workspace.getConfiguration(SELF).get('showTokenStats') !== false;
}

// Bank the active provider's running time every minute, so totals stay fresh
// between switches (and survive a crash with at most ~1 minute lost).
const USAGE_HEARTBEAT_MS = 60000;
let usageTimer;

// The UI language is driven by the `language` setting (auto | en | ru | zh) so it
// switches live, independent of VS Code's display language. `auto` follows VS
// Code's display language, falling back to English. Resolved into the i18n module
// via setLang() on activation and whenever the setting changes.
function resolveLanguage() {
  const cfg = vscode.workspace.getConfiguration(SELF).get('language') || 'en';
  if (cfg === 'en' || cfg === 'ru' || cfg === 'zh') return cfg;
  const v = (vscode.env.language || 'en').toLowerCase(); // 'auto'
  if (v.startsWith('ru')) return 'ru';
  if (v.startsWith('zh')) return 'zh';
  return 'en';
}
function applyLanguage() {
  setLang(resolveLanguage());
}

function activate(context) {
  initSecrets(context.secrets);
  initPinning(context.workspaceState);
  initUsage(context.globalState);
  initTokens(context.globalState);
  initBadges(context.extensionUri);
  applyLanguage(); // resolve the UI language before anything renders
  loadBundledProviders(context.extensionUri); // populate the preset catalog from providers.json

  const provider = new ProfilesProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(`${SELF}.view`, provider)
  );
  initStatusBar(context);

  const reg = (name, fn) =>
    context.subscriptions.push(vscode.commands.registerCommand(`${SELF}.${name}`, fn));

  reg('select', selectProfile);
  reg('add', addProfile);
  reg('edit', editProfile);
  reg('delete', deleteProfile);
  reg('duplicate', duplicateProfile);
  reg('moveUp', (arg) => moveProfile(arg, -1));
  reg('moveDown', (arg) => moveProfile(arg, 1));
  reg('switchTo', async (arg) => {
    const i = resolveIndex(arg);
    if (i >= 0) await switchProfile(getProfiles()[i]);
  });
  reg('switchToIndex', async (idx) => switchToIndex(typeof idx === 'number' ? idx : parseInt(idx, 10)));
  reg('next', async () => cycleProfile(1));
  reg('previous', async () => cycleProfile(-1));
  reg('test', testProfile);
  reg('export', exportProfiles);
  reg('import', importProfiles);
  reg('pinToWorkspace', pinToWorkspace);
  reg('switchWithFallback', switchWithFallback);
  reg('switchAndReload', switchAndReload);
  reg('checkHealth', checkHealthCommand);
  reg('manageCustomProviders', manageCustomProviders);
  reg('resetUsageStats', async () => {
    const yes = t('resetUsageConfirmYes');
    const r = await vscode.window.showWarningMessage(t('resetUsageConfirm'), { modal: true }, yes);
    if (r !== yes) return;
    await resetUsage();
    await resetTokens();
    provider.refresh();
    updateStatus();
    vscode.window.setStatusBarMessage(t('resetUsageDone'), 2500);
  });
  reg('refresh', () => {
    provider.refresh();
    updateStatus();
  });

  // Migrate older profiles (assign ids, move tokens to SecretStorage), prime the
  // token cache, then repaint once everything is loaded.
  (async () => {
    await migrateProfiles();
    await refreshTokenCache();
    // If this workspace pins a provider, switch to it now (before a Claude Code
    // session starts). Runs after the token cache so fullEnv() matches correctly.
    await applyPinnedProfile();
    // Resume usage timing for whatever provider is active now (a pin switch above
    // already counted its switch; this only restarts the active-time clock).
    const ai = activeProfileIndex();
    await resumeUsage(ai >= 0 ? getProfiles()[ai].id : undefined);
    // First token scan (reads transcripts) — after the timeline is seeded so
    // sessions attribute correctly. Repaint once it's in.
    if (tokenStatsEnabled()) {
      await scanTokens();
    }
    provider.refresh();
    updateStatus();
    // Arm health checks only after the token cache is primed. Otherwise the
    // first periodic probe races the (async) token load, sends no key, and marks
    // every authed provider as unreachable until the user hits the ❤ button.
    restartHealthTimer();
  })();

  // initial sync
  syncKeybindings().then(() => vscode.window.setStatusBarMessage(t('hotkeysSynced'), 2500));

  // Periodically bank the active provider's elapsed time (usage.js) and refresh
  // token stats (tokens.js — incremental, only re-reads changed transcripts).
  usageTimer = setInterval(() => {
    tickUsage();
    if (tokenStatsEnabled()) scanTokens().then(() => { provider.refresh(); updateStatus(); });
  }, USAGE_HEARTBEAT_MS);
  context.subscriptions.push({ dispose: () => clearInterval(usageTimer) });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      // Language change: re-resolve and repaint everything that's localized.
      if (e.affectsConfiguration(`${SELF}.language`)) {
        applyLanguage();
        provider.refresh();
        updateStatus();
        // Re-render the custom-providers table (if open) in the new language.
        relocalizeCustomProvidersPanel();
      }
      if (
        e.affectsConfiguration(`${CLAUDE_SECTION}.${CLAUDE_KEY}`) ||
        e.affectsConfiguration(`${SELF}.profiles`) ||
        e.affectsConfiguration(`${SELF}.customProviders`) ||
        e.affectsConfiguration(`${SELF}.showStatusBarItem`)
      ) {
        provider.refresh();
        updateStatus();
        if (e.affectsConfiguration(`${SELF}.profiles`)) {
          syncKeybindings();
        }
      }
      if (
        e.affectsConfiguration(`${SELF}.healthCheck`) ||
        e.affectsConfiguration(`${SELF}.healthCheckIntervalMinutes`)
      ) {
        restartHealthTimer();
      }
      // Just turned on CLI mirroring → push the current active env into
      // ~/.claude/settings.json right away, so it takes effect without a switch.
      if (
        e.affectsConfiguration(`${SELF}.writeClaudeSettings`) &&
        vscode.workspace.getConfiguration(SELF).get('writeClaudeSettings') === true
      ) {
        writeClaudeCliSettings(getActiveEnv());
      }
    })
  );

  updateStatus();
}

function deactivate() {
  disposeHealthTimer();
  if (usageTimer) clearInterval(usageTimer);
  // Best-effort final bank of the running segment before the host tears us down.
  tickUsage();
}

module.exports = { activate, deactivate };
