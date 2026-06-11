// Badges, provider icons and the shared profile tooltip.
// A badge (profile.color) is an emoji shape ("🟢") shown as a text prefix, or
// "" (none). Provider logos live only in the "Add provider" menu and in the
// hover tooltip — not as badges, since the tree has a single icon slot.

const vscode = require('vscode');
const { t } = require('./i18n');
const { CLAUDE_API_URL } = require('./constants');
const { normalizeUrl } = require('./http');
const { allRemotePresets, allLocalPresets } = require('./providers');
const { getProfiles } = require('./profiles');

// Set at activation; needed to resolve bundled logo files under media/providers/.
let extensionUri;
function initBadges(uri) {
  extensionUri = uri;
}

// Badge palette: each entry is an emoji `value` plus a `color`/`shape` so the
// human label can be localized at render time (see colorLabel). `value: ''` is
// the "None" entry.
const COLOR_CHOICES = [
  { value: '🟢', color: 'green' },
  { value: '🔵', color: 'blue' },
  { value: '🟣', color: 'purple' },
  { value: '🟡', color: 'yellow' },
  { value: '🟠', color: 'orange' },
  { value: '🔴', color: 'red' },
  { value: '⚪', color: 'white' },
  { value: '🟤', color: 'brown' },
  { value: '⚫', color: 'black' },
  { value: '🟩', color: 'green', shape: 'square' },
  { value: '🟦', color: 'blue', shape: 'square' },
  { value: '🟪', color: 'purple', shape: 'square' },
  { value: '🟨', color: 'yellow', shape: 'square' },
  { value: '🟧', color: 'orange', shape: 'square' },
  { value: '🟥', color: 'red', shape: 'square' },
  { value: '⬜', color: 'white', shape: 'square' },
  { value: '🟫', color: 'brown', shape: 'square' },
  { value: '⬛', color: 'black', shape: 'square' },
  { value: '🔷', color: 'blue', shape: 'diamond' },
  { value: '🔶', color: 'orange', shape: 'diamond' },
  { value: '', none: true },
];

// Localized "🟢  Green" / "$(close)  None" label for a palette entry.
function colorLabel(c) {
  if (c.none) return `$(close)  ${t('noneLabel')}`;
  const name = t('color_' + c.color) + (c.shape ? t('color_join') + t('shape_' + c.shape) : '');
  return `${c.value}  ${name}`;
}

// All badge values in pick order (everything except the "None" entry).
const BADGE_VALUES = COLOR_CHOICES.map((c) => c.value).filter(Boolean);

// First badge not used by any other profile, so auto-assigned badges stay distinct.
// Falls back to spreading across the palette once every badge is taken.
function firstFreeBadge(profiles, excludeIndex) {
  const used = new Set(
    profiles
      .filter((_, i) => i !== excludeIndex)
      .map((p) => p.color)
      .filter(Boolean)
  );
  const free = BADGE_VALUES.find((v) => !used.has(v));
  return free || BADGE_VALUES[profiles.length % BADGE_VALUES.length];
}

function badgeTextPrefix(c) {
  // ignore legacy "icon:*" badge values left over from older versions
  return c && !c.startsWith('icon:') ? c + ' ' : '';
}

// Resolve an item icon: a "*.png" name → bundled logo Uri (needs the extension
// path), anything else → a codicon ThemeIcon id (used where there's no logo).
function providerIcon(icon) {
  if (!icon) return undefined;
  if (icon.endsWith('.png')) {
    return extensionUri
      ? vscode.Uri.joinPath(extensionUri, 'media', 'providers', icon)
      : undefined;
  }
  return new vscode.ThemeIcon(icon);
}

