const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseRollout, listRollouts, dayKey } = require('../src/agents/codexTokens');

const J = (o) => JSON.stringify(o);
const usage = (input, cached, output) => ({
  input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0,
  output_tokens: output, reasoning_output_tokens: 0, total_tokens: input + output,
});
const ts = '2026-09-29T13:48:33.470Z';

test('parseRollout: provider from session_meta, model from turn_context, usage per response', () => {
  const text = [
    J({ timestamp: ts, type: 'session_meta', payload: { id: 's1', model_provider: 'cps-deepseek' } }),
    J({ timestamp: ts, type: 'turn_context', payload: { model: 'ds-chat' } }),
    J({ timestamp: ts, type: 'token_usage_record', payload: { response_id: 'r1', usage: usage(1000, 400, 50) } }),
    J({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: usage(1000, 400, 50) } } }),
    J({ timestamp: ts, type: 'token_usage_record', payload: { response_id: 'r1', usage: usage(1000, 400, 50) } }), // duplicate
    J({ timestamp: ts, type: 'turn_context', payload: { model: 'ds-reasoner' } }),
    J({ timestamp: ts, type: 'token_usage_record', payload: { response_id: 'r2', usage: usage(10, 0, 5) } }),
    'not json',
  ].join('\n');
  const r = parseRollout(text);
  assert.equal(r.provider, 'cps-deepseek');
  const day = r.days[dayKey(Date.parse(ts))];
  assert.deepEqual(day['ds-chat'], { input: 600, output: 50, cacheCreate: 0, cacheRead: 400 }, 'cached split out of input, deduped');
  assert.deepEqual(day['ds-reasoner'], { input: 10, output: 5, cacheCreate: 0, cacheRead: 0 });
});

test('parseRollout: older logs without token_usage_record use token_count', () => {
  const text = [
    J({ timestamp: ts, type: 'session_meta', payload: { id: 's2' } }),
    J({ timestamp: ts, type: 'turn_context', payload: { model: 'gpt-5' } }),
    J({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: usage(100, 0, 10) } } }),
    J({ timestamp: ts, type: 'event_msg', payload: { type: 'token_count', info: { last_token_usage: usage(200, 50, 20) } } }),
  ].join('\n');
  const r = parseRollout(text);
  assert.equal(r.provider, 'openai', 'no model_provider → the built-in provider');
  assert.deepEqual(r.days[dayKey(Date.parse(ts))]['gpt-5'], { input: 250, output: 30, cacheCreate: 0, cacheRead: 50 });
});

test('listRollouts: only recent dated folders and recently touched archived logs', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-rollouts-'));
  const now = Date.parse('2026-09-29T12:00:00Z');
  const put = (rel, mtime) => {
    const f = path.join(home, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '');
    if (mtime) fs.utimesSync(f, mtime / 1000, mtime / 1000);
    return f;
  };
  const recent = put('sessions/2026/09/20/rollout-a.jsonl');
  put('sessions/2026/07/01/rollout-old.jsonl');
  put('sessions/2026/09/20/notes.txt');
  const arch = put('archived_sessions/rollout-b.jsonl', now - 2 * 864e5);
  put('archived_sessions/rollout-c.jsonl', now - 90 * 864e5);
  assert.deepEqual(listRollouts(home, 31, now).sort(), [arch, recent].sort());
});
