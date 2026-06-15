// Token statistics, attributed per provider, per model and bucketed by day.
// Claude Code writes a transcript per session at
// ~/.claude/projects/<project>/<sessionId>.jsonl; every assistant record carries
// a `message.usage` block (input/output/cache tokens), a `message.model` and a
// `timestamp`. We read those — the same numbers Claude Code itself reports —
// bucket them by local day and model, and attribute each session to a provider
// via the switch timeline in usage.js (env is frozen when a session starts, so
// one session = one provider).
//
// We keep per-day buckets (not a lifetime total) so the UI can show an actionable
// window — "today", "last 7 days" and "last 30 days" — rather than an ever-growing odometer, and
// a per-model split so each mapped tier (Opus/Sonnet/Haiku) can show its own
// usage.
//
// Two subtleties drive the design:
//  - A single API request emits several assistant records as it streams, each
//    repeating `usage`. Summing them all double-counts, so we dedupe by
//    `requestId`, keeping the record with the largest output (the final one).
//  - The transcript format is Claude Code's own, undocumented and version-bound.
//    Everything here is wrapped in try/catch and degrades to "no stats" rather
//    than throwing into the extension host.
//
// Scanning is incremental: a file is re-parsed only when its size/mtime change,
// and its per-day contribution is replaced wholesale, so token runs that straddle
// a scan boundary in the live session file can't double-count.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { providerAt } = require('./usage');

const KEY = 'usageTokens';
const STORE_VERSION = 2; // bump when the persisted shape changes (forces a rebuild)
const UNKNOWN = '__unknown__';
const SYNTHETIC = '<synthetic>'; // Claude Code's internal non-API messages — skip

let store; // context.globalState

function initTokens(globalState) {
  store = globalState;
}

function projectsDir() {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Local YYYY-MM-DD key (lexicographic order == chronological, so window math is a
// plain string comparison).
function dayKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Shape (version 2):
//   { version, byProvider: { [id|UNKNOWN]: { [day]: { [model]: totals } } },
//     files: { [path]: { mtimeMs, size, providerId, days } } }
// totals = {input,output,cacheCreate,cacheRead}. An older/mismatched shape is
// discarded so the next scan rebuilds it from the transcripts.
function read() {
  const s = store && store.get(KEY);
  if (!s || typeof s !== 'object' || s.version !== STORE_VERSION) {
    return { version: STORE_VERSION, byProvider: {}, files: {} };
  }
  return { version: STORE_VERSION, byProvider: s.byProvider || {}, files: s.files || {} };
}
async function write(s) {
  if (store) await store.update(KEY, s);
}

const ZERO = () => ({ input: 0, output: 0, cacheCreate: 0, cacheRead: 0 });
function addTotals(acc, t, sign = 1) {
  acc.input += sign * (t.input || 0);
  acc.output += sign * (t.output || 0);
  acc.cacheCreate += sign * (t.cacheCreate || 0);
  acc.cacheRead += sign * (t.cacheRead || 0);
}

// Merge a per-day, per-model map into a provider's map (sign -1 removes a file's
// stale contribution).
function mergeDays(target, days, sign) {
  for (const [day, models] of Object.entries(days)) {
    if (!target[day]) target[day] = {};
    for (const [model, t] of Object.entries(models)) {
      if (!target[day][model]) target[day][model] = ZERO();
      addTotals(target[day][model], t, sign);
    }
  }
}

// Parse one transcript into { days, firstTs }. Dedupes assistant usage by
// requestId (keeping the largest-output record) and buckets each request by its
// own day and model. `firstTs` (earliest record) is the session start, used to
// attribute the whole session to a provider.
function parseFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const byReq = new Map(); // requestId|uuid → { usage, ts, model }
  let firstTs;
  for (const line of text.split('\n')) {
    if (!line) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    let ts;
    if (o.timestamp) {
      ts = Date.parse(o.timestamp);
      if (Number.isNaN(ts)) ts = undefined;
      else if (firstTs === undefined || ts < firstTs) firstTs = ts;
    }
    if (o.type !== 'assistant' || !o.message || !o.message.usage) continue;
    const model = o.message.model || '?';
    if (model === SYNTHETIC) continue; // not a real API call
    const u = o.message.usage;
    const key = o.requestId || o.uuid;
    if (!key) continue;
    const prev = byReq.get(key);
    if (!prev || (u.output_tokens || 0) > (prev.usage.output_tokens || 0)) byReq.set(key, { usage: u, ts, model });
  }
  const days = {};
  for (const { usage, ts, model } of byReq.values()) {
    const k = dayKey(ts != null ? ts : firstTs != null ? firstTs : Date.now());
    if (!days[k]) days[k] = {};
    if (!days[k][model]) days[k][model] = ZERO();
    const acc = days[k][model];
    acc.input += usage.input_tokens || 0;
    acc.output += usage.output_tokens || 0;
    acc.cacheCreate += usage.cache_creation_input_tokens || 0;
    acc.cacheRead += usage.cache_read_input_tokens || 0;
  }
  return { days, firstTs };
}

function listTranscripts() {
  const out = [];
  let dirs;
  try { dirs = fs.readdirSync(projectsDir(), { withFileTypes: true }); } catch { return out; }
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const sub = path.join(projectsDir(), d.name);
    let files;
    try { files = fs.readdirSync(sub); } catch { continue; }
    for (const f of files) if (f.endsWith('.jsonl')) out.push(path.join(sub, f));
  }
  return out;
}

