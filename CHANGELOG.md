# Changelog

## 0.7.4

- **Provider:** added **Xiaomi MiMo** to the built-in catalog (api.xiaomimimo.com/anthropic,
  mimo-v2.5-pro / mimo-v2-pro / mimo-v2-flash defaults).
- **Docs:** rewrote README from scratch — restructured around the status bar (main switching surface)
  and four core scenarios, removed the *How it compares* section, added missing settings to the table,
  aligned RU/ZH sections with EN, switched to an English screenshot.

## 0.7.3

- **Docs:** removed the stale `row ▶ (inline)` from the *Switch to* row of the provider-management table
  in all three languages — clicking a row has switched the provider since 0.4.2; the inline ▶ button is
  gone. The other inline actions (Test/Edit/Delete) are kept, so they're left as-is.

## 0.7.2

- **Docs:** added a *How it compares* section (EN/RU/ZH) — a category-based comparison (other in-editor
  switchers, desktop switcher apps, proxy/router gateways) explaining where this extension fits and when a
  proxy router is the better choice. No code changes.

## 0.7.1

- **Docs:** corrected the "restart the session after switching" note (EN/RU/ZH). A *resumed* chat — and a
  window reload, which restores the conversation — keeps the model and settings from its saved transcript,
  so a reload alone may not pick up a model change; a **new chat** is the reliable way to apply a
  provider/model switch. The note now also points to the `switchAction` setting / *Switch & reload*
  command for automatic reload.

## 0.7.0

- **Mirror to the Claude Code CLI config.** A new `claudeProviderSwitcher.writeClaudeSettings` setting
  (off by default) also writes the active provider into `~/.claude/settings.json` (under its `env` key),
  so `claude` run in a plain terminal — not just the VS Code extension — uses the same provider. Only the
  keys this extension manages (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, the model/timeout vars) are
  touched; everything else in that file is preserved, and a file that doesn't parse as JSON is left
  untouched. Turning the setting on syncs the current provider immediately.
- **Switch action setting.** A new `claudeProviderSwitcher.switchAction` setting (default `switch`, or
  `switchAndReload`) controls what happens on every switch (sidebar click, hotkey, cycle, menu). When set
  to `switchAndReload`, the window reloads right after the switch so a new Claude Code session picks up
  the provider immediately — no extra click needed.
- **Switch & reload command.** A new *Switch provider & reload window* command (right-click a provider, or
  the command palette) switches and then reloads the window in one step, regardless of the setting.
- **Restart reminder in the status bar.** After switching, the status bar item gets a warning tint, a
  reminder that the Claude Code session must restart, and a **clickable Reload Window button**. Toggle
  with `claudeProviderSwitcher.showRestartHint` (on by default). The tint and reminder clear on reload.
- **Gateway tip in the tooltip.** Profiles that look like an LLM gateway (non-Anthropic, non-local
  `BASE_URL`) now show a short note in the tooltip: the active model comes from the
  `ANTHROPIC_DEFAULT_*_MODEL` mapping (it appears in `/model` as Custom Opus/Sonnet/Haiku), and after
  switching you should start a new chat — a resumed chat keeps its previous model. The other profiles are
  unchanged.
- **Extra environment variables per profile.** The profile editor has a new *Extra environment variables*
  field — a small add/edit/clear list for any other variable Claude Code reads (e.g.
  `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`, `ANTHROPIC_CUSTOM_HEADERS`) without hand-editing
  `settings.json`. They're written alongside the dedicated vars (and mirrored to `~/.claude/settings.json`
  when that's enabled). Names that have their own field (Base URL, models, timeout) are rejected to avoid
  collisions.
  effect; it clears on reload. Toggle with `claudeProviderSwitcher.showRestartHint` (on by default).

## 0.6.0

- **UI language switch.** A new `claudeProviderSwitcher.language` setting (`auto` / `en` / `ru` / `zh`,
  default `auto`) localizes the extension's own UI — menus, notifications, the sidebar, the status bar and
  the custom-providers table — into **English, Russian and Chinese**. It switches live, independent of
  VS Code's display language; `auto` follows VS Code and falls back to English.
