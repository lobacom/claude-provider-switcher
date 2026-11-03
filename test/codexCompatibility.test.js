const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const net = require('net');
const { execFileSync } = require('child_process');
const cx = require('../src/agents/codex');
const compatibility = require('../src/codexCompatibility');
const toml = require('../src/toml');

cx.setCodexRunner(() => { throw new Error('no codex CLI in tests'); });
function home(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-compat-'));
  const previous = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, CODEX_HOME: process.env.CODEX_HOME };
  process.env.HOME = process.env.USERPROFILE = dir;
  process.env.CODEX_HOME = path.join(dir, '.codex');
  t.after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  return dir;
}
async function upstream(t) {
  const seen = [];
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : null;
    seen.push({ url: req.url, headers: req.headers, body });
    if (req.url.startsWith('/v1/models')) { res.end('{"data":[{"id":"auto"}]}'); return; }
    if (body.model === 'auto' && ('tool_choice' in body || 'parallel_tool_calls' in body)) { res.writeHead(400); res.end('Unsupported fields'); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream', 'x-upstream': 'yes' });
    res.write('event: response.created\ndata: {"type":"response.created"}\n\n');
    // Wait for another request before ending the first stream. A buffering
    // adapter would prevent the client from getting here and time out.
    if (body.wait_for_release) { release = () => finish(); return; }
    finish();
    function finish() {
      const output = body.input.some((item) => item.type === 'function_call_output')
        ? [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'OK' }] }]
        : [{ type: 'function_call', name: 'probe', arguments: '{"value":"OK"}', call_id: 'call-1' }];
      res.end(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response: { status: 'completed', output } })}\n\n`);
    }
  });
  let release;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { seen, base: `http://127.0.0.1:${server.address().port}/v1`, release: () => release() };
}
const tools = [{ type: 'function', name: 'probe', parameters: { type: 'object', properties: {
  tool_choice: { type: 'string' }, parallel_tool_calls: { type: 'boolean' },
} } }];
function request(model, extra = {}) {
  return { model, input: [{ role: 'user', content: 'Call probe.' }], tools, tool_choice: 'auto', parallel_tool_calls: false, stream: true, ...extra };
}
function adapter(p) {
  const config = JSON.parse(fs.readFileSync(compatibility.configPath(p), 'utf8'));
  return { config, url: `http://127.0.0.1:${config.port}/${config.route}/v1` };
}
async function send(p, body, suffix = '/responses?region=eu') {
  const { config, url } = adapter(p);
  return fetch(url + suffix, { method: 'POST', headers: {
    authorization: 'Bearer ' + config.route, 'content-type': 'application/json', 'x-profile': 'header',
  }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
}
function listening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false));
  });
}

test('per-model omissions preserve streaming, credentials, schemas and the complete tool round trip', async (t) => {
  home(t);
  const remote = await upstream(t);
  const p = { id: 'compat-roundtrip', key: 'cps-compat', name: 'Gateway', codex: {
    base_url: remote.base, model: 'auto', models: ['auto', 'other'],
    request_compatibility: { models: { auto: { tool_choice: 'omit', parallel_tool_calls: 'omit' } } },
  } };
  cx.syncConfig({ profiles: [p], activate: p.id, tokenFor: () => 'upstream-secret' });
  const { config, url } = adapter(p);
  const text = cx.readConfig().text;
  assert.ok(text.includes(url));
  assert.ok(!text.includes('upstream-secret'));
  assert.ok(!fs.readFileSync(compatibility.configPath(p), 'utf8').includes('upstream-secret'));
  const result = await send(p, request('auto', { wait_for_release: true }));
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('x-upstream'), 'yes');
  const reader = result.body.getReader();
  const first = await reader.read();
  assert.match(Buffer.from(first.value).toString(), /response.created/);
  assert.equal(first.done, false, 'SSE arrives before upstream completion');
  remote.release();
  let response = '';
  for (;;) { const chunk = await reader.read(); if (chunk.done) break; response += Buffer.from(chunk.value); }
  assert.match(response, /function_call/);
  const original = remote.seen[0];
  assert.equal(original.headers.authorization, 'Bearer upstream-secret');
  assert.equal(original.headers['x-profile'], 'header');
  assert.equal(original.url, '/v1/responses?region=eu');
  assert.equal('tool_choice' in original.body, false);
  assert.equal('parallel_tool_calls' in original.body, false);
  assert.deepEqual(original.body.tools, tools, 'nested schema properties survive');
  const call = { type: 'function_call', name: 'probe', arguments: '{"value":"OK"}', call_id: 'call-1' };
  const continuation = [{ role: 'user', content: 'Call probe.' }, call, { type: 'function_call_output', call_id: 'call-1', output: 'OK' }];
  const second = await send(p, request('auto', { input: continuation }));
  assert.match(await second.text(), /output_text/);
  assert.deepEqual(remote.seen[1].body.input, continuation);
  const unchanged = await send(p, request('other'));
  assert.equal(unchanged.status, 200);
  await unchanged.text();
  assert.equal(remote.seen[2].body.tool_choice, 'auto');
  assert.equal(remote.seen[2].body.parallel_tool_calls, false);
  const blocked = await fetch(url + '/responses', { method: 'POST', body: '{}' });
  assert.equal(blocked.status, 403);
  assert.equal(remote.seen.length, 3);
  const forbidden = await fetch(url + '/unexpected', { headers: { authorization: 'Bearer ' + config.route } });
  assert.equal(forbidden.status, 404);
  const listed = await fetch(url + '/models', { headers: { authorization: 'Bearer ' + config.route } });
  assert.deepEqual(await listed.json(), { data: [{ id: 'auto' }] });
  assert.equal(remote.seen[3].headers.authorization, 'Bearer upstream-secret');
});

