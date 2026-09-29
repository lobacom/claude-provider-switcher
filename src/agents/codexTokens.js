// Token statistics for Codex, read from its session logs. Pure Node (no
// `vscode`); the extension keeps the results in globalState (src/codexTokens.js).
//
// Codex writes one JSONL "rollout" per session under
// $CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl (and archived_sessions/).
// The records we use:
//   session_meta        payload.model_provider — the provider the session ran on
//                       (our `cps-…` key, or `openai`), so attribution is exact:
//                       no switch timeline needed;
//   turn_context        payload.model — the model of the turns that follow;
//   token_usage_record  payload.usage per model response (deduped by
//                       response_id) — the numbers Codex itself reports;
//   event_msg/token_count  payload.info.last_token_usage — the same per-response
//                       usage in older Codex versions without token_usage_record.
// Everything is best effort: an unknown shape yields no stats, never an error.

const fs = require('fs');
const path = require('path');

// Local YYYY-MM-DD (the same keys src/tokens.js uses).
function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// OpenAI-style usage → the { input, output, cacheCreate, cacheRead } totals the
// Claude stats use. OpenAI counts cached tokens inside input_tokens, so the
// uncached part is input − cached.
function toTotals(u) {
  const cached = Number(u.cached_input_tokens) || 0;
  return {
    input: Math.max(0, (Number(u.input_tokens) || 0) - cached),
    output: Number(u.output_tokens) || 0,
    cacheCreate: Number(u.cache_write_input_tokens) || 0,
    cacheRead: cached,
  };
}

// Parse one rollout's text into { provider, days: { day: { model: totals } } }.
function parseRollout(text) {
  let provider;
  let model = '?';
  const records = new Map(); // response_id → { usage, ts, model }
  const fallback = []; // token_count usages, used only when no records exist
  for (const line of text.split('\n')) {
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload || {};
    const ts = Date.parse(o.timestamp);
    if (o.type === 'session_meta') {
      if (provider === undefined && typeof p.model_provider === 'string') provider = p.model_provider;
    } else if (o.type === 'turn_context') {
      if (typeof p.model === 'string' && p.model) model = p.model;
    } else if (o.type === 'token_usage_record' && p.usage) {
      const key = p.response_id || `${p.turn_id || ''}#${records.size}`;
      records.set(key, { usage: p.usage, ts, model });
    } else if (o.type === 'event_msg' && p.type === 'token_count' && p.info && p.info.last_token_usage) {
      fallback.push({ usage: p.info.last_token_usage, ts, model });
    }
  }
  const days = {};
  for (const { usage, ts, model: m } of records.size ? records.values() : fallback) {
    const k = dayKey(Number.isNaN(ts) ? Date.now() : ts);
    if (!days[k]) days[k] = {};
    if (!days[k][m]) days[k][m] = { input: 0, output: 0, cacheCreate: 0, cacheRead: 0 };
    const acc = days[k][m];
    const t = toTotals(usage);
    acc.input += t.input;
    acc.output += t.output;
    acc.cacheCreate += t.cacheCreate;
    acc.cacheRead += t.cacheRead;
  }
  return { provider: provider || 'openai', days };
}

// Rollout files that may hold usage from the last `maxDays` days: the dated
// session folders in range (older ones can't matter for the 30-day window) and
// recently modified archived sessions.
function listRollouts(codexHome, maxDays = 31, now = Date.now()) {
  const out = [];
  const oldest = dayKey(now - maxDays * 24 * 60 * 60 * 1000);
  const ls = (dir) => {
    try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
  };
  const sessions = path.join(codexHome, 'sessions');
  for (const y of ls(sessions)) {
    if (!y.isDirectory() || !/^\d{4}$/.test(y.name)) continue;
    for (const m of ls(path.join(sessions, y.name))) {
      if (!m.isDirectory() || !/^\d{2}$/.test(m.name)) continue;
      if (`${y.name}-${m.name}-31` < oldest) continue;
      for (const d of ls(path.join(sessions, y.name, m.name))) {
        if (!d.isDirectory() || !/^\d{2}$/.test(d.name)) continue;
        if (`${y.name}-${m.name}-${d.name}` < oldest) continue;
        const dir = path.join(sessions, y.name, m.name, d.name);
        for (const f of ls(dir)) if (f.isFile() && f.name.endsWith('.jsonl')) out.push(path.join(dir, f.name));
      }
    }
  }
  const archived = path.join(codexHome, 'archived_sessions');
  for (const f of ls(archived)) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
    const file = path.join(archived, f.name);
    try {
      if (dayKey(fs.statSync(file).mtimeMs) >= oldest) out.push(file);
    } catch { /* gone */ }
  }
  return out;
}

module.exports = { dayKey, toTotals, parseRollout, listRollouts };