- **Localized command titles** (and therefore the sidebar button tooltips — *Test connection*, *Edit*,
  *Delete*, …) via VS Code NLS files (`package.nls.{ru,zh-cn}.json`). These follow VS Code's **display
  language** (Command Palette → *Configure Display Language*), not the `language` setting above — VS Code
  resolves static command titles at load time, so an extension can't rebind them to a custom setting.

## 0.5.1

- **Docs:** the README now explains how to use custom providers — a *Manage custom providers…* table
  row in the sidebar reference, plus an "Adding a provider that isn't in the list" section (with the
  table columns) in all three languages.

## 0.5.0

- **Built-in provider catalog moved to `providers.json`.** The list of bundled providers shown in the
  *Add provider* menu now lives in a separate, packaged `providers.json` instead of being hard-coded,
  so it can be extended without changing the extension code.
- **Add your own providers.** A new `claudeProviderSwitcher.customProviders` setting holds providers
  that aren't in the built-in list (name, Base URL, optional logo and per-tier models, and a *local*
  flag). Edit them in a **table editor** — run *Manage custom providers…* (the *Add provider* menu, the
  view title-bar `…` overflow, or the command palette) — which maps one-to-one onto the setting's JSON.
  Custom providers show up in the *Add provider* menu (tagged `(custom)`) alongside the bundled ones,
  and their endpoints are matched for logos and health checks just like the built-ins. API keys are
  still entered per-profile and kept in SecretStorage.

## 0.4.2

- **Click a provider to switch to it.** Clicking a row in the sidebar now activates that provider
  directly (with fallback when `autoFallbackOnApply` is on), like a radio list. The redundant inline ▶
  *Switch* button is gone; the filled circle still marks the active provider, and *Switch to this
  provider* remains in the right-click menu. Edit/test/delete are still available on hover and don't
  change the active provider.
- **Fix: health indicators no longer flash all-red on startup.** In `periodic` mode the first probe
  ran before the token cache finished loading, so authed providers got no API key, returned 401, and
  showed 🔴 until you pressed the ❤ button. The periodic timer is now armed only after the token cache
  is primed.

## 0.4.1

- **Fix: model list failed (HTTP 404) for providers whose Base URL has a path**, e.g. DeepSeek and
  MiniMax (`…/anthropic`). The model catalog lives off the host root, not under the `/anthropic`
  messages path, so picking a model now tries several candidate URLs (`<base>/v1/models`,
  `<base>/models`, and the same off the host root) and uses the first that returns a list. The health
  check uses the same probe, so it's more accurate too. When a provider genuinely has no model-list
  endpoint, the picker explains why and falls back to manual entry.
- **Fix:** the `profiles` setting description no longer claims a 1–10 limit (there is none; hotkeys
  just cover the first 10 slots).

## 0.4.0

- **Health indicator** — each provider shows a 🟢 (reachable) / 🔴 (unreachable) tint on its tree icon
  and in the active item's tooltip. Refresh it on demand with *Check provider health* (the ❤ button in
  the view title bar, or the command palette), or set `claudeProviderSwitcher.healthCheck` to `periodic`
  for an automatic timer (`healthCheckIntervalMinutes`, default 5). The check uses `GET /v1/models`,
  which runs **no inference and costs no tokens** — so the periodic mode is safe to leave on. Default is
  `manual` (nothing runs until you press the button).
- **Auto-fallback** — a profile can name a **fallback provider** (Edit → *Fallback provider*). Run
  *Switch with fallback* (right-click a provider, or the command palette) to probe the target and, if
  it's unreachable, automatically switch to its fallback — following the chain until a healthy provider
  answers (a native-subscription profile always counts as reachable, so it makes a good final
  fallback). Turn on `claudeProviderSwitcher.autoFallbackOnApply` to make **every** switch do this
  automatically. "Healthy" means the endpoint answers HTTP 200/400 (URL + key work).
- **Pin a provider to a workspace** — right-click a provider → *Pin to this workspace* (or
  `Claude Provider: Pin provider to this workspace`) to bind it to the current folder. When that
  workspace is reopened the extension auto-switches to the pinned provider. The pinned row is marked
  with 📌. The binding is stored per-workspace (never in `settings.json` or the repo). Auto-applying on
  open can be turned off with the `claudeProviderSwitcher.applyPinnedOnOpen` setting.