// Incremental scan: re-parse only changed files and replace their per-day
// contribution. `countNew` false means "establish a baseline without crediting
// existing tokens" (used by the reset, to count only forward from now).
function scanInto(s, countNew = true) {
  for (const file of listTranscripts()) {
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    const rec = s.files[file];
    if (rec && rec.mtimeMs === st.mtimeMs && rec.size === st.size) continue; // unchanged
    let parsed;
    try { parsed = parseFile(file); } catch { continue; }
    // Provider is fixed for a session — resolve once, then keep it stable.
    const providerId = (rec && rec.providerId) || (parsed.firstTs != null ? providerAt(parsed.firstTs) : undefined) || UNKNOWN;
    if (countNew) {
      if (!s.byProvider[providerId]) s.byProvider[providerId] = {};
      if (rec && rec.days) mergeDays(s.byProvider[providerId], rec.days, -1); // remove stale
      mergeDays(s.byProvider[providerId], parsed.days, +1);
    }
    s.files[file] = { mtimeMs: st.mtimeMs, size: st.size, providerId, days: parsed.days };
  }
}

async function scanTokens() {
  const s = read();
  scanInto(s, true);
  await write(s);
}

// Establish baselines for all current transcripts without crediting their
// existing tokens — "reset to zero, count forward".
async function resetTokens() {
  const s = { version: STORE_VERSION, byProvider: {}, files: {} };
  scanInto(s, false);
  await write(s);
}

// A profile's mapped model id and the transcript's `message.model` often differ:
// gateways accept an alias ("minimax-m3", "pro", "flash") but echo back the real
// id ("MiniMax-M3", "deepseek-v4-pro"). Resolve the mapped id against the model
// names actually recorded in this provider's bucket: case-insensitive exact match
// first, then a containment match — but only when it's unambiguous (exactly one
// candidate), so a short alias can't silently sum two different models.
function modelMatcher(days, model) {
  const want = String(model).toLowerCase();
  const seen = new Set();
  for (const models of Object.values(days)) for (const m of Object.keys(models)) seen.add(m.toLowerCase());
  if (seen.has(want)) return (m) => m.toLowerCase() === want;
  const cands = [...seen].filter((m) => m.includes(want) || want.includes(m));
  if (cands.length === 1) {
    const hit = cands[0];
    return (m) => m.toLowerCase() === hit;
  }
  return () => false; // none or ambiguous — show nothing rather than a wrong sum
}

// Token totals for a provider over the windows we surface: today, the last 7 and
// the last 30 calendar days (today inclusive). When `model` is given, only that
// model is summed (used for the per-tier breakdown, matched per modelMatcher);
// otherwise all models are combined.
function tokenWindows(id, model) {
  const days = read().byProvider[id] || {};
  const matches = model ? modelMatcher(days, model) : null;
  const today = dayKey(Date.now());
  const weekStart = dayKey(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const monthStart = dayKey(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const tWin = ZERO();
  const wWin = ZERO();
  const mWin = ZERO();
  for (const [k, models] of Object.entries(days)) {
    if (k < monthStart) continue;
    const inWeek = k >= weekStart;
    const inToday = k === today;
    for (const [m, t] of Object.entries(models)) {
      if (matches && !matches(m)) continue;
      addTotals(mWin, t, 1);
      if (inWeek) addTotals(wWin, t, 1);
      if (inToday) addTotals(tWin, t, 1);
    }
  }
  return { today: tWin, week: wWin, month: mWin };
}

// Models actually recorded for a provider within the 30-day window, with their
// today/week/month totals, busiest first. Used for profiles that map no models
// (native subscription) — there are no opus/sonnet/haiku lines to annotate, so the
// tooltip lists what was really used instead.
function modelsUsed(id) {
  const days = read().byProvider[id] || {};
  const today = dayKey(Date.now());
  const weekStart = dayKey(Date.now() - 6 * 24 * 60 * 60 * 1000);
  const monthStart = dayKey(Date.now() - 29 * 24 * 60 * 60 * 1000);
  const map = new Map(); // model → { model, today, week, month }
  for (const [k, models] of Object.entries(days)) {
    if (k < monthStart) continue;
    const inWeek = k >= weekStart;
    for (const [m, t] of Object.entries(models)) {
      let e = map.get(m);
      if (!e) map.set(m, (e = { model: m, today: ZERO(), week: ZERO(), month: ZERO() }));
      addTotals(e.month, t, 1);
      if (inWeek) addTotals(e.week, t, 1);
      if (k === today) addTotals(e.today, t, 1);
    }
  }
  return [...map.values()].sort(
    (a, b) => b.month.input + b.month.output - (a.month.input + a.month.output)
  );
}

// Compact token count: 950, 2.2k, 1.2M.
function formatTokens(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return String(n);
}

module.exports = {
  initTokens,
  scanTokens,
  resetTokens,
  tokenWindows,
  modelsUsed,
  formatTokens,
};
