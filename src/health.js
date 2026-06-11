// Health indicator + "Test connection".
// The health check shows each provider's reachability (🟢/🔴) in the tree and the
// active item's tooltip. It reuses the token-free model-list probe (GET /v1/models
// & friends) — a metadata call that runs NO inference, so it costs zero tokens
// (unlike "Test connection", which fires a real /v1/messages request). That's
// what makes the periodic mode safe to leave on. Mode is controlled by
// `healthCheck` (manual | periodic); manual is default, so nothing runs until
// you press the check button.

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF } = require('./constants');
const { getProfiles, cachedToken, resolveIndex } = require('./profiles');
const { probeModelsList, httpProbe } = require('./http');

const healthCache = new Map(); // profile.id → 'ok' | 'down' (absent = unknown/not checked)
let healthTimer; // setInterval handle when health check mode is 'periodic'

function healthOf(p) {
  return (p && p.id && healthCache.get(p.id)) || 'unknown';
}
function healthLabel(s) {
  return s === 'ok' ? t('health_reachable') : s === 'down' ? t('health_unreachable') : t('health_notChecked');
}
function healthColor(s) {
  if (s === 'ok') return new vscode.ThemeColor('charts.green');
  if (s === 'down') return new vscode.ThemeColor('charts.red');
  return undefined; // unknown → theme default
}

// Reachability verdict for one provider, from the model-list probe. A host that
// answers anything other than an auth rejection or a 5xx counts as reachable —
// many providers 404 on /v1/models yet serve /v1/messages fine.
async function checkOneHealth(p) {
  const base = p.env && p.env.ANTHROPIC_BASE_URL;
  if (!base) return 'ok'; // native subscription — can't probe, assume up
  const r = await probeModelsList(base, cachedToken(p));
  if (r.ok) return 'ok';
  if (!r.reachable) return 'down'; // nothing answered
  if (r.auth || r.serverError) return 'down';
  return 'ok'; // host answered (e.g. 404 — no model list), but it's up
}

// Probe every profile concurrently and update the cache.
async function checkAllHealth() {
  await Promise.all(
    getProfiles().map(async (p) => {
      if (!p.id) return;
      healthCache.set(p.id, await checkOneHealth(p));
    })
  );
}

// Manual "Check health" command — runs the probe with a progress toast and
// reports a summary.
async function checkHealthCommand() {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage(t('noProviders'));
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t('checkingHealth') },
    () => checkAllHealth()
  );
  vscode.commands.executeCommand(`${SELF}.refresh`);
  const down = profiles.filter((p) => healthOf(p) === 'down').map((p) => p.name);
  if (down.length) {
    vscode.window.showWarningMessage(
      t('healthSomeDown', { n: down.length, total: profiles.length, list: down.join(', ') })
    );
  } else {
    vscode.window.showInformationMessage(t('healthAllOk', { total: profiles.length }));
  }
}

// (Re)arm the periodic timer from settings. Clears any existing timer first, so
// it's safe to call on activation and whenever the relevant settings change.
function restartHealthTimer() {
  if (healthTimer) {
    clearInterval(healthTimer);
    healthTimer = undefined;
  }
  const cfg = vscode.workspace.getConfiguration(SELF);
  if (cfg.get('healthCheck') !== 'periodic') return;
  const mins = Math.max(1, Number(cfg.get('healthCheckIntervalMinutes')) || 5);
  const run = async () => {
    await checkAllHealth();
    vscode.commands.executeCommand(`${SELF}.refresh`);
  };
  run(); // check once immediately so the indicators populate
  healthTimer = setInterval(run, mins * 60 * 1000);
}

function disposeHealthTimer() {
  if (healthTimer) clearInterval(healthTimer);
}

// ---- test connection -------------------------------------------------------
// Unlike the health check this fires a real (1-token) /v1/messages request, so
// it verifies the API key too. Manual only.

async function testProfile(arg) {
  const i = resolveIndex(arg);
  const p = getProfiles()[i];
  if (!p) return;
  const base = p.env && p.env.ANTHROPIC_BASE_URL;
  if (!base) {
    vscode.window.showInformationMessage(t('nativeNothingToTest', { name: p.name }));
    return;
  }
  const env = p.env || {};
  const model =
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
    env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
    env.ANTHROPIC_DEFAULT_OPUS_MODEL;
  const r = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t('testing', { name: p.name }) },
    () => httpProbe(base, cachedToken(p), model)
  );
  if (r.kind === 'error') {
    vscode.window.showErrorMessage(t('testUnreachable', { name: p.name, msg: r.msg }));
    return;
  }
  const s = r.status;
  if (s === 200) {
    vscode.window.showInformationMessage(t('testConnected', { name: p.name }));
  } else if (s === 401 || s === 403) {
    vscode.window.showErrorMessage(t('testAuthFailed', { name: p.name, s }));
  } else if (s === 404) {
    vscode.window.showErrorMessage(t('testNotFound', { name: p.name }));
  } else if (s === 400) {
    vscode.window.showInformationMessage(t('test400', { name: p.name }));
  } else if (s === 429) {
    vscode.window.showWarningMessage(t('test429', { name: p.name }));
  } else {
    vscode.window.showWarningMessage(t('testOther', { name: p.name, s }));
  }
}

module.exports = {
  healthOf,
  healthLabel,
  healthColor,
  restartHealthTimer,
  disposeHealthTimer,
  checkHealthCommand,
  testProfile,
};
