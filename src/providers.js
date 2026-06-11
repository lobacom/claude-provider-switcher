// Provider templates for the "Add provider" menu, so the user doesn't have to
// hunt down each provider's Anthropic-compatible endpoint. Each template's `env`
// carries the known-good defaults (Base URL and, for providers with fixed model
// names, the tier→model mapping). The auth token is never bundled — the user adds
// it afterwards, and every field stays editable in the profile editor. Endpoints
// are stable; model names change more often, so treat the model defaults as a
// starting point.
//
// The catalog itself lives in the bundled `providers.json` (loaded at activation
// by loadBundledProviders) rather than being hard-coded here, so it can be
// extended without touching this file. End users add missing providers via the
// `claudeProviderSwitcher.customProviders` setting (merged in by allRemotePresets
// / allLocalPresets) — see package.json for that setting's table editor.

const vscode = require('vscode');
const { SELF } = require('./constants');

// Populated by loadBundledProviders() from providers.json. Each entry's `icon`
// names a PNG under media/providers/ (provider logo) or a codicon id. Aggregators
// (Fireworks, Novita, OpenRouter, …) host many models, so they ship only the Base
// URL and let the user pick the model; single-model providers also get a tier→model
// mapping. They stay empty until activation if the file can't be read.
let PROVIDER_PRESETS = []; // hosted Anthropic-compatible gateways
let LOCAL_PRESETS = [];    // localhost servers (placeholder token baked in)

// Read the bundled catalog once at activation. readFileSync keeps it synchronous
// so the presets are ready before the first menu/tooltip renders. A malformed or
// missing file leaves the arrays empty — the Custom / Claude entries and any
// user-defined customProviders still work.
function loadBundledProviders(extensionUri) {
  if (!extensionUri) return;
  try {
    const fsPath = vscode.Uri.joinPath(extensionUri, 'providers.json').fsPath;
    const json = JSON.parse(require('fs').readFileSync(fsPath, 'utf8'));
    PROVIDER_PRESETS = Array.isArray(json.remote) ? json.remote : [];
    LOCAL_PRESETS = Array.isArray(json.local) ? json.local : [];
  } catch (e) {
    console.warn('claude-provider-switcher: could not load providers.json —', e.message);
  }
}

// Turn a `customProviders` setting entry into the { name, icon, env } template
// shape the rest of the code uses. Returns null for entries missing a name.
function customEntryToPreset(c) {
  if (!c || typeof c.name !== 'string' || !c.name.trim()) return null;
  const env = {};
  if (c.baseUrl && String(c.baseUrl).trim()) env.ANTHROPIC_BASE_URL = String(c.baseUrl).trim();
  if (c.opusModel) env.ANTHROPIC_DEFAULT_OPUS_MODEL = String(c.opusModel);
  if (c.sonnetModel) env.ANTHROPIC_DEFAULT_SONNET_MODEL = String(c.sonnetModel);
  if (c.haikuModel) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = String(c.haikuModel);
  return { name: c.name.trim(), icon: c.icon || 'server', env, custom: true };
}

// User-defined providers from the settings table, split into remote / local by
// their `local` flag so they slot into the right section of the Add menu.
function getCustomPresets() {
  const list = vscode.workspace.getConfiguration(SELF).get('customProviders');
  if (!Array.isArray(list)) return { remote: [], local: [] };
  const remote = [];
  const local = [];
  for (const c of list) {
    const tpl = customEntryToPreset(c);
    if (tpl) (c.local ? local : remote).push(tpl);
  }
  return { remote, local };
}

// The full preset lists used everywhere (menu, icon matching): bundled catalog
// plus the user's custom providers.
function allRemotePresets() {
  return [...PROVIDER_PRESETS, ...getCustomPresets().remote];
}
function allLocalPresets() {
  return [...LOCAL_PRESETS, ...getCustomPresets().local];
}

module.exports = { loadBundledProviders, allRemotePresets, allLocalPresets };