test('provider defaults, model keep/inherit, live edits, config key mode and disabling rules', async (t) => {
  home(t);
  const remote = await upstream(t);
  const p = { id: 'compat-provider', key: 'cps-provider', name: 'Gateway', codex: { base_url: remote.base, model: 'other' } };
  compatibility.setRule(p, null, 'tool_choice', 'omit');
  compatibility.setRule(p, null, 'parallel_tool_calls', 'omit');
  compatibility.setRule(p, 'exception', 'tool_choice', 'keep');
  compatibility.setRule(p, 'exception', 'parallel_tool_calls', 'keep');
  const sync = () => cx.syncConfig({ profiles: [p], activate: p.id, tokenFor: () => 'private-key', keyStorage: 'config' });
  sync();
  const initial = adapter(p).url;
  assert.ok(!cx.readConfig().text.includes('experimental_bearer_token'), 'adapter uses its startup auth helper even in config mode');
  assert.equal(fs.readFileSync(cx.keyFilePathFor(p), 'utf8'), 'private-key');
  await (await send(p, request('other'))).text();
  await (await send(p, request('exception'))).text();
  assert.equal('tool_choice' in remote.seen[0].body, false);
  assert.equal(remote.seen[1].body.tool_choice, 'auto');
  compatibility.setRule(p, 'exception', 'tool_choice', 'inherit');
  sync();
  assert.equal(adapter(p).url, initial, 'policy edits retain the port and auth route');
  await (await send(p, request('exception'))).text();
  assert.equal('tool_choice' in remote.seen[2].body, false);
  assert.equal(remote.seen[2].body.parallel_tool_calls, false);
  const saved = adapter(p).config;
  const file = compatibility.configPath(p);
  delete p.codex.request_compatibility;
  sync();
  assert.equal(fs.existsSync(file), false);
  assert.ok(cx.readConfig().text.includes(`base_url = "${remote.base}"`));
  assert.ok(cx.readConfig().text.includes('experimental_bearer_token = "private-key"'));
  assert.equal(fs.existsSync(cx.keyFilePathFor(p)), false);
  // The detached service observes revocation and releases the saved port.
  const deadline = Date.now() + 5000;
  while (await listening(saved.port)) {
    assert.ok(Date.now() < deadline, 'disabled adapter must stop');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  p.codex.request_compatibility = { models: { auto: { tool_choice: 'omit', parallel_tool_calls: 'omit' } } };
  // Simulate reboot recovery: retain the saved config/port but no running daemon.
  fs.writeFileSync(file, JSON.stringify(saved));
  const runtime = path.join(path.dirname(file), 'adapter-v1.js');
  const localKey = execFileSync(process.execPath, [runtime, 'auth', file], { encoding: 'utf8', windowsHide: true }).trim();
  assert.equal(localKey, saved.route);
  assert.equal(await compatibility.ping(saved), true, 'auth.command restarts a stopped adapter on the saved port');
  sync();
  assert.equal(adapter(p).url, initial);
  assert.equal(toml.getTopLevelString(cx.readConfig().text, 'model_provider'), p.key);
});

test('invalid modes fail before changing Codex configuration or keys', (t) => {
  home(t);
  const p = { id: 'invalid', codex: { base_url: 'https://example.invalid/v1', request_compatibility: { parameters: { tool_choice: false } } } };
  assert.throws(() => cx.syncConfig({ profiles: [p], activate: p.id, tokenFor: () => 'secret' }), /Invalid request compatibility mode/);
  assert.equal(fs.existsSync(cx.configPath()), false);
  assert.equal(fs.existsSync(cx.keyFilePathFor(p)), false);
});
