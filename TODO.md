# TODO / Backlog

No planned features outstanding. Add new ideas here.

---

## Done
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
