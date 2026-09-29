const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const codex = require('../src/agents/codex');
const toml = require('../src/toml');

function tempHome(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-codex-'));
  process.env.HOME = dir; // key files live under ~/.claude-provider-switcher
  process.env.USERPROFILE = dir;
  process.env.CODEX_HOME = path.join(dir, '.codex');
  fs.mkdirSync(process.env.CODEX_HOME);
  if (initial !== undefined) fs.writeFileSync(path.join(process.env.CODEX_HOME, 'config.toml'), initial);
  return dir;
}
const read = () => fs.readFileSync(codex.configPath(), 'utf8');
const top = (k, text = read()) => toml.getTopLevelString(text, k);

const deepseek = { id: 'id-deep', name: 'DeepSeek', key: 'cps-deepseek', codex: { base_url: 'https://api.example.com/v1', model: 'ds-chat', reasoning_effort: 'high' } };
const ollama = { id: 'id-oll', name: 'Ollama', key: 'cps-ollama', codex: { base_url: 'http://localhost:11434/v1', model: 'qwen3' } };
const openai = { id: 'id-oai', name: 'OpenAI', key: 'cps-openai', codex: { model: 'gpt-5.5' } };
const openaiDefault = { id: 'id-oai2', name: 'OpenAI default', key: 'cps-openai-default', codex: {} };
const all = [deepseek, ollama, openai, openaiDefault];
const tokens = { 'id-deep': 'sk-deep' };
const tokenFor = (p) => tokens[p.id] || '';

test('assignKey derives a unique slug from the name', () => {
  const list = [{ name: 'Open Router' }, { name: 'Open Router' }, { name: 'Ключ!!' }];
  for (const p of list) codex.assignKey(p, list);
  assert.deepEqual(list.map((p) => p.key), ['cps-open-router', 'cps-open-router-2', 'cps-provider']);
});

