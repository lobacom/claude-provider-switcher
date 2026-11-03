// Standalone loopback adapter. Copied to user-local storage so Codex can start
// it through auth.command even while VS Code and the terminal app are closed.
const fs = require('fs');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
const { pipeline } = require('stream');

const PARAMETERS = ['tool_choice', 'parallel_tool_calls'];
const VERSION = 1;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
function parameterRules(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid request compatibility rules');
  return Object.fromEntries(PARAMETERS.filter((key) => own(raw, key)).map((key) => {
    if (!['keep', 'omit'].includes(raw[key])) throw new Error(`Invalid request compatibility mode for ${key}`);
    return [key, raw[key]];
  }));
}
function normalize(raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid request compatibility settings');
  const parameters = parameterRules(raw.parameters);
  const models = raw.models || {};
  if (typeof models !== 'object' || Array.isArray(models)) throw new Error('Invalid request compatibility model rules');
  return { parameters, models: Object.fromEntries(Object.entries(models).map(([model, rules]) => [model, parameterRules(rules)])) };
}
function omitted(settings, model) {
  const rules = { ...settings.parameters, ...(own(settings.models, model) ? settings.models[model] : {}) };
  return PARAMETERS.filter((key) => rules[key] === 'omit');
}
function enabled(raw) {
  const settings = normalize(raw);
  return Object.values(settings.parameters).includes('omit') || Object.values(settings.models).some((rules) => Object.values(rules).includes('omit'));
}
function transform(body, settings) {
  // Only top-level request controls are changed. Tool definitions and their
  // schemas may contain properties with exactly the same names.
  const result = { ...body };
  for (const key of omitted(settings, body.model)) delete result[key];
  return result;
}
function read(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function write(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
function ping(config) {
  if (!config.port) return Promise.resolve(false);
  return new Promise((resolve) => {
    const req = http.get({ hostname: '127.0.0.1', port: config.port, path: `/${config.route}/health`,
      headers: { authorization: `Bearer ${config.route}` }, timeout: 500 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { try { resolve(res.statusCode === 200 && JSON.parse(body).version === VERSION); } catch { resolve(false); } });
      res.on('error', () => resolve(false));
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}
async function ensure(file) {
  const config = read(file);
  if (await ping(config)) return config.port;
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [__filename, 'serve', file], {
        detached: true, windowsHide: true, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Timed out starting the Codex request adapter')); }, 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Codex request adapter exited (${code})`)); });
      child.once('message', (message) => {
        clearTimeout(timer);
        child.disconnect();
        child.unref();
        if (message.error) reject(new Error(message.error));
        else resolve(message.port);
      });
    });
  } catch (error) {
    // Concurrent credential refreshes can race to bind the same saved port.
    if (await ping(read(file))) return read(file).port;
    throw error;
  }
}
function cleanHeaders(headers) {
  const result = { ...headers };
  const hop = ['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade', 'host'];
  hop.push(...String(headers.connection || '').split(',').map((key) => key.trim().toLowerCase()));
  for (const key of hop) delete result[key];
  return result;
}
function serve(file) {
  const initial = read(file);
  const sockets = new Set();
  const fail = (res, status, message) => {
    if (res.headersSent) { res.destroy(); return; }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message, type: 'codex_request_adapter_error' } }));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const config = read(file);
      if (config.route !== initial.route || req.headers.host !== `127.0.0.1:${server.address().port}` || req.headers.authorization !== `Bearer ${config.route}`) {
        fail(res, 403, 'Adapter authentication failed'); return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      const prefix = `/${config.route}`;
      if (url.pathname === `${prefix}/health` && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ version: VERSION })); return;
      }
      const suffix = url.pathname.slice((prefix + '/v1').length);
      if (!url.pathname.startsWith(prefix + '/v1/') || !/^\/(responses|models)(\/[A-Za-z0-9_-]+)?$/.test(suffix) || !['GET', 'POST', 'DELETE'].includes(req.method)) {
        fail(res, 404, 'Unsupported adapter endpoint'); return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 64 * 1024 * 1024) { fail(res, 413, 'Request exceeds the adapter limit of 64 MiB'); return; }
        chunks.push(chunk);
      }
      let body = Buffer.concat(chunks);
      if (req.method === 'POST' && suffix === '/responses') {
        if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') { fail(res, 415, 'Compressed request bodies are unsupported'); return; }
        let parsed;
        try { parsed = JSON.parse(body.toString('utf8')); } catch { fail(res, 400, 'Invalid JSON request'); return; }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { fail(res, 400, 'Expected a JSON request object'); return; }
        body = Buffer.from(JSON.stringify(transform(parsed, normalize(config.compatibility))));
      }
      const target = new URL(config.upstream);
      target.pathname = target.pathname.replace(/\/+$/, '') + suffix;
      for (const [key, value] of url.searchParams) target.searchParams.set(key, value);
      const headers = cleanHeaders(req.headers);
      delete headers.authorization;
      let token = '';
      try { token = fs.readFileSync(config.key_file, 'utf8').trim(); } catch { /* local endpoints need no key */ }
      if (config.requires_key && !token) { fail(res, 401, 'Provider API key is missing; reapply the provider profile'); return; }
      if (token) headers.authorization = `Bearer ${token}`;
      if (body.length || headers['content-length']) headers['content-length'] = String(body.length);
      const upstream = (target.protocol === 'https:' ? https : http).request(target, { method: req.method, headers }, (response) => {
        res.writeHead(response.statusCode, cleanHeaders(response.headers));
        // Preserve SSE frames and backpressure; never buffer the response.
        pipeline(response, res, () => {});
      });
      upstream.setTimeout(300000, () => { upstream.destroy(); fail(res, 504, 'Provider response timed out'); });
      upstream.on('error', () => fail(res, 502, 'Could not connect to the provider'));
      res.on('close', () => { if (!res.writableEnded) upstream.destroy(); });
      upstream.end(body);
    } catch { fail(res, 500, 'Could not process the adapter request'); }
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (_req, socket) => socket.destroy());
  server.once('error', (error) => {
    if (process.send) process.send({ error: `Could not start the Codex request adapter: ${error.code}` }, () => process.exit(1));
    else process.exit(1);
  });
  server.listen(initial.port || 0, '127.0.0.1', () => {
    const port = server.address().port;
    write(file, { ...read(file), port });
    if (process.send) process.send({ port });
    // Removing/disabling a profile revokes its adapter without killing an
    // arbitrary process by a recycled PID. No credentials or prompts are logged.
    setInterval(() => {
      try { const current = read(file); if (current.route === initial.route && current.port === port) return; } catch { /* removed */ }
      for (const socket of sockets) socket.destroy();
      server.close(() => process.exit(0));
    }, 2000).unref();
  });
  return server;
}

if (require.main === module) {
  const [command, file] = process.argv.slice(2);
  if (command === 'serve') serve(file);
  else if (['prepare', 'auth'].includes(command)) {
    ensure(file).then((port) => process.stdout.write(command === 'auth' ? read(file).route : String(port))).catch((error) => {
      console.error(error.message); process.exitCode = 1;
    });
  } else { console.error('Invalid Codex request adapter command'); process.exitCode = 1; }
}
module.exports = { PARAMETERS, normalize, omitted, enabled, transform, serve, ensure, ping };
