// Applying a profile and every way of switching to one: the quick-pick, numbered
// hotkeys, cycling, switch & reload, and the auto-fallback chain. Also owns the
// CLI mirror into ~/.claude/settings.json.

const vscode = require('vscode');
const { t } = require('./i18n');
const { SELF, CLAUDE_SECTION, CLAUDE_KEY } = require('./constants');
const {
  getProfiles,
  getActiveEnv,
  managedEnvKeys,
  activeProfileIndex,
  cachedToken,
  fullEnv,
  resolveIndex,
} = require('./profiles');
const { badgeTextPrefix } = require('./badges');
const { httpProbe, probeHealthy } = require('./http');
const { markRestartPending } = require('./statusbar');

// Mirror the active env into Claude Code's CLI config at ~/.claude/settings.json,
// under its `env` key — so a `claude` run in a plain terminal (outside the VS Code
// extension) picks up the same provider. We only manage the extension's env keys:
// existing values for those keys are replaced, everything else in the file is
// preserved. A file that exists but doesn't parse as JSON is left untouched (we
// don't clobber hand-written config). Gated by the `writeClaudeSettings` setting.
async function writeClaudeCliSettings(env) {
  const dir = vscode.Uri.joinPath(vscode.Uri.file(require('os').homedir()), '.claude');
  const uri = vscode.Uri.joinPath(dir, 'settings.json');

  let oldText = '';
  try {
    oldText = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  } catch { /* file doesn't exist yet — we'll create it */ }

  let obj = {};
  if (oldText.trim()) {
    try {
      obj = JSON.parse(oldText);
    } catch {
      vscode.window.showWarningMessage(t('claudeSettingsParseError', { path: uri.fsPath }));
      return;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) obj = {};

  const curEnv = obj.env && typeof obj.env === 'object' && !Array.isArray(obj.env) ? obj.env : {};
  // Clear everything this extension might own — the dedicated keys plus any
  // free-form (extra) env keys used by any profile — so switching away from a
  // profile that set, say, CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY removes it
  // too. Keys the user hand-added to settings.json that no profile uses survive.
  for (const k of managedEnvKeys()) delete curEnv[k];
  for (const [k, v] of Object.entries(env)) curEnv[k] = v; // apply the new env
  obj.env = curEnv;

  const newText = JSON.stringify(obj, null, 2);
  if (newText === oldText) return;
  try {
    await vscode.workspace.fs.createDirectory(dir);
  } catch { /* already exists */ }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(newText, 'utf8'));
}

// Write the env Claude Code should use: always into the VS Code extension's
// setting, and (when enabled) mirrored into ~/.claude/settings.json for the CLI.
async function writeActiveEnv(env) {
  await vscode.workspace
    .getConfiguration(CLAUDE_SECTION)
    .update(CLAUDE_KEY, env, vscode.ConfigurationTarget.Global);
  if (vscode.workspace.getConfiguration(SELF).get('writeClaudeSettings') === true) {
    await writeClaudeCliSettings(env);
  }
}

async function applyProfile(p) {
  if (!p) return;
  await writeActiveEnv(fullEnv(p));
  markRestartPending();
  vscode.window.setStatusBarMessage(t('applyMessage', { name: p.name }), 5000);
}

// User-initiated switch. When `autoFallbackOnApply` is on it probes the target
// and walks its fallback chain; otherwise it applies the profile directly.
// Afterwards, if the setting `switchAction` is `switchAndReload`, reload the window
// so a new Claude Code session starts against the new env right away.
async function switchProfile(p) {
  if (!p) return;
  if (vscode.workspace.getConfiguration(SELF).get('autoFallbackOnApply') === true) {
    await applyProfileWithFallback(p);
  } else {
    await applyProfile(p);
  }
  if (vscode.workspace.getConfiguration(SELF).get('switchAction') === 'switchAndReload') {
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  }
}

async function selectProfile() {
  const profiles = getProfiles();
  if (!profiles.length) {
    const add = t('addProvider');
    const r = await vscode.window.showInformationMessage(t('noProviders'), add);
    if (r === add) vscode.commands.executeCommand(`${SELF}.add`);
    return;
  }
  const active = activeProfileIndex();
  const items = profiles.map((p, i) => {
    const env = p.env || {};
    return {
      label: `${badgeTextPrefix(p.color)}${p.name}`,
      description:
        (i === active ? t('activeMarker') : '') +
        (env.ANTHROPIC_BASE_URL ? env.ANTHROPIC_BASE_URL : t('nativeSubscriptionParen')),
      detail: p.hotkey ? t('hotkeyDetail', { hotkey: p.hotkey }) : t('noHotkey'),
      _idx: i,
    };
  });
  const pick = await vscode.window.showQuickPick(items, { placeHolder: t('selectPlaceholder') });
  if (pick) await switchProfile(profiles[pick._idx]);
}

