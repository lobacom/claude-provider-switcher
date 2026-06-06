# Changelog

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