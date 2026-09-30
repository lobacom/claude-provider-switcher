const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const codex = require('../src/agents/codex');
const toml = require('../src/toml');

function tempHome(initial) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-codex-cat-'));
  process.env.HOME = dir;
  process.env.USERPROFILE = dir;
  process.env.CODEX_HOME = path.join(dir, '.codex');
  fs.mkdirSync(process.env.CODEX_HOME);
  if (initial !== undefined) fs.writeFileSync(path.join(process.env.CODEX_HOME, 'config.toml'), initial);
  return dir;
}
const read = () => fs.readFileSync(codex.configPath(), 'utf8');
const top = (k) => toml.getTopLevelString(read(), k);
const readCatalog = () => JSON.parse(fs.readFileSync(codex.catalogPath(), 'utf8'));

// A stand-in for the `codex` CLI: `--version`, and `debug models` that prints
// the bundled catalog, or the file `model_catalog_json` points at (rejecting
// entries without base_instructions, as Codex does).
function fakeCodex({ version = 'codex-cli 1.0.0', reject = false } = {}) {
  const calls = [];
  const run = (args, home) => {
    calls.push(args.join(' '));
    if (args[0] === '--version') return `${version}\n`;
    const cfg = fs.readFileSync(path.join(home, 'config.toml'), 'utf8');
    const file = toml.getTopLevelString(cfg, 'model_catalog_json');
    if (!file) {
      return JSON.stringify({ models: [
        { slug: 'hidden', visibility: 'hide', priority: 0, base_instructions: 'HIDDEN' },
        { slug: 'gpt-b', visibility: 'list', priority: 5, base_instructions: 'B' },
        { slug: 'gpt-a', visibility: 'list', priority: 1, base_instructions: 'You are Codex.' },
      ] });
    }
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (reject || j.models.some((m) => !m.base_instructions)) throw new Error('missing field `base_instructions`');
    return JSON.stringify(j);
  };
  return { run, calls };
}

const min = { id: 'id-min', name: 'MiniMax', key: 'cps-minimax', codex: { base_url: 'https://api.minimax.io/v1', model: 'MiniMax-M3', reasoning_effort: 'high' } };
const ds = { id: 'id-ds', name: 'DeepSeek', key: 'cps-deepseek', codex: { base_url: 'https://api.deepseek.com/v1', model: 'deepseek-flash' } };
const builtin = { id: 'id-oa', name: 'OpenAI', key: 'cps-openai', codex: { model: 'gpt-6' } };
const all = [min, ds, builtin];
const sync = (activate, run, profiles = all) => codex.syncConfig({ profiles, activate, tokenFor: () => '', runCodex: run });

test('a third-party profile gets a catalog with its model alone, by absolute path', () => {
  tempHome('# user\n');
  const { run } = fakeCodex();
  sync('id-min', run);
  assert.equal(top('model_catalog_json'), codex.catalogPath());
  assert.ok(path.isAbsolute(top('model_catalog_json')));
  const cat = readCatalog();
  assert.equal(cat.checked_with, 'codex-cli 1.0.0');
  assert.deepEqual(cat.models.map((m) => m.slug), ['MiniMax-M3']);
  const m = cat.models[0];
  assert.equal(m.description, 'MiniMax');
  assert.equal(m.base_instructions, 'You are Codex.'); // top listed bundled model
  assert.deepEqual(m.supported_reasoning_levels, [{ effort: 'high', description: 'high' }]);
  // Outside the managed block, so the next sync's block rewrite keeps it.
  const blockAt = read().indexOf(codex.BLOCK_BEGIN);
  assert.ok(read().indexOf('model_catalog_json') < blockAt);
});

test('switching to the built-in provider or resetting drops the key and the file', () => {
  tempHome('model = "gpt-5"\n');
  const { run } = fakeCodex();
  sync('id-min', run);
  sync('id-oa', run);
  assert.equal(top('model_catalog_json'), undefined);
  assert.ok(!fs.existsSync(codex.catalogPath()));
  sync('id-ds', run);
  assert.deepEqual(readCatalog().models.map((m) => m.slug), ['deepseek-flash']);
  sync(null, run);
  assert.equal(toml.setBlock(read(), codex.BLOCK_BEGIN, codex.BLOCK_END, null), 'model = "gpt-5"\n');
  assert.ok(!fs.existsSync(codex.catalogPath()));
});

test('no key when the CLI is missing or rejects the catalog', () => {
  tempHome('');
  sync('id-min', () => { throw new Error('ENOENT'); });
  assert.equal(top('model_catalog_json'), undefined);
  assert.ok(!fs.existsSync(codex.catalogPath()));
  sync('id-min', fakeCodex({ reject: true }).run);
  assert.equal(top('model_catalog_json'), undefined);
  assert.ok(!fs.existsSync(codex.catalogPath()));
  assert.deepEqual(fs.readdirSync(path.dirname(codex.catalogPath())), []); // no temp file left
  assert.equal(top('model_provider'), 'cps-minimax'); // the switch itself still happens
});

test('an unchanged entry on the same Codex version is not re-checked', () => {
  tempHome('');
  const a = fakeCodex();
  sync('id-min', a.run);
  const b = fakeCodex();
  sync(undefined, b.run);
  assert.deepEqual(b.calls, ['--version']);
  const c = fakeCodex({ version: 'codex-cli 2.0.0' });
  sync(undefined, c.run);
  assert.ok(c.calls.includes('debug models'));
  assert.equal(readCatalog().checked_with, 'codex-cli 2.0.0');
});

test('the broken "~/model-catalogs/…" value of a pre-release build is replaced or removed', () => {
  tempHome('model_catalog_json = "~/model-catalogs/cps-custom.json"\n');
  sync('id-min', fakeCodex().run);
  assert.equal(top('model_catalog_json'), codex.catalogPath());
  tempHome('model_catalog_json = "~/model-catalogs/cps-custom.json"\nmodel = "gpt-5"\n');
  sync('id-oa', fakeCodex().run);
  assert.equal(top('model_catalog_json'), undefined);
});

test('a model_catalog_json the user set is left alone, file included', () => {
  tempHome('model_catalog_json = "mine.json"\n');
  const file = path.join(process.env.CODEX_HOME, 'mine.json');
  const own = JSON.stringify({ models: [{ slug: 'user-x' }] });
  fs.writeFileSync(file, own);
  const { run, calls } = fakeCodex();
  sync('id-min', run);
  sync(null, run);
  assert.equal(top('model_catalog_json'), 'mine.json');
  assert.equal(fs.readFileSync(file, 'utf8'), own);
  assert.deepEqual(calls, []);
});
