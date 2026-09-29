// Codex token statistics, kept in globalState next to the Claude ones
// (src/tokens.js). Codex's session logs name the provider each session ran on,
// so usage is bucketed by that provider (`cps-…` key or `openai`), then by day
// and model; a profile reads its provider's buckets. Scanning is incremental
// (a log is re-parsed only when its size / mtime change) and keyed by file name,
// so a log Codex moves into archived_sessions/ isn't counted twice.

const path = require('path');
const fs = require('fs');
const cx = require('./agents/codex');
const { parseRollout, listRollouts, dayKey } = require('./agents/codexTokens');
const { windowTotals, modelsIn, mergeDays } = require('./tokens');

const KEY = 'usageTokensCodex';
const STORE_VERSION = 1;
const KEEP_DAYS = 40; // buckets older than this are dropped (the UI shows ≤ 30 days)

let store; // context.globalState

function initCodexTokens(globalState) {
  store = globalState;
}

// Shape: { version, byProvider: { [provider]: { [day]: { [model]: totals } } },
//          files: { [basename]: { mtimeMs, size, provider, days } } }
function read() {
  const s = store && store.get(KEY);
  if (!s || typeof s !== 'object' || s.version !== STORE_VERSION) {
    return { version: STORE_VERSION, byProvider: {}, files: {} };
  }
  return { version: STORE_VERSION, byProvider: s.byProvider || {}, files: s.files || {} };
}

function scanInto(s, countNew) {
  const seen = new Set();
  for (const file of listRollouts(cx.codexHome(), 31)) {
    const name = path.basename(file);
    if (seen.has(name)) continue; // same session in sessions/ and archived_sessions/
    seen.add(name);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    const rec = s.files[name];
    if (rec && rec.mtimeMs === st.mtimeMs && rec.size === st.size) continue;
    let parsed;
    try { parsed = parseRollout(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (countNew) {
      if (rec && rec.days && s.byProvider[rec.provider]) mergeDays(s.byProvider[rec.provider], rec.days, -1);
      if (!s.byProvider[parsed.provider]) s.byProvider[parsed.provider] = {};
      mergeDays(s.byProvider[parsed.provider], parsed.days, +1);
    }
    s.files[name] = { mtimeMs: st.mtimeMs, size: st.size, provider: parsed.provider, days: parsed.days };
  }
  // Keep the store small: forget old days and logs that fell out of the window.
  const cutoff = dayKey(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
  for (const days of Object.values(s.byProvider)) {
    for (const d of Object.keys(days)) if (d < cutoff) delete days[d];
  }
  for (const [name, rec] of Object.entries(s.files)) {
    if (!seen.has(name) && Object.keys(rec.days || {}).every((d) => d < cutoff)) delete s.files[name];
  }
}

async function scanCodexTokens() {
  const s = read();
  scanInto(s, true);
  if (store) await store.update(KEY, s);
}

// "Reset to zero, count forward": baseline every current log without credit.
async function resetCodexTokens() {
  const s = { version: STORE_VERSION, byProvider: {}, files: {} };
  scanInto(s, false);
  if (store) await store.update(KEY, s);
}

// The buckets that belong to profile `p`: its provider's. Several profiles on
// Codex's built-in `openai` provider share one bucket, so each of those that
// names a model only counts that model.
function daysFor(p, profiles) {
  const days = read().byProvider[cx.providerOf(p)] || {};
  const model = p.codex && p.codex.model;
  const shared = !cx.baseUrl(p) && profiles.filter((x) => !cx.baseUrl(x)).length > 1;
  return { days, model: shared && model ? model : undefined };
}

// today / 7-day / 30-day totals for a profile (optionally one model).
function codexTokenWindows(p, profiles) {
  const { days, model } = daysFor(p, profiles);
  return windowTotals(days, model);
}

// The models a profile actually used in the last 30 days, busiest first.
function codexModelsUsed(p, profiles) {
  const { days, model } = daysFor(p, profiles);
  const all = modelsIn(days);
  return model ? all.filter((m) => m.model.toLowerCase() === model.toLowerCase()) : all;
}

module.exports = { initCodexTokens, scanCodexTokens, resetCodexTokens, codexTokenWindows, codexModelsUsed };
