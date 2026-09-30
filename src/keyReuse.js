// Reusing an API key across the Claude and Codex sides. A provider usually has
// one key for both its Anthropic-compatible endpoint (Claude) and its OpenAI one
// (Codex) — e.g. api.minimax.io/anthropic and api.minimax.io/v1 — so when a key
// is asked for on one side, the keys the other side already holds for the same
// host are offered first. Never silent: the user picks, or types a new key.

const vscode = require('vscode');
const { t } = require('./i18n');
const { getProfiles, getCodexProfiles, cachedToken } = require('./profiles');
const { badgeTextPrefix } = require('./badges');
const cx = require('./agents/codex');
const { hostOf, sameHostKeys, maskKey } = require('./keyMatch');

// Profiles of the other side whose Base URL has the same host and which hold a
// key other than `current`. side = the side asking: 'claude' | 'codex'.
// Returns [{ profile, token }], one per distinct key.
function keyCandidates(side, url, current = '') {
  const others = side === 'codex'
    ? getProfiles().map((p) => ({ profile: p, url: p.env && p.env.ANTHROPIC_BASE_URL, token: cachedToken(p) }))
    : getCodexProfiles().map((p) => ({ profile: p, url: cx.baseUrl(p), token: cachedToken(p) }));
  return sameHostKeys(url, others, current);
}

// Ask for a key: when the other side has keys for the same host, offer them
// first, with "enter manually" as the last choice. Returns the key (trimmed; ''
// clears it) or undefined when cancelled.
//   side    — 'claude' | 'codex' (who is asking);
//   url     — the Base URL the key is for;
//   current — the key the profile has now (pre-filled for manual entry);
//   prompt  — the input box prompt.
async function askKey({ side, url, current = '', prompt }) {
  const found = keyCandidates(side, url, current);
  if (found.length) {
    const from = side === 'codex' ? 'keyReuseFromClaude' : 'keyReuseFromCodex';
    const items = [
      ...found.map((c) => ({
        label: `$(key) ${t(from, { name: `${badgeTextPrefix(c.profile.color)}${c.profile.name}` })}`,
        description: maskKey(c.token),
        _token: c.token,
      })),
      { label: '', kind: vscode.QuickPickItemKind.Separator },
      { label: `$(edit) ${t('keyReuseManual')}`, _manual: true },
    ];
    const pick = await vscode.window.showQuickPick(items, {
      placeHolder: t('keyReusePlaceholder', { host: hostOf(url) }),
      ignoreFocusOut: true,
    });
    if (!pick) return undefined;
    if (!pick._manual) return pick._token;
  }
  const v = await vscode.window.showInputBox({ prompt, value: current, password: true, ignoreFocusOut: true });
  return v === undefined ? undefined : v.trim();
}

module.exports = { keyCandidates, askKey };
