// Read exactly the JSON arrays exported by src/transfer.js. No VS Code API.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { uniqueName, firstFreeBadge, HOTKEYS } = require('./store');
const cx = require('../src/agents/codex');

const CODEX_FIELDS = ['base_url', 'model', 'models', 'reasoning_effort', 'http_headers', 'query_params'];
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
function importPath(value) {
  let file = value.trim().replace(/^(["'])(.*)\1$/, '$2');
  if (/^~[/\\]/.test(file)) file = path.join(os.homedir(), file.slice(2));
  if (!file) throw new Error('Choose a JSON file.');
  return path.resolve(file);
}
function readImport(file) {
  const data = JSON.parse(fs.readFileSync(importPath(file), 'utf8').replace(/^\uFEFF/, ''));
  if (!Array.isArray(data)) throw new Error('Expected a JSON array exported by Claude Provider Switcher.');
  return data;
}

function prepareImport(store, data, agent = 'all') {
  if (!Array.isArray(data)) throw new Error('Expected a JSON array exported by Claude Provider Switcher.');
  const claude = JSON.parse(JSON.stringify(store.profiles()));
  const codex = JSON.parse(JSON.stringify(store.codexProfiles()));
  const pendingKeys = [];
  const added = [];
  let skipped = 0;
  for (const raw of data) {
    if (!object(raw) || typeof raw.name !== 'string' || !raw.name.trim()) { skipped++; continue; }
    const kind = object(raw.codex) ? 'codex' : 'claude';
    if (agent !== 'all' && kind !== agent) { skipped++; continue; }
    // Exported Claude entries always have env. Reject unrelated named objects.
    if (kind === 'claude' && !object(raw.env)) { skipped++; continue; }
    const list = kind === 'codex' ? codex : claude;
    const p = { id: crypto.randomUUID(), name: uniqueName(raw.name.trim(), list), color: raw.color || firstFreeBadge(list) };
    let token;
    if (kind === 'codex') {
      p.codex = {};
      for (const key of CODEX_FIELDS) if (raw.codex[key] !== undefined) p.codex[key] = raw.codex[key];
      cx.assignKey(p, list);
      token = raw.apiKey;
    } else {
      p.env = { ...raw.env };
      token = p.env.ANTHROPIC_AUTH_TOKEN;
      delete p.env.ANTHROPIC_AUTH_TOKEN;
    }
    if (store.hasVsCode()) {
      const hotkeys = kind === 'codex' ? cx.CODEX_HOTKEYS : HOTKEYS;
      const hk = hotkeys.find((key) => !list.some((x) => x.hotkey === key));
      if (hk) p.hotkey = hk;
    }
    list.push(p);
    added.push({ agent: kind, name: p.name });
    if (typeof token === 'string' && token.trim()) pendingKeys.push([p.id, token.trim()]);
  }
  return { claude, codex, pendingKeys, added, skipped };
}

function applyImport(store, data, agent = 'all') {
  store.reload();
  const plan = prepareImport(store, data, agent);
  if (!plan.added.length) throw new Error('No valid profiles for the selected client in this file.');
  // Import only stores profiles and keys. Activation is a separate user action:
  // never create a missing client's config or switch an active session on import.
  if (plan.added.some((p) => p.agent === 'claude')) store.saveProfiles(plan.claude);
  if (plan.added.some((p) => p.agent === 'codex')) store.saveCodexProfiles(plan.codex);
  for (const [id, key] of plan.pendingKeys) store.setToken(id, key);
  return plan;
}

module.exports = { readImport, prepareImport, applyImport, importPath };
