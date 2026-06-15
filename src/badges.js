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
const { usageOf, formatActive } = require('./usage');
const { tokenWindows, modelsUsed, formatTokens } = require('./tokens');
const { SELF } = require('./constants');

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

// Per-model token suffix: " (today X · 7d Y · 30d Z)" of input+output for a mapped
// model, or "" when token stats are off or the model has no recorded usage.
function modelTokenSuffix(p, cfg, modelId) {
  if (!p.id || !modelId || cfg.get('showTokenStats') === false) return '';
  const { today, week, month } = tokenWindows(p.id, modelId);
  const tIo = today.input + today.output;
  const wIo = week.input + week.output;
  const mIo = month.input + month.output;
  if (!wIo && !tIo && !mIo) return '';
  return ' ' + t('tip_modelTokens', {
    today: formatTokens(tIo),
    week: formatTokens(wIo),
    month: formatTokens(mIo),
  });
}

// Tooltip (Markdown): the provider logo (matched by endpoint) plus name, hotkey,
// Base URL and the model mapping. Shared by the sidebar rows and the status bar.
function profileTooltip(p, extraLines) {
  const env = p.env || {};
  const cfg = vscode.workspace.getConfiguration(SELF);
  const lines = [`**${p.name}**`];
  if (p.hotkey) lines.push(t('tip_hotkey', { hotkey: p.hotkey }));
  lines.push(t('tip_baseUrl', { url: env.ANTHROPIC_BASE_URL || t('nativeSubscriptionParen') }));
  // Fable first — it's the top tier. Explicit mapping, or the opus default
  // fullEnv() will apply (marked with the defaulted-suffix so the user sees
  // it's implicit).
  {
    const fable = env.ANTHROPIC_DEFAULT_FABLE_MODEL ||
      (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_DEFAULT_OPUS_MODEL) || '';
    if (fable) {
      lines.push('fable → ' + fable +
        (env.ANTHROPIC_DEFAULT_FABLE_MODEL ? '' : t('tip_fableDefaulted')) +
        modelTokenSuffix(p, cfg, fable));
    }
  }
  if (env.ANTHROPIC_DEFAULT_OPUS_MODEL) lines.push('opus → ' + env.ANTHROPIC_DEFAULT_OPUS_MODEL + modelTokenSuffix(p, cfg, env.ANTHROPIC_DEFAULT_OPUS_MODEL));
  if (env.ANTHROPIC_DEFAULT_SONNET_MODEL) lines.push('sonnet → ' + env.ANTHROPIC_DEFAULT_SONNET_MODEL + modelTokenSuffix(p, cfg, env.ANTHROPIC_DEFAULT_SONNET_MODEL));
  if (env.ANTHROPIC_DEFAULT_HAIKU_MODEL) lines.push('haiku → ' + env.ANTHROPIC_DEFAULT_HAIKU_MODEL + modelTokenSuffix(p, cfg, env.ANTHROPIC_DEFAULT_HAIKU_MODEL));
  if (p.fallbackId) {
    const tgt = getProfiles().find((x) => x.id === p.fallbackId);
    if (tgt) lines.push(t('tip_fallback', { name: tgt.name }));
  }
  if (isGatewayProfile(p)) lines.push(t('tip_gatewayNote'));
  // Usage stats (switch count + active time), gated by the setting. Only shown
  // once the provider has actually been used, so untouched rows stay clean.
  if (p.id && cfg.get('showUsageStats') !== false) {
    const u = usageOf(p.id);
    if (u.switches > 0 || u.activeMs > 0) {
      lines.push(t('tip_usage', { switches: u.switches, time: formatActive(u.activeMs) }));
    }
  }
  // Token totals attributed to this provider from Claude Code's transcripts,
  // windowed: today + last 7 + last 30 days. Headline is input+output (the "work"
  // tokens); two breakdown lines carry the (usually dominant) cache numbers for the
  // 7-day and 30-day windows. The 7-day line is dropped when there was no activity
  // in the last week (so it doesn't show a row of zeros under a busy 30-day total).
  if (p.id && cfg.get('showTokenStats') !== false) {
    const { today, week, month } = tokenWindows(p.id);
    const weekAny = week.input || week.output || week.cacheRead || week.cacheCreate;
    const monthAny = month.input || month.output || month.cacheRead || month.cacheCreate;
    if (monthAny) {
      lines.push(t('tip_tokens', {
        today: formatTokens(today.input + today.output),
        week: formatTokens(week.input + week.output),
        month: formatTokens(month.input + month.output),
      }));
      if (weekAny) {
        lines.push(t('tip_tokensBreakdown', {
          in: formatTokens(week.input),
          out: formatTokens(week.output),
          cache: formatTokens(week.cacheRead + week.cacheCreate),
        }));
      }
      lines.push(t('tip_tokensBreakdown30', {
        in: formatTokens(month.input),
        out: formatTokens(month.output),
        cache: formatTokens(month.cacheRead + month.cacheCreate),
      }));
      // No model mapping (native subscription) → no "opus →" lines to annotate;
      // list the models actually used instead, busiest first, capped to keep the
      // tooltip compact.
      if (
        !env.ANTHROPIC_DEFAULT_OPUS_MODEL &&
        !env.ANTHROPIC_DEFAULT_SONNET_MODEL &&
        !env.ANTHROPIC_DEFAULT_HAIKU_MODEL
      ) {
        for (const mu of modelsUsed(p.id).slice(0, 4)) {
          lines.push('   ' + mu.model + ' ' + t('tip_modelTokens', {
            today: formatTokens(mu.today.input + mu.today.output),
            week: formatTokens(mu.week.input + mu.week.output),
            month: formatTokens(mu.month.input + mu.month.output),
          }));
        }
      }
    }
  }
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
