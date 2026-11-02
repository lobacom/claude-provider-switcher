const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cx = require('../src/agents/codex');

test('Codex export/import retains multiple models and the default without exporting local ids or keys', async () => {
  const original = { id: 'local-id', key: 'cps-local', hotkey: 'Ctrl+1', name: 'Gateway', color: 'blue', codex: {
    base_url: 'https://example.com/v1', model: 'second', models: ['first', 'second'], reasoning_effort: 'medium',
  } };
  let exported;
  let imported;
  let syncs = 0;
  const module = { exports: {} };
  const deps = {
    vscode: {
      Uri: { file: (name) => name },
      window: {
        showQuickPick: async (items) => items.find((x) => x._withTokens === false),
        showSaveDialog: async () => 'profiles.json',
        showOpenDialog: async () => ['profiles.json'],
        showInformationMessage: () => {},
        showWarningMessage: (msg) => assert.fail(msg),
        showErrorMessage: (msg) => assert.fail(msg),
      },
      workspace: { fs: {
        writeFile: async (_, bytes) => { exported = Buffer.from(bytes).toString('utf8'); },
        readFile: async () => Buffer.from(exported),
      } },
    },
    crypto: require('crypto'),
    './i18n': { t: (key) => key },
    './profiles': {
      getCodexProfiles: () => [original], cloneCodexProfiles: () => [],
      saveCodexProfiles: async (list) => { imported = list; },
      cachedToken: () => assert.fail('Export without keys must not read tokens'),
      setToken: () => assert.fail('Import without keys must not write tokens'),
      uniqueName: (name) => name,
    },
    './badges': { firstFreeBadge: () => 'blue' },
    './editor': {},
    './codex': { firstFreeCodexHotkey: () => 'Ctrl+2', syncCodex: () => { syncs++; } },
    './agents/codex': cx,
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/transfer.js'), 'utf8'), {
    module, Buffer, require: (id) => {
      assert.ok(deps[id], `unexpected dependency ${id}`);
      return deps[id];
    },
  });
  await module.exports.exportCodexProfiles();
  const data = JSON.parse(exported);
  assert.deepEqual(data[0].codex, original.codex);
  assert.equal(data[0].id, undefined);
  assert.equal(data[0].key, undefined);
  assert.equal(data[0].apiKey, undefined);
  await module.exports.importCodexProfiles();
  assert.deepEqual(JSON.parse(JSON.stringify(imported[0].codex)), original.codex);
  assert.notEqual(imported[0].id, original.id);
  assert.equal(syncs, 1);
});
