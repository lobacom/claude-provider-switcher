// The status bar item showing the active provider, plus the "restart the
// session to apply" hint.

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF } = require('./constants');
const { getProfiles, getActiveEnv, activeProfileIndex, getCodexProfiles } = require('./profiles');
const { badgeTextPrefix, profileTooltip } = require('./badges');
const { healthOf, healthLabel } = require('./health');
const { codexActiveId, codexTooltip } = require('./codex');

let statusItem;
let codexItem;

function initStatusBar(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = `${SELF}.select`;
  context.subscriptions.push(statusItem);
  // Codex gets its own item right next to Claude's, with its own menu.
  codexItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  codexItem.command = `${SELF}.selectCodex`;
  context.subscriptions.push(codexItem);
}

// Set true on every switch; drives the "restart the session to apply" hint in the
// status bar (Claude Code reads the env when a session starts, not live). Cleared
// on window reload (the flag resets) — see updateStatus / markRestartPending.
let restartPending = false;
function markRestartPending() {
  if (vscode.workspace.getConfiguration(SELF).get('showRestartHint') === false) return;
  restartPending = true;
  updateStatus();
}

function updateStatus() {
  updateCodexStatus();
  if (!statusItem) return;
  const profiles = getProfiles();
  if (vscode.workspace.getConfiguration(SELF).get('showStatusBarItem') === false || profiles.length === 0) {
    statusItem.hide();
    return;
  }
  // A switch leaves any running Claude Code session pointed at the old provider
  // until it restarts; flag that with a warning tint + reminder line, and a
  // clickable Reload Window button (command: link works because isTrusted is on).
  statusItem.backgroundColor = restartPending
    ? new vscode.ThemeColor('statusBarItem.warningBackground')
    : undefined;
  const restartIcon = restartPending ? '$(warning) ' : '';
  const restartLines = restartPending
    ? ['', t('tip_restartPending'), '', `[🔄 ${t('tip_restartReload')}](command:workbench.action.reloadWindow)`]
    : [];

  const idx = activeProfileIndex();
  if (idx >= 0) {
    const p = profiles[idx];
    // status bar is text-only, so a logo badge just shows the plug + name
    statusItem.text = `${restartIcon}$(plug) ${badgeTextPrefix(p.color)}${p.name}`;
    const st = healthOf(p);
    const clickLine = t('tip_clickToSwitch');
    statusItem.tooltip = profileTooltip(
      p,
      (st !== 'unknown'
        ? ['', t('tip_status', { status: healthLabel(st) }), '', clickLine]
        : ['', clickLine]
      ).concat(restartLines)
    );
  } else {
    const base = getActiveEnv().ANTHROPIC_BASE_URL;
    statusItem.text = `${restartIcon}$(plug) ${base ? base : t('statusDefault')}`;
    statusItem.tooltip = profileTooltip({ name: t('statusDefault'), env: { ANTHROPIC_BASE_URL: base || '' } }, restartLines);
  }
  statusItem.show();
}

// The Codex item: shown once there are Codex profiles (hidden by
// `showCodexStatusBarItem`); names the provider config.toml uses.
function updateCodexStatus() {
  if (!codexItem) return;
  const profiles = getCodexProfiles();
  if (vscode.workspace.getConfiguration(SELF).get('showCodexStatusBarItem') === false || profiles.length === 0) {
    codexItem.hide();
    return;
  }
  const id = codexActiveId();
  const p = profiles.find((x) => x.id === id);
  if (p) {
    codexItem.text = `$(plug) ${t('codexStatus', { name: `${badgeTextPrefix(p.color)}${p.name}` })}`;
    codexItem.tooltip = codexTooltip(p, ['', t('tip_codexRestart'), '', t('tip_clickToSwitch')]);
  } else {
    codexItem.text = `$(plug) ${t('codexStatusDefault')}`;
    codexItem.tooltip = t('tip_clickToSwitch');
  }
  codexItem.show();
}

module.exports = { initStatusBar, markRestartPending, updateStatus };
