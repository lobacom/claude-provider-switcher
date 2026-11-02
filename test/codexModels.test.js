const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cx = require('../src/agents/codex');

// Exercise the real picker code with scripted VS Code dialogs and no network.
function picker({ remote = [], select = [], input = [], probe } = {}) {
  const module = { exports: {} };
  const vscode = {
    ProgressLocation: { Notification: 1 }, QuickPickItemKind: { Separator: -1 },
    window: {
      withProgress: (_, fn) => fn(),
      showQuickPick: async (items, options) => {
        assert.ok(select.length, 'unexpected picker');
        return select.shift()(items, options);
      },
      showInputBox: async (options) => {
        assert.ok(input.length, 'unexpected input');
        const next = input.shift();
        return typeof next === 'function' ? next(options) : next;
      },
    },
  };
  const deps = {
    vscode,
    './i18n': { t: (key) => key },
    './agents/codex': cx,
    './http': { probeModelsList: async (...args) => {
      if (probe) probe(...args);
      return { ok: !!remote.length, models: remote };
    } },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/codexModels.js'), 'utf8'), {
    module, require: (id) => {
      assert.ok(deps[id], `unexpected dependency ${id}`);
      return deps[id];
    },
  });
  return module.exports;
}

const profile = { name: 'Gateway', codex: { base_url: 'https://example.com/v1', model: 'a', models: ['a', 'saved'] } };

test('multi-select combines discovered and saved models and uses profile request options', async () => {
  const p = { ...profile, codex: { ...profile.codex, http_headers: { 'X-Test': 'yes' }, query_params: { plan: 'test' } } };
  const ui = picker({ remote: ['a', 'b'], probe: (url, token, extra) => {
    assert.equal(url, p.codex.base_url);
    assert.equal(token, 'test-key');
    assert.deepEqual(extra, cx.requestExtra(p));
  }, select: [(items, options) => {
    assert.equal(options.canPickMany, true);
    assert.deepEqual(Array.from(items.filter((i) => i.picked), (i) => i._v), ['a', 'saved']);
    return items.filter((i) => ['a', 'b'].includes(i._v));
  }] });
  assert.deepEqual(Array.from(await ui.pickCodexModels(p, 'test-key')), ['a', 'b']);
});

test('manual ids can be mixed with discovered models and deduplicated', async () => {
  const ui = picker({ remote: ['a', 'b'], select: [
    (items) => items.filter((i) => i._v === 'a' || i._manual),
    (items) => {
      assert.ok(items.some((i) => i._v === 'manual-model' && i.picked));
      return items.filter((i) => i.picked);
    },
  ], input: [' a, manual-model; manual-model '] });
  assert.deepEqual(Array.from(await ui.pickCodexModels(profile, '')), ['a', 'manual-model']);
});

test('without discovery or saved models manual entry accepts several ids or an empty list', async () => {
  const p = { codex: { base_url: 'http://localhost:1/v1' } };
  assert.deepEqual(Array.from(await picker({ input: [' a, b; a '] }).pickCodexModels(p, '')), ['a', 'b']);
  assert.deepEqual(Array.from(await picker({ input: [''] }).pickCodexModels(p, '')), []);
});

test('cancelling multi-select or manual entry leaves the existing profile untouched', async () => {
  const before = JSON.stringify(profile);
  assert.equal(await picker({ select: [() => undefined] }).pickCodexModels(profile, ''), undefined);
  assert.equal(await picker({ select: [(items) => items.filter((i) => i._manual)], input: [undefined] })
    .pickCodexModels(profile, ''), undefined);
  assert.equal(JSON.stringify(profile), before);
});

test('saved default choices remain usable when discovery fails; empty multi-select clears models', async () => {
  assert.equal(await picker({ select: [(items) => items.find((i) => i._v === 'saved')] })
    .pickCodexModel(profile, ''), 'saved');
  assert.deepEqual(Array.from(await picker({ select: [() => []] }).pickCodexModels(profile, '')), []);
  assert.equal(await picker({ select: [(items) => items.find((i) => i._v === '')] })
    .pickCodexModel(profile, ''), '');
});
