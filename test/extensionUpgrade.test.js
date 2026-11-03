const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const constants = require('../src/constants');

test('extension upgrade keeps existing ids, SecretStorage tokens, active profile and switching behavior without CLI installation', async () => {
  const existing = [
    { id: 'existing-native', name: 'Subscription', env: {}, hotkey: 'Ctrl+Alt+1' },
    { id: 'existing-gateway', name: 'Gateway', env: { ANTHROPIC_BASE_URL: 'https://example.invalid', ANTHROPIC_DEFAULT_OPUS_MODEL: 'opus' }, hotkey: 'Ctrl+Alt+2' },
  ];
  const codexProfiles = [{ id: 'existing-codex', key: 'cps-existing', name: 'Codex', codex: { model: 'saved' } }];
  const values = {
    'claudeProviderSwitcher.profiles': existing,
    'claudeProviderSwitcher.codexProfiles': codexProfiles,
    'claudeCode.environmentVariables': { ...existing[1].env, ANTHROPIC_AUTH_TOKEN: 'existing-secret' },
  };
  const saved = JSON.stringify(values);
  const writes = [];
  const secrets = new Map([['claudeProviderSwitcher.token.existing-gateway', 'existing-secret'], ['claudeProviderSwitcher.token.existing-codex', 'codex-secret']]);
  const secretWrites = [];
  const vscode = {
    ConfigurationTarget: { Global: 1 },
    workspace: {
      getConfiguration: (section) => ({ get: (key) => values[`${section}.${key}`], update: async (key, value, target) => { assert.equal(target, 1); writes.push(`${section}.${key}`); values[`${section}.${key}`] = value; } }),
      fs: new Proxy({}, { get: () => () => assert.fail('CLI files must not be accessed by default') }),
    },
    window: { setStatusBarMessage: () => {} },
    commands: { executeCommand: () => assert.fail('Default switching must not reload the window') },
  };
  function load(file, deps) {
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { module, Buffer, require: (id) => { assert.ok(deps[id], `Unexpected extension dependency: ${id}`); return deps[id]; } });
    return module.exports;
  }
  const profiles = load('profiles.js', { vscode, crypto: require('crypto'), './constants': constants });
  profiles.initSecrets({ get: async (key) => secrets.get(key), store: async (...args) => secretWrites.push(args), delete: async (key) => secretWrites.push(key) });
  await profiles.migrateProfiles();
  await profiles.refreshTokenCache();
  assert.equal(JSON.stringify(values), saved, 'upgrading does not migrate or rewrite already-current settings');
  assert.equal(profiles.activeProfileIndex(), 1, 'the legacy applied env stays recognized');
  assert.equal(profiles.cachedToken(codexProfiles[0]), 'codex-secret');
  assert.equal(secretWrites.length, 0);
  let usage;
  const switching = load('switching.js', {
    vscode, './constants': constants, './profiles': profiles, './i18n': { t: (key) => key },
    './badges': {}, './http': {}, './statusbar': { markRestartPending: () => {} },
    './usage': { recordUsageSwitch: async (id) => { usage = id; } },
  });
  await switching.switchToIndex(0);
  assert.equal(profiles.activeProfileIndex(), 0);
  assert.equal(usage, 'existing-native');
  await switching.switchToIndex(1);
  assert.equal(profiles.activeProfileIndex(), 1);
  assert.equal(values['claudeCode.environmentVariables'].ANTHROPIC_AUTH_TOKEN, 'existing-secret');
  assert.equal(values['claudeCode.environmentVariables'].ANTHROPIC_DEFAULT_FABLE_MODEL, 'opus');
  assert.deepEqual(writes, ['claudeCode.environmentVariables', 'claudeCode.environmentVariables']);
  assert.equal(JSON.stringify(values['claudeProviderSwitcher.profiles']), JSON.stringify(existing));
});

test('extension entry point and defaults remain independent from CLI installers', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.main, './src/extension.js');
  assert.equal(pkg.scripts.install, undefined);
  assert.equal(pkg.scripts.postinstall, undefined);
  const props = pkg.contributes.configuration.properties;
  assert.equal(props['claudeProviderSwitcher.shareKeysWithTerminal'].default, false);
  assert.equal(props['claudeProviderSwitcher.writeClaudeSettings'].default, false);
  assert.deepEqual(props['claudeProviderSwitcher.profiles'].default, []);
  assert.deepEqual(props['claudeProviderSwitcher.codexProfiles'].default, []);
  const source = fs.readFileSync(path.join(__dirname, '../src/extension.js'), 'utf8');
  assert.equal(/require\(['"]\.\.\/cli\//.test(source), false);
});