test('switching sets the top-level keys and the provider tables; keys stay out of config.toml', () => {
  tempHome('# my config\nmodel = "gpt-5"\n\n[tui]\nnotifications = true\n');
  const r = codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  assert.equal(r.changed, true);
  const text = read();
  assert.ok(text.startsWith('# my config\nmodel = "ds-chat"\nmodel_provider = "cps-deepseek"\nmodel_reasoning_effort = "high"\n\n[tui]\nnotifications = true\n'), text);
  assert.match(text, /# active-profile = "cps-deepseek"\n# active-provider = "cps-deepseek"\n# previous model = "gpt-5"\n/);
  assert.match(text, /\[model_providers\.cps-deepseek\]\nname = "DeepSeek"\nbase_url = "https:\/\/api\.example\.com\/v1"\nwire_api = "responses"\nauth = \{ command = "(cat|cmd)", args = \[.*id-deep\.key"\] \}/);
  assert.ok(!text.includes('sk-deep'), 'no key in config.toml');
  const keyFile = codex.keyFilePathFor(deepseek);
  assert.equal(fs.readFileSync(keyFile, 'utf8'), 'sk-deep');
  if (process.platform !== 'win32') assert.equal(fs.statSync(keyFile).mode & 0o777, 0o600);
  assert.ok(!/cps-ollama\]\n[^[]*auth =/.test(text), 'no auth for a provider without a key');
  assert.match(text, /\[model_providers\.cps-ollama\]/);
  assert.ok(!/cps-openai\]/.test(text), 'the built-in provider needs no table');
  assert.ok(!/^profile\s*=/m.test(text), 'no legacy profile selector');
  assert.equal(codex.activeId(all), 'id-deep');
  assert.ok(fs.existsSync(codex.backupPath()), 'first write keeps a backup');

  codex.syncConfig({ profiles: all, activate: 'id-oll', tokenFor });
  const t2 = read();
  assert.equal(codex.activeId(all), 'id-oll');
  assert.equal(top('model_reasoning_effort', t2), undefined, 'unset effort is removed on a third-party provider');
  assert.match(t2, /id-deep\.key/, 'the inactive profile keeps its key (for codex --profile)');
  assert.match(t2, /# previous model = "gpt-5"/, 'previous values survive switches');
  assert.equal(codex.syncConfig({ profiles: all, activate: 'id-oll', tokenFor }).changed, false, 'idempotent');
});

test('a file without tables: the keys stay above the managed block', () => {
  tempHome('');
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  const text = read();
  assert.equal(top('model_provider', text), 'cps-deepseek');
  assert.ok(text.indexOf('model_provider =') < text.indexOf(codex.BLOCK_BEGIN));
  codex.syncConfig({ profiles: all, activate: 'id-oll', tokenFor });
  assert.equal(top('model_provider'), 'cps-ollama');
  assert.equal(top('model'), 'qwen3');
});

test('built-in provider: empty fields fall back to the user\'s own values', () => {
  tempHome('model = "gpt-5"\nmodel_reasoning_effort = "low"\n');
  codex.syncConfig({ profiles: all, activate: 'id-oai2', tokenFor });
  assert.equal(top('model_provider'), 'openai');
  assert.equal(top('model'), 'gpt-5');
  assert.equal(top('model_reasoning_effort'), 'low');
  assert.equal(codex.activeId(all), 'id-oai2');
});

test('reset restores the user\'s values and removes the ones they did not have', () => {
  tempHome('model = "gpt-5"\nmodel_provider = "mine"\n\n[model_providers.mine]\nname = "Mine"\n');
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  codex.syncConfig({ profiles: all, activate: 'id-oai', tokenFor });
  codex.syncConfig({ profiles: all, activate: null, tokenFor });
  const text = read();
  assert.equal(top('model', text), 'gpt-5');
  assert.equal(top('model_provider', text), 'mine');
  assert.equal(top('model_reasoning_effort', text), undefined);
  assert.equal(codex.activeId(all, text), null);
  assert.ok(!text.includes('previous'));
  assert.match(text, /\[model_providers\.mine\]/);
});

test('a hand edit of model_provider hands control back to the user', () => {
  tempHome('');
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  fs.writeFileSync(codex.configPath(), read().replace('model_provider = "cps-deepseek"', 'model_provider = "openai"'));
  assert.equal(codex.activeId(all), null);
  codex.syncConfig({ profiles: all, activate: undefined, tokenFor }); // e.g. a profile edit
  assert.equal(top('model_provider'), 'openai', 'the user\'s choice is kept');
});

test('profile edits re-apply the active profile; deleting it restores the user\'s values', () => {
  tempHome('model = "gpt-5"\n');
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  const edited = { ...deepseek, codex: { ...deepseek.codex, model: 'ds-reasoner' } };
  codex.syncConfig({ profiles: [edited, ollama], activate: undefined, tokenFor });
  assert.equal(top('model'), 'ds-reasoner');
  codex.syncConfig({ profiles: [ollama], activate: undefined, tokenFor });
  assert.equal(top('model'), 'gpt-5');
  assert.equal(top('model_provider'), undefined);
  codex.syncConfig({ profiles: [], activate: undefined, tokenFor });
  assert.equal(read(), 'model = "gpt-5"\n');
});

test('a client without the key keeps the key already on disk', () => {
  tempHome('');
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  codex.syncConfig({ profiles: all, activate: undefined, tokenFor: () => '' });
  assert.equal(codex.tokenInConfig(deepseek), 'sk-deep');
  assert.match(read(), /id-deep\.key/);
});

test('config mode: only the active key, as experimental_bearer_token; key files removed', () => {
  tempHome('');
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  codex.syncConfig({ profiles: all, activate: undefined, tokenFor, keyStorage: 'config' });
  const text = read();
  assert.match(text, /experimental_bearer_token = "sk-deep"/);
  assert.ok(!/auth = /.test(text));
  assert.equal(codex.hasKeyFile(deepseek), false);
  codex.syncConfig({ profiles: all, activate: 'id-oll', tokenFor, keyStorage: 'config' });
  assert.ok(!read().includes('sk-deep'), 'the inactive key is removed');
});

test('a key a previous version left in config.toml moves to a key file', () => {
  tempHome('');
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor, keyStorage: 'config' });
  codex.syncConfig({ profiles: all, activate: undefined, tokenFor: () => '' });
  assert.equal(codex.readKeyFileFor(deepseek), 'sk-deep');
  assert.ok(!read().includes('sk-deep'));
});

test('profile files for codex --profile: written, kept in sync, never over the user\'s own', () => {
  tempHome('');
  fs.writeFileSync(codex.profileFilePath('cps-ollama'), 'model = "mine"\n'); // the user's file
  codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor });
  const deep = fs.readFileSync(codex.profileFilePath('cps-deepseek'), 'utf8');
  assert.match(deep, /^# Managed by claude-provider-switcher/);
  assert.match(deep, /\nmodel_provider = "cps-deepseek"\nmodel = "ds-chat"\nmodel_reasoning_effort = "high"\n$/);
  assert.match(fs.readFileSync(codex.profileFilePath('cps-openai'), 'utf8'), /model_provider = "openai"/);
  assert.equal(fs.readFileSync(codex.profileFilePath('cps-ollama'), 'utf8'), 'model = "mine"\n');
  codex.syncConfig({ profiles: [ollama, openai], activate: undefined, tokenFor });
  assert.equal(fs.existsSync(codex.profileFilePath('cps-deepseek')), false, 'removed with its profile');
  assert.equal(codex.hasKeyFile(deepseek), false, 'its key file too');
  assert.equal(fs.existsSync(codex.profileFilePath('cps-ollama')), true);
});

test('nothing to do leaves a foreign file byte for byte', () => {
  const text = 'model = "x"'; // no trailing newline
  tempHome(text);
  assert.equal(codex.syncConfig({ profiles: [openai], activate: undefined, tokenFor }).changed, false);
  assert.equal(read(), text);
});

test('conflicts are refused without touching the file', () => {
  const inline = 'model_providers = { x = { name = "x" } }\n';
  tempHome(inline);
  assert.throws(() => codex.syncConfig({ profiles: all, activate: 'id-deep', tokenFor }), { code: 'inlineTable' });
  assert.equal(read(), inline);

  const dup = '[model_providers.cps-ollama]\nname = "mine"\n';
  tempHome(dup);
  assert.throws(() => codex.syncConfig({ profiles: all, activate: 'id-oll', tokenFor }), { code: 'conflict' });
  assert.equal(read(), dup);

  const weird = 'model = 5\n';
  tempHome(weird);
  assert.throws(() => codex.syncConfig({ profiles: all, activate: 'id-oll', tokenFor }), { code: 'valueType' });
  assert.equal(read(), weird);
});

test('needsKey: remote yes, local and built-in no', () => {
  assert.equal(codex.needsKey(deepseek), true);
  assert.equal(codex.needsKey(ollama), false);
  assert.equal(codex.needsKey(openai), false);
});
