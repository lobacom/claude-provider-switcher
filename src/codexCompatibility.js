const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { keyDir } = require('./keyfile');
const policy = require('./codexAdapter');

const directory = () => path.join(keyDir(), 'codex-adapters');
const configPath = (p) => path.join(directory(), `${String(p.id || '').replace(/[^A-Za-z0-9_-]/g, '_') || 'unknown'}.json`);
function settings(p) { return policy.normalize((p.codex || {}).request_compatibility); }
function enabled(p) { return !!(p.codex || {}).base_url && policy.enabled(settings(p)); }
function nodePath() {
  const privateNode = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'claude-provider-switcher', 'runtime', 'node.exe')
    : path.join(os.homedir(), '.local', 'share', 'claude-provider-switcher', 'runtime', 'bin', 'node');
  for (const candidate of [...(!process.versions.electron ? [process.execPath] : []), 'node', privateNode]) {
    try {
      const result = execFileSync(candidate, ['-p', 'Number(process.versions.node.split(".")[0]) >= 18 ? process.execPath : ""'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }).trim();
      if (result) return result;
    } catch { /* next runtime */ }
  }
  throw new Error('Codex request compatibility requires Node.js 18+. Install Node.js or the standalone claude-providers application.');
}
function prepare(p, keyFile, requiresKey) {
  const upstream = new URL(p.codex.base_url);
  if (!['http:', 'https:'].includes(upstream.protocol) || upstream.username || upstream.password) throw new Error('Invalid adapter provider URL');
  const runtime = nodePath();
  const file = configPath(p);
  fs.mkdirSync(directory(), { recursive: true, mode: 0o700 });
  const script = path.join(directory(), 'adapter-v1.js');
  const source = fs.readFileSync(path.join(__dirname, 'codexAdapter.js'), 'utf8');
  if (!fs.existsSync(script) || fs.readFileSync(script, 'utf8') !== source) fs.writeFileSync(script, source, { mode: 0o600 });
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first use */ }
  const config = { port: previous.port || 0, route: previous.route || crypto.randomBytes(32).toString('hex'), upstream: upstream.href,
    key_file: keyFile, requires_key: requiresKey, compatibility: settings(p) };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(config) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
  // Provision a stable loopback port now. auth.command restarts the adapter on
  // that port after a reboot, without needing VS Code to be running.
  const port = Number(execFileSync(runtime, [script, 'prepare', file], { encoding: 'utf8', windowsHide: true, timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Codex request adapter port');
  return { base_url: `http://127.0.0.1:${port}/${config.route}/v1`, command: runtime, args: [script, 'auth', file] };
}
function prune(profiles) {
  const keep = new Set(profiles.filter(enabled).map(configPath));
  if (!fs.existsSync(directory())) return;
  for (const name of fs.readdirSync(directory())) {
    const file = path.join(directory(), name);
    if (/^[A-Za-z0-9_-]+\.json$/.test(name) && !keep.has(file)) fs.unlinkSync(file);
  }
}
function setRule(p, model, parameter, mode) {
  if (!policy.PARAMETERS.includes(parameter) || !['keep', 'omit', 'inherit'].includes(mode)) throw new Error('Invalid request compatibility rule');
  const current = settings(p);
  const rules = model === null ? current.parameters : { ...(Object.prototype.hasOwnProperty.call(current.models, model) ? current.models[model] : {}) };
  if (mode === 'inherit') delete rules[parameter];
  else rules[parameter] = mode;
  if (model !== null) {
    if (Object.keys(rules).length) current.models = { ...current.models, [model]: rules };
    else delete current.models[model];
  }
  if (Object.keys(current.parameters).length || Object.keys(current.models).length) p.codex.request_compatibility = current;
  else delete p.codex.request_compatibility;
}
module.exports = { ...policy, settings, enabled, prepare, prune, configPath, setRule };