- **Pick models from a list** — when you edit a profile's Opus/Sonnet/Haiku model, the editor now
  queries the provider's endpoint (`GET /v1/models`) and offers the returned model ids in a dropdown,
  so you no longer have to know and type the exact id. *Enter manually…* and *Clear* remain available,
  and the native-subscription / unreachable-endpoint cases fall back to a plain input box.

## 0.3.0

- **API keys now live in VS Code SecretStorage**, not in `settings.json`. On first run any existing
  `ANTHROPIC_AUTH_TOKEN` is migrated out of `claudeProviderSwitcher.profiles` automatically — so the
  profiles list is safe to sync or share. The active provider's key is still written to
  `claudeCode.environmentVariables` when applied (Claude Code reads it there), but only that one key.
  In the editor the token field is masked and entered through a password box.
- **Test connection** — a new ⚡ action on each profile (and `Claude Provider: Test connection`) fires
  a small request at the endpoint and tells you whether it's reachable and the API key is accepted.
- **Cycle providers** — `Ctrl+Alt+]` / `Ctrl+Alt+[` (`Cmd+Alt+…` on macOS) switch to the next /
  previous provider, wrapping around.
- **Import / Export** — `Export providers…` / `Import providers…` (sidebar title bar and command
  palette) round-trip profiles as JSON. Export excludes API keys by default (opt in to include them);
  import assigns fresh badges/hotkeys and avoids name clashes.
- **Fix:** editing the active provider now re-applies its env, so the active marker and status bar
  stay in sync (previously they reverted to the bare old URL until you re-selected the profile).

## 0.2.0

- **Add provider** now opens a template menu (with provider logos) instead of only asking for a
  name. Pick **Custom** (blank, manual), **Claude Subscription**, **Claude API**, or one of 14
  built-in **Anthropic-compatible providers**: DeepInfra, DeepSeek, Fireworks AI, Kimi (Moonshot),
  MiniMax, MiniMax (China), ModelScope, Novita, OpenRouter, Poe, Qwen (Alibaba), SiliconFlow, Vercel AI Gateway,
  Z.ai (GLM), Zhipu GLM (China). The Base URL — and, where the provider uses fixed model names, the
  model mapping — are pre-filled. You still add your own API key, and every field stays editable
  afterwards.
- Also lists **local servers** with a native Anthropic-compatible endpoint and a known default
  port: llama.cpp, LM Studio, Ollama, vLLM (Base URL pre-filled; set your loaded model id after).
- Picking the same provider twice auto-numbers the name (`DeepSeek`, `DeepSeek2`, …).
- New profiles get the next free **badge** auto-assigned (a colored shape, like the hotkey); the
  palette is expanded with squares and diamonds (circles → squares → diamonds) for more distinct
  colors. Provider **logos** appear in the **Add provider** menu and in the **hover tooltip** of each
  profile (sidebar and status bar), matched by endpoint.
- Marketplace screenshots in `media/screenshots/` (re-render with `media/screenshots/render.ps1`).
- Bumps the minimum VS Code to 1.83 (needed for per-item icons in the picker).

## 0.1.1

- Added a Chinese (Simplified) README section alongside English and Russian.

## 0.1.0

- Initial release.
- **Sidebar UI** ("Claude Providers" in the Activity Bar): add / edit / delete / duplicate / reorder /
  switch providers — no manual `settings.json` editing.
- **Per-profile hotkeys** (`Ctrl+Alt+1`…`Ctrl+Alt+9`, `Ctrl+Alt+0`), auto-assigned on add and synced to
  your `keybindings.json`. No fixed limit on the number of profiles.
- **Color/badge** and **hotkey** chosen from dropdowns (no codes to remember).
- Provider menu (`Claude Provider: Select provider…`) and status bar indicator.
- Deleting the active provider switches to the first remaining one; deleting the last resets to the
  native subscription and hides the indicator.
- Applies a profile by writing `claudeCode.environmentVariables`.