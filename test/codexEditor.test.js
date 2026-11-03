const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const compatibility = require('../src/codexCompatibility');
const cx = require('../src/agents/codex');

test('extension editor exposes provider defaults, model overrides and inheritance with explanatory choices', async () => {
  let profiles = [{ id: 'test', name: 'Gateway', codex: { base_url: 'https://example.invalid/v1', model: 'auto', models: ['auto', 'other'] } }];
  let saves = 0;
  let syncs = 0;
  const select = [
    (items) => items.find((i) => i._f?.key === 'request_compatibility'),
    (items) => items.find((i) => i._model === null),
    (items) => items.find((i) => i._parameter === 'tool_choice'),
    (items) => items.find((i) => i._mode === 'omit'),
    (items) => items.find((i) => i._done),
    (items) => items.find((i) => i._model === 'auto'),
    (items) => items.find((i) => i._parameter === 'tool_choice'),
    (items) => items.find((i) => i._mode === 'keep'),
    (items) => {
      assert.equal(compatibility.omitted(compatibility.settings(profiles[0]), 'auto').length, 0);
      assert.deepEqual(compatibility.omitted(compatibility.settings(profiles[0]), 'other'), ['tool_choice']);
      return items.find((i) => i._parameter === 'tool_choice');
    },
    (items) => items.find((i) => i._mode === 'inherit'),
    (items) => items.find((i) => i._done),
    (items) => items.find((i) => i._done),
    (items) => items.find((i) => i._done),
  ];
  const deps = {
    vscode: { window: { showQuickPick: async (items) => {
      assert.ok(select.length, 'unexpected picker');
      for (const item of items.filter((i) => i._parameter)) assert.ok(item.detail, 'parameter help is visible');
      for (const item of items.filter((i) => i._mode)) assert.ok(item.description, 'mode help is visible');
      const chosen = select.shift()(items);
      assert.ok(chosen, 'expected editor choice must exist');
      return chosen;
    } } },
    './i18n': { t: (key) => key },
    './profiles': { getCodexProfiles: () => profiles, cloneCodexProfiles: () => JSON.parse(JSON.stringify(profiles)),
      saveCodexProfiles: async (next) => { profiles = next; saves++; }, cachedToken: () => '' },
    './badges': {}, './agents/codex': cx, './codexCompatibility': compatibility, './codexModels': {},
    './codex': { findCodex: (id) => profiles.find((p) => p.id === id), syncCodex: () => { syncs++; } },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/codexEditor.js'), 'utf8'), { module, require: (id) => {
    assert.ok(deps[id], `unexpected dependency ${id}`); return deps[id];
  } });
  await module.exports.editCodexProfile('test');
  assert.equal(select.length, 0);
  assert.equal(saves, 3);
  assert.equal(syncs, 3);
  assert.deepEqual(compatibility.settings(profiles[0]), { parameters: { tool_choice: 'omit' }, models: {} });
});