async function switchToIndex(n) {
  const p = getProfiles()[n];
  if (p) await switchProfile(p);
  else vscode.window.showInformationMessage(t('providerNotDefined', { n: n + 1 }));
}

// Cycle to the next (dir=1) or previous (dir=-1) provider, wrapping around.
// With nothing active yet, dir=1 lands on the first profile, dir=-1 on the last.
async function cycleProfile(dir) {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage(t('noProviders'));
    return;
  }
  const cur = activeProfileIndex();
  const start = cur < 0 ? (dir > 0 ? -1 : 0) : cur;
  const next = (start + dir + profiles.length) % profiles.length;
  await switchProfile(profiles[next]);
}

// Switch to a provider and immediately reload the window, so any running Claude
// Code session is torn down and the next one starts against the new env (the env
// is only read at session start). `arg` may be a tree item (right-click); without
// one, prompt for the provider first.
async function switchAndReload(arg) {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage(t('noProviders'));
    return;
  }
  let p;
  const i = resolveIndex(arg);
  if (i >= 0 && profiles[i]) {
    p = profiles[i];
  } else {
    const active = activeProfileIndex();
    const items = profiles.map((x, idx) => ({
      label: `${badgeTextPrefix(x.color)}${x.name}`,
      description:
        (idx === active ? t('activeMarker') : '') +
        ((x.env && x.env.ANTHROPIC_BASE_URL) || t('nativeSubscriptionParen')),
      _idx: idx,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('switchReloadPlaceholder'),
    });
    if (!pick) return;
    p = profiles[pick._idx];
  }
  await switchProfile(p);
  await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

// ---- auto-fallback ---------------------------------------------------------
// A profile may name a `fallbackId` — another profile to use when this one is
// unreachable. On switch (via `switchWithFallback`, or any switch when
// `autoFallbackOnApply` is on) we probe the target and, if it's down, walk the
// fallback chain and apply the first healthy provider. "Healthy" = HTTP 200/400
// (endpoint + key work). A native-subscription profile (no Base URL) can't be
// probed, so it's treated as always reachable — a good chain terminator.

async function applyProfileWithFallback(startP) {
  if (!startP) return;
  const profiles = getProfiles();
  // Build the chain start → fallback → … stopping on a cycle or a dead link.
  const chain = [];
  const seen = new Set();
  let p = startP;
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    chain.push(p);
    p = p.fallbackId ? profiles.find((x) => x.id === p.fallbackId) : null;
  }

  const skipped = [];
  for (const cand of chain) {
    const base = cand.env && cand.env.ANTHROPIC_BASE_URL;
    let healthy;
    if (!base) {
      healthy = true; // native subscription — assume reachable
    } else {
      const env = cand.env || {};
      const model =
        env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
        env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
        env.ANTHROPIC_DEFAULT_OPUS_MODEL;
      const r = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: t('checking', { name: cand.name }) },
        () => httpProbe(base, cachedToken(cand), model)
      );
      healthy = probeHealthy(r);
    }
    if (healthy) {
      await applyProfile(cand);
      if (skipped.length) {
        vscode.window.showWarningMessage(
          t('fellBack', { skipped: skipped.join(', '), name: cand.name })
        );
      }
      return cand;
    }
    skipped.push(`"${cand.name}"`);
  }

  // Nothing in the chain answered — keep the user pointed at the original.
  await applyProfile(startP);
  vscode.window.showErrorMessage(
    skipped.length > 1
      ? t('noReachableChain', { chain: skipped.join(' → '), name: startP.name })
      : t('unreachableNoFallback', { name: startP.name })
  );
  return startP;
}

// Explicit command — always probes + falls back, regardless of the setting.
async function switchWithFallback(arg) {
  const profiles = getProfiles();
  if (!profiles.length) {
    vscode.window.showInformationMessage(t('noProviders'));
    return;
  }
  let p;
  const i = resolveIndex(arg);
  if (i >= 0 && profiles[i]) {
    p = profiles[i];
  } else {
    const items = profiles.map((x, idx) => ({
      label: `${badgeTextPrefix(x.color)}${x.name}`,
      description:
        ((x.env && x.env.ANTHROPIC_BASE_URL) || t('nativeSubscriptionParen')) +
        (x.fallbackId ? t('hasFallback') : ''),
      _idx: idx,
    }));
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('switchFallbackPlaceholder'),
    });
    if (!pick) return;
    p = profiles[pick._idx];
  }
  await applyProfileWithFallback(p);
}

module.exports = {
  writeClaudeCliSettings,
  writeActiveEnv,
  applyProfile,
  switchProfile,
  selectProfile,
  switchToIndex,
  cycleProfile,
  switchAndReload,
  switchWithFallback,
};
