const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { Store } = require('../cli/store');
const { readImport, prepareImport, applyImport } = require('../cli/transfer');
const cx = require('../src/agents/codex');

function isolatedStore(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-import-'));
  const variables = { HOME: home, USERPROFILE: home, CODEX_HOME: path.join(home, '.codex'), CLAUDE_CONFIG_DIR: path.join(home, '.claude'), CLAUDE_PROVIDERS_CONFIG: '', CLAUDE_PROVIDERS_VSCODE_SETTINGS: '' };
  const previous = Object.fromEntries(Object.keys(variables).map((key) => [key, process.env[key]]));
  Object.assign(process.env, variables);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(home, { recursive: true, force: true });
  });
  return { home, store: new Store({ standalone: true }) };
}

// Generate fixtures with the real extension's exporter, so format drift fails here.
async function extensionExport(claude, codex, withKeys) {
  let output;
  const deps = {
    vscode: {
      Uri: { file: (name) => name },
      window: { showQuickPick: async (items) => items.find((x) => x._withTokens === withKeys), showSaveDialog: async () => 'profiles.json', showInformationMessage: () => {} },
      workspace: { fs: { writeFile: async (_, bytes) => { output = JSON.parse(Buffer.from(bytes).toString('utf8')); } } },
    },
    crypto: require('crypto'), './i18n': { t: (k) => k },
    './profiles': { getProfiles: () => claude, getCodexProfiles: () => codex, cachedToken: (p) => p.id + '-secret' },
    './badges': {}, './editor': {}, './codex': {}, './agents/codex': cx,
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/transfer.js'), 'utf8'), { module, Buffer, require: (id) => { assert.ok(deps[id], id); return deps[id]; } });
  await module.exports.exportProfiles(); const claudeJSON = output;
  await module.exports.exportCodexProfiles();
  return [...claudeJSON, ...output];
}

test('CLI imports actual extension exports, including keys, duplicate names and multiple Codex models', async (t) => {
  const { home, store } = isolatedStore(t);
  const data = await extensionExport(
    [{ id: 'old-claude', name: 'Gateway', env: { ANTHROPIC_BASE_URL: 'https://example.invalid', ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus' } }],
    [{ id: 'old-codex', key: 'old-key', name: 'Gateway', codex: { base_url: 'https://example.invalid/v1', model: 'b', models: ['a', 'b'], reasoning_effort: 'high', http_headers: { 'X-App': 'test' }, query_params: { region: 'eu' }, request_compatibility: { models: { a: { tool_choice: 'omit' } } } } }], true);
  store.saveProfiles([{ id: 'existing', name: 'Gateway', env: {} }]);
  store.saveCodexProfiles([{ id: 'existing-codex', name: 'Gateway', key: 'cps-gateway', codex: {} }]);
  store.setToken('existing', 'keep-secret');
  const before = JSON.stringify(data);
  const plan = applyImport(store, data);
  assert.equal(plan.added.length, 2);
  assert.equal(store.profiles()[1].name, 'Gateway2');
  assert.equal(store.codexProfiles()[1].name, 'Gateway2');
  assert.notEqual(store.profiles()[1].id, 'old-claude');
  assert.notEqual(store.codexProfiles()[1].key, 'cps-gateway');
  assert.deepEqual(store.codexProfiles()[1].codex, data[1].codex);
  assert.equal(store.token(store.profiles()[1]), 'old-claude-secret');
  assert.equal(store.codexToken(store.codexProfiles()[1]), 'old-codex-secret');
  assert.equal(store.token(store.profiles()[0]), 'keep-secret');
  assert.equal(store.profiles()[1].env.ANTHROPIC_AUTH_TOKEN, undefined);
  assert.equal(fs.readFileSync(store.settingsPath, 'utf8').includes('-secret'), false);
  assert.equal(JSON.stringify(data), before);
  assert.equal(fs.existsSync(path.join(home, '.codex')), false);
  assert.equal(fs.existsSync(path.join(home, '.claude')), false);
  assert.equal(applyImport(store, data).added[0].name, 'Gateway3');
});

test('exports without keys and native subscriptions import without requiring secrets or installed clients', async (t) => {
  const { store } = isolatedStore(t);
  const data = await extensionExport([{ id: 'a', name: 'Native Claude', env: {} }], [{ id: 'b', name: 'OpenAI', codex: {} }], false);
  const plan = applyImport(store, data);
  assert.equal(plan.pendingKeys.length, 0);
  assert.deepEqual(store.profiles()[0].env, {});
  assert.deepEqual(store.codexProfiles()[0].codex, {});
  assert.equal(fs.existsSync(path.join(path.dirname(store.settingsPath), 'keys.json')), false);
});

test('malformed/wrong-client imports do not alter saved profiles or keys; preview is read-only', (t) => {
  const { store } = isolatedStore(t);
  store.saveProfiles([{ id: 'keep', name: 'Keep', env: {} }]);
  const before = fs.readFileSync(store.settingsPath, 'utf8');
  assert.throws(() => applyImport(store, {}), /array/);
  assert.throws(() => applyImport(store, [{ name: 'Codex', codex: {} }], 'claude'), /No valid/);
  assert.throws(() => applyImport(store, [null, { name: 'Other' }, { name: '', env: {} }]), /No valid/);
  const plan = prepareImport(store, [{ name: 'New', env: { ANTHROPIC_AUTH_TOKEN: 'key' } }]);
  assert.equal(plan.pendingKeys.length, 1);
  assert.equal(fs.readFileSync(store.settingsPath, 'utf8'), before);
});

test('JSON import accepts BOM and quoted/dragged filenames and filters client-specific entries', (t) => {
  const { home, store } = isolatedStore(t);
  const file = path.join(home, 'export with spaces.json');
  fs.writeFileSync(file, '\uFEFF' + JSON.stringify([{ name: 'C', env: {} }, { name: 'X', codex: {} }]));
  const data = readImport('"' + file + '"');
  assert.equal(applyImport(store, data, 'codex').added.length, 1);
  assert.equal(store.profiles().length, 0);
  assert.equal(store.codexProfiles()[0].name, 'X');
});
