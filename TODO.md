# TODO / Backlog

- Usage statistics — count switches / time spent per provider, surface in the
  status-bar tooltip (and maybe a tree badge).

---

## Done
- Mirror the active provider into `~/.claude/settings.json` (CLI config) — opt-in
  `writeClaudeSettings`; merges only the managed env keys, preserves the rest.
- Switch & reload window — one command switches and reloads so a new Claude Code
  session picks up the provider (`switchAndReload`).
- Switch action setting (`switchAction`: switch ↔ switchAndReload) — controls what
  happens on every switch (sidebar click, hotkey, cycle, menu).
- Clickable Reload Window button in the status bar restart-hint tooltip.
- Gateway tip — profiles whose Base URL looks like an LLM gateway (not Anthropic,
  not localhost) show a short note in the tooltip about `/model` /
  `ANTHROPIC_DEFAULT_*_MODEL` behaviour. Other profiles are unchanged.
- Extra env vars per profile — an "Extra environment variables" editor field for
  any other CLAUDE_CODE_*/ANTHROPIC_* var; CLI mirror clears the union of managed
  + per-profile keys so switching away removes them.
- Model selection from a fetched list (`GET /v1/models`) — pick Opus/Sonnet/Haiku
  from a dropdown instead of typing the id.
- Profile per workspace — pin a provider to a folder (workspaceState), auto-applied
  on open; `claudeProviderSwitcher.applyPinnedOnOpen` toggle, 📌 marker in the tree.
- Auto-fallback — per-profile `fallbackId`; *Switch with fallback* command probes the
  chain and applies the first healthy provider; `autoFallbackOnApply` setting routes
  every switch through it. Healthy = HTTP 200/400; native subscription = always up.
- Health indicator — 🟢/🔴 reachability tint in the tree/status bar; *Check provider
  health* button (token-free `GET /v1/models`); `healthCheck` = `manual` (default) /
  `periodic` with `healthCheckIntervalMinutes`. Periodic costs no tokens by design.
