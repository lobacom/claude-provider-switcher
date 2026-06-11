// The status bar item showing the active provider, plus the "restart the
// session to apply" hint.

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF } = require('./constants');
const { getProfiles, getActiveEnv, activeProfileIndex } = require('./profiles');
const { badgeTextPrefix, profileTooltip } = require('./badges');
const { healthOf, healthLabel } = require('./health');

let statusItem;

function initStatusBar(context) {
  statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusItem.command = `${SELF}.select`;
  context.subscriptions.push(statusItem);
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

module.exports = { initStatusBar, markRestartPending, updateStatus };
