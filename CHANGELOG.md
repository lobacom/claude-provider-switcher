# Changelog

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