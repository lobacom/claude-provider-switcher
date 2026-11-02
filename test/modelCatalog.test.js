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

test('all selected models are listed, deduplicated, cached and kept within their provider', () => {
  tempHome('');
  const profile = { ...min, codex: { ...min.codex, models: ['MiniMax-M3', 'other-model', ' other-model ', '', null] } };
  const profiles = [profile, ds, builtin];
  sync('id-min', fakeCodex().run, profiles);
  assert.equal(top('model'), 'MiniMax-M3');
  assert.deepEqual(readCatalog().models.map((m) => m.slug), ['MiniMax-M3', 'other-model']);
  assert.ok(readCatalog().models.every((m) => m.base_instructions === 'You are Codex.'));
  const cached = fakeCodex();
  sync(undefined, cached.run, profiles);
  assert.deepEqual(cached.calls, ['--version']);

  codex.setProfileModels(profile, ['other-model', 'third-model']);
  sync(undefined, fakeCodex().run, profiles);
  assert.equal(top('model'), 'other-model');
  assert.deepEqual(readCatalog().models.map((m) => m.slug), ['other-model', 'third-model']);
  sync('id-ds', fakeCodex().run, profiles);
  assert.deepEqual(readCatalog().models.map((m) => m.slug), ['deepseek-flash']);
  sync('id-oa', fakeCodex().run, profiles);
  assert.equal(top('model_catalog_json'), undefined);
});

test('changing the model list preserves the default until removed and clearing restores Codex default', () => {
  tempHome('');
  const profile = { ...min, codex: { ...min.codex } };
  codex.setProfileModels(profile, ['other-model', 'MiniMax-M3']);
  assert.equal(profile.codex.model, 'MiniMax-M3');
  sync('id-min', fakeCodex().run, [profile]);
  codex.setProfileModels(profile, []);
  sync(undefined, fakeCodex().run, [profile]);
  assert.equal(top('model'), undefined);
  assert.equal(top('model_catalog_json'), undefined);
  assert.ok(!fs.existsSync(codex.catalogPath()));
});

test('a CLI accepting only part of a catalog does not leave a broken catalog configured', () => {
  tempHome('');
  const { run } = fakeCodex();
  const partial = (args, home) => {
    const output = run(args, home);
    if (args[0] !== 'debug') return output;
    const result = JSON.parse(output);
    result.models = result.models.slice(0, 1);
    return JSON.stringify(result);
  };
  const profile = { ...min, codex: { ...min.codex, models: ['other-model'] } };
  sync('id-min', partial, [profile]);
  assert.equal(top('model_catalog_json'), undefined);
  assert.ok(!fs.existsSync(codex.catalogPath()));
});

test('Alibaba Token Plan preset writes a Responses provider and compatible model capabilities', () => {
  tempHome('');
  const preset = require('../providers.json').codex.remote.find((p) => p.name === 'Qwen (Alibaba Token Plan)');
  assert.ok(preset);
  const profile = { ...preset, id: 'id-qwen', key: 'cps-qwen' };
  sync('id-qwen', fakeCodex().run, [profile]);
  assert.equal(top('model'), 'qwen3.8-max');
  assert.match(read(), /base_url = "https:\/\/token-plan\.ap-southeast-1\.maas\.aliyuncs\.com\/compatible-mode\/v1"/);
  assert.match(read(), /wire_api = "responses"/);
  const model = readCatalog().models[0];
  assert.equal(model.slug, 'qwen3.8-max');
  assert.equal(model.default_reasoning_level, 'medium');
  assert.equal(model.supports_reasoning_summaries, false);
  assert.equal(model.supports_parallel_tool_calls, false);
  profile.codex = { ...profile.codex, model: 'glm-5.3' };
  sync('id-qwen', fakeCodex().run, [profile]);
  assert.equal(readCatalog().models[0].slug, 'glm-5.3');
  assert.equal(readCatalog().models[0].supports_parallel_tool_calls, false);
});

test('Token Plan models expose their own effort choices instead of the profile default alone', () => {
  tempHome('');
  const preset = require('../providers.json').codex.remote.find((p) => p.name === 'Qwen (Alibaba Token Plan)');
  const profile = { ...preset, id: 'id-qwen', key: 'cps-qwen', codex: { ...preset.codex,
    models: ['qwen3.8-flash', 'deepseek-v4-pro', 'deepseek-v4.1-flash-1017', 'glm-5.3', 'auto'],
  } };
  const runner = fakeCodex();
  sync(profile.id, runner.run, [profile]);
  const models = readCatalog().models;
  const expected = [
    ['qwen3.8-max', ['none', 'low', 'medium', 'xhigh'], 'medium'],
    ['qwen3.8-flash', ['none', 'low', 'medium', 'xhigh'], 'medium'],
    ['deepseek-v4-pro', ['none', 'high', 'max'], 'high'],
    ['deepseek-v4.1-flash-1017', ['none', 'low', 'high', 'max'], 'high'],
    ['glm-5.3', ['low', 'high', 'max'], 'high'],
    ['auto', ['medium'], 'medium'],
  ];
  assert.deepEqual(models.map((m) => [m.slug, m.supported_reasoning_levels.map((x) => x.effort), m.default_reasoning_level]), expected);
  // Updating the default must not remove the other choices, including max.
  profile.codex.reasoning_effort = 'max';
  sync(undefined, runner.run, [profile]);
  const changed = readCatalog().models;
  assert.deepEqual(changed[0].supported_reasoning_levels, models[0].supported_reasoning_levels);
  assert.equal(changed[0].default_reasoning_level, 'xhigh');
  assert.equal(changed.find((m) => m.slug === 'glm-5.3').default_reasoning_level, 'max');
});

test('Token Plan effort defaults and aliases stay valid without leaking to unrelated endpoints', () => {
  const p = { codex: { base_url: 'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/' } };
  assert.deepEqual(codex.reasoningOptions(p, 'qwen3.8-max-0902'), { levels: ['none', 'low', 'medium', 'xhigh'], default: 'xhigh' });
  assert.equal(codex.reasoningOptions(p, 'glm-5.3').default, 'max');
  assert.deepEqual(codex.reasoningOptions(p, 'deepseek-v4-pro-0813').levels, ['none', 'low', 'high', 'max']);
  assert.deepEqual(codex.reasoningOptions(p, 'glm-5.2').levels, ['none', 'high', 'max']);
  p.codex.reasoning_effort = 'xhigh';
  assert.equal(codex.reasoningOptions(p, 'deepseek-v4-pro-0813').default, 'max');
  assert.equal(codex.reasoningOptions(p, 'deepseek-v4.1-flash-1017').default, 'high');
  p.codex.base_url = 'https://example.com/v1';
  assert.deepEqual(codex.reasoningOptions(p, 'qwen3.8-max'), { levels: ['xhigh'], default: 'xhigh' });
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