// Match a Base URL to a built-in template and return its logo file / codicon id.
function iconForBaseUrl(url) {
  const n = normalizeUrl(url);
  if (!n) return undefined;
  if (n === normalizeUrl(CLAUDE_API_URL)) return 'claude.png';
  for (const pr of [...allRemotePresets(), ...allLocalPresets()]) {
    if (pr.env && normalizeUrl(pr.env.ANTHROPIC_BASE_URL) === n) return pr.icon;
  }
  return undefined;
}

// Heuristic for "this looks like an LLM gateway" — the Base URL is some non-Anthropic
// remote host (so a shared API key, custom routing, model rewrites). We surface a
// tip about Claude Code's gated behaviour for gateways (see tip_gatewayNote). Local
// servers (localhost / 127.x) are excluded: they behave like direct API endpoints
// to Claude Code and don't have the /model discovery caveats.
function isGatewayProfile(p) {
  const n = normalizeUrl(p && p.env && p.env.ANTHROPIC_BASE_URL);
  if (!n) return false; // native subscription — not a gateway
  if (n === normalizeUrl(CLAUDE_API_URL)) return false; // direct Anthropic API
  // any host loopback / link-local counts as local, not gateway
  const host = (() => { try { return new (require('url').URL)(n).hostname.toLowerCase(); } catch { return ''; } })();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')) return false;
  return true;
}

// Read a bundled logo PNG once and cache it as a data: URI (so it can be
// embedded into a Markdown tooltip, which won't load local file images).
const _logoData = new Map();
function logoDataUri(file) {
  if (!file || !file.endsWith('.png') || !extensionUri) return undefined;
  if (_logoData.has(file)) return _logoData.get(file);
  let uri;
  try {
    const fsPath = vscode.Uri.joinPath(extensionUri, 'media', 'providers', file).fsPath;
    const b64 = require('fs').readFileSync(fsPath).toString('base64');
    uri = `data:image/png;base64,${b64}`;
  } catch {
    uri = undefined;
  }
  _logoData.set(file, uri);
  return uri;
}

// Tooltip (Markdown): the provider logo (matched by endpoint) plus name, hotkey,
// Base URL and the model mapping. Shared by the sidebar rows and the status bar.
function profileTooltip(p, extraLines) {
  const env = p.env || {};
  const lines = [`**${p.name}**`];
  if (p.hotkey) lines.push(t('tip_hotkey', { hotkey: p.hotkey }));
  lines.push(t('tip_baseUrl', { url: env.ANTHROPIC_BASE_URL || t('nativeSubscriptionParen') }));
  if (env.ANTHROPIC_DEFAULT_OPUS_MODEL) lines.push('opus → ' + env.ANTHROPIC_DEFAULT_OPUS_MODEL);
  if (env.ANTHROPIC_DEFAULT_SONNET_MODEL) lines.push('sonnet → ' + env.ANTHROPIC_DEFAULT_SONNET_MODEL);
  if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL) lines.push('haiku → ' + env.ANTHROPIC_DEFAULT_HAIKU_MODEL);
  if (p.fallbackId) {
    const tgt = getProfiles().find((x) => x.id === p.fallbackId);
    if (tgt) lines.push(t('tip_fallback', { name: tgt.name }));
  }
  if (isGatewayProfile(p)) lines.push(t('tip_gatewayNote'));
  if (extraLines) lines.push(...extraLines);

  const md = new vscode.MarkdownString();
  md.isTrusted = true; // enables command: links in tooltips
  // empty Base URL = native Claude subscription → show the Claude logo
  const baseUrl = env.ANTHROPIC_BASE_URL;
  const logoFile = iconForBaseUrl(baseUrl) || (baseUrl ? undefined : 'claude.png');
  const logo = logoDataUri(logoFile);
  if (logo) md.appendMarkdown(`![logo](${logo}|width=40,height=40)\n\n`);
  md.appendMarkdown(lines.join('  \n'));
  return md;
}

module.exports = {
  initBadges,
  COLOR_CHOICES,
  colorLabel,
  firstFreeBadge,
  badgeTextPrefix,
  providerIcon,
  profileTooltip,
};
