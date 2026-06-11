// Per-provider usage statistics: how many times each provider was switched to,
// and how long it has been the active one. Persisted in globalState (keyed by
// profile id) — deliberately not in the `profiles` setting, so it never lands in
// settings.json (which is often synced or committed) and survives profile edits.
//
// Active time only accrues while VS Code is running with the provider selected:
// the running segment is banked on every switch and by a periodic heartbeat, and
// the stretch while VS Code was closed is discarded on the next activation (we
// don't credit a provider for the hours the editor sat shut).

const { t } = require('./i18n');

const KEY = 'usageStats';

let store; // context.globalState

function initUsage(globalState) {
  store = globalState;
}

// Shape: { byId: { [id]: { switches, activeMs } }, current: { id, since } | null,
//          timeline: [{ ts, id }] }  — timeline records every switch so token
//          stats can attribute a Claude Code session (env is frozen at session
//          start) to whichever provider was active when it began.
const TIMELINE_CAP = 2000;
function read() {
  const s = store && store.get(KEY);
  if (!s || typeof s !== 'object') return { byId: {}, current: null, timeline: [] };
  return { byId: s.byId || {}, current: s.current || null, timeline: s.timeline || [] };
}
async function write(s) {
  if (store) await store.update(KEY, s);
}

function entry(s, id) {
  if (!s.byId[id]) s.byId[id] = { switches: 0, activeMs: 0 };
  return s.byId[id];
}

// Bank the running segment into its provider's total and restart the clock at
// `now`. No-op when nothing is active. Returns true if it changed anything.
function bank(s, now) {
  if (!s.current || !s.current.id) return false;
  entry(s, s.current.id).activeMs += Math.max(0, now - s.current.since);
  s.current.since = now;
  return true;
}

// Record a switch to profile `id`: close the previous segment, bump the switch
// count, open a fresh segment.
async function recordUsageSwitch(id) {
  if (!id) return;
  const now = Date.now();
  const s = read();
  bank(s, now);
  entry(s, id).switches += 1;
  s.current = { id, since: now };
  pushTimeline(s, now, id);
  await write(s);
}

// Append a switch to the attribution timeline (skips no-op repeats), capped.
function pushTimeline(s, ts, id) {
  const last = s.timeline[s.timeline.length - 1];
  if (last && last.id === id) return;
  s.timeline.push({ ts, id });
  if (s.timeline.length > TIMELINE_CAP) s.timeline = s.timeline.slice(-TIMELINE_CAP);
}

// Which provider id was active at time `ts` (ms epoch): the last switch at or
// before it. Returns undefined when `ts` predates anything we recorded (the
// session started before the extension was tracking — caller buckets it as
// "unknown").
function providerAt(ts) {
  const s = read();
  let found;
  for (const e of s.timeline) {
    if (e.ts <= ts) found = e.id;
    else break;
  }
  return found;
}

// On activation: resume timing for whatever provider is active now, without
// counting a switch. Any segment left over from a previous (closed) session is
// dropped rather than credited — `since` is reset to now.
async function resumeUsage(activeId) {
  const now = Date.now();
  const s = read();
  s.current = activeId ? { id: activeId, since: now } : null;
  // Seed the attribution timeline with the provider active at startup, so
  // sessions started after install can be attributed even without a switch.
  if (activeId) pushTimeline(s, now, activeId);
  await write(s);
}

// Heartbeat + deactivation hook: bank the running segment so totals stay fresh
// even if the editor is closed/crashes between switches.
async function tickUsage() {
  const s = read();
  if (bank(s, Date.now())) await write(s);
}

// Read-only snapshot for a profile id, including the live running segment.
function usageOf(id) {
  const s = read();
  const e = s.byId[id] || { switches: 0, activeMs: 0 };
  let activeMs = e.activeMs;
  if (s.current && s.current.id === id) activeMs += Math.max(0, Date.now() - s.current.since);
  return { switches: e.switches, activeMs };
}

// Wipe all collected statistics (keeps the current segment running so the active
// provider starts counting again from zero).
async function resetUsage() {
  const now = Date.now();
  const cur = read().current;
  const current = cur ? { id: cur.id, since: now } : null;
  // Keep a single timeline seed for the active provider so token attribution
  // keeps working for sessions started after the reset.
  const timeline = current ? [{ ts: now, id: current.id }] : [];
  await write({ byId: {}, current, timeline });
}

// Compact, localized active-time label: "2h 13m", "5m", or "<1m".
function formatActive(ms) {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return t('usage_lessMin');
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}${t('usage_h')} ${m}${t('usage_m')}`;
  if (h) return `${h}${t('usage_h')}`;
  return `${m}${t('usage_m')}`;
}

module.exports = {
  initUsage,
  recordUsageSwitch,
  resumeUsage,
  tickUsage,
  usageOf,
  resetUsage,
  formatActive,
  providerAt,
};
