const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

test('terminal app: saving Codex profiles keeps the active one active', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-store-'));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.CODEX_HOME = path.join(home, '.codex');
  const settings = path.join(home, 'settings.json');
  // A hand-written profile without a `key`: its config.toml name derives from its id.
  fs.writeFileSync(settings, JSON.stringify({
    'claudeProviderSwitcher.codexProfiles': [
      { id: '11111111-aaaa', name: 'Mock', codex: { base_url: 'http://127.0.0.1:1/v1', model: 'm' } },
    ],
  }));
  const { Store } = require('../cli/store');
  const codex = require('../src/agents/codex');
  const store = new Store({ settingsPath: settings });
  store.syncCodex('11111111-aaaa');
  assert.equal(store.codexActiveId(), '11111111-aaaa');

  const list = store.codexProfiles();
  const added = { id: '22222222-bbbb', name: 'Other', codex: {} };
  codex.assignKey(added, list);
  list.push(added);
  store.saveCodexProfiles(list);
  store.syncCodex(undefined);
  assert.equal(store.codexActiveId(), '11111111-aaaa');
  assert.equal(store.codexProfiles()[0].key, undefined, 'existing profiles keep their derived name');
  assert.equal(store.codexProfiles()[1].key, 'cps-other');
});
