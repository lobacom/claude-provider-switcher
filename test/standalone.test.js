const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-standalone-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const env = {
    ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'roaming'),
    LOCALAPPDATA: path.join(home, 'local'), XDG_CONFIG_HOME: path.join(home, 'config'),
    CODEX_HOME: path.join(home, '.codex'), CLAUDE_CONFIG_DIR: path.join(home, '.claude'),
    CLAUDE_PROVIDERS_CONFIG: '', CLAUDE_PROVIDERS_VSCODE_SETTINGS: '', PATH: '',
  };
  const run = (code) => {
    const result = spawnSync(process.execPath, ['-e', `const assert = require('node:assert/strict'); const fs = require('fs'); const path = require('path'); const { Store } = require('./cli/store'); ${code}`], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout;
  };
  const cli = (...args) => spawnSync(process.execPath, [path.join(root, 'bin', 'claude-providers.js'), ...args], { cwd: root, env, encoding: 'utf8' });
  return { home, env, run, cli };
}

test('no editor or clients: standalone profiles persist without creating any client directories', (t) => {
  const f = fixture(t);
  f.run(`
    const store = new Store();
    assert.equal(store.hasVsCode(), false);
    assert.deepEqual(store.clients(), { claude: false, codex: false });
    store.saveProfiles([{ id: 'claude', name: 'Native', env: {} }]);
    store.saveCodexProfiles([{ id: 'codex', name: 'OpenAI', codex: {} }]);
    const reload = new Store();
    assert.equal(reload.profiles()[0].name, 'Native');
    assert.equal(reload.codexProfiles()[0].name, 'OpenAI');
    assert.equal(reload.settingsPath, path.join(require('os').homedir(), '.claude-provider-switcher', 'profiles.json'));
    assert.throws(() => reload.applyToVsCode(reload.profiles()[0]), /unavailable/);
  `);
  for (const dir of ['roaming', 'config', '.claude', '.codex']) assert.equal(fs.existsSync(path.join(f.home, dir)), false);
});

test('Claude-only standalone switching keeps unrelated settings and does not create Codex or editor configs', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.env.CLAUDE_CONFIG_DIR);
  fs.writeFileSync(path.join(f.env.CLAUDE_CONFIG_DIR, 'settings.json'), JSON.stringify({ permissions: { allow: ['Read'] }, env: { OTHER: 'keep' } }));
  f.run(`
    const store = new Store();
    assert.deepEqual(store.clients(), { claude: true, codex: false });
    const p = { id: 'claude', name: 'Gateway', env: { ANTHROPIC_BASE_URL: 'https://example.invalid' } };
    store.saveProfiles([p]); store.setToken(p.id, 'test-key');
  `);
  assert.equal(f.cli('use', 'Gateway').status, 0);
  const cfg = JSON.parse(fs.readFileSync(path.join(f.env.CLAUDE_CONFIG_DIR, 'settings.json')));
  assert.equal(cfg.env.OTHER, 'keep');
  assert.equal(cfg.env.ANTHROPIC_AUTH_TOKEN, 'test-key');
  assert.deepEqual(cfg.permissions, { allow: ['Read'] });
  assert.equal(fs.existsSync(f.env.CODEX_HOME), false);
  assert.equal(fs.existsSync(f.env.APPDATA), false);
  const before = fs.readFileSync(path.join(f.env.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf8');
  assert.equal(f.cli('use', 'Gateway', '--vscode').status, 1);
  assert.equal(fs.readFileSync(path.join(f.env.CLAUDE_CONFIG_DIR, 'settings.json'), 'utf8'), before);
});

test('Codex-only standalone switching and reset preserve the original config and leave Claude absent', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.env.CODEX_HOME);
  const config = path.join(f.env.CODEX_HOME, 'config.toml');
  fs.writeFileSync(config, 'model = "original"\n[projects."/example"]\ntrust_level = "trusted"\n');
  f.run(`
    const store = new Store();
    assert.deepEqual(store.clients(), { claude: false, codex: true });
    store.saveCodexProfiles([{ id: 'codex', name: 'Gateway', key: 'cps-gateway', codex: { base_url: 'https://example.invalid/v1', model: 'test-model' } }]);
    store.setToken('codex', 'test-key');
  `);
  const switched = f.cli('codex', 'use', 'Gateway');
  assert.equal(switched.status, 0, switched.stderr);
  assert.match(fs.readFileSync(config, 'utf8'), /model_provider = "cps-gateway"/);
  assert.match(fs.readFileSync(config, 'utf8'), /trust_level = "trusted"/);
  assert.equal(f.cli('codex', 'default').status, 0);
  assert.match(fs.readFileSync(config, 'utf8'), /model = "original"/);
  assert.equal(fs.existsSync(f.env.CLAUDE_CONFIG_DIR), false);
  assert.equal(fs.existsSync(f.env.APPDATA), false);
});

test('legacy editor integration supports Codex-only profiles; explicit standalone isolates it', (t) => {
  const f = fixture(t);
  f.run(`
    const { userDirFor, findVsCodeSettings } = require('./cli/store');
    const dir = userDirFor('Code'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'settings.json');
    const original = '// keep comment\\n{ "claudeProviderSwitcher.codexProfiles": [{ "id": "a", "name": "Legacy", "codex": {} }] }';
    fs.writeFileSync(file, original);
    assert.equal(findVsCodeSettings(), file);
    const legacy = new Store(); assert.equal(legacy.hasVsCode(), true);
    assert.equal(legacy.codexProfiles()[0].name, 'Legacy');
    const independent = new Store({ standalone: true });
    assert.deepEqual(independent.codexProfiles(), []);
    independent.saveProfiles([{ name: 'Separate', env: {} }]);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    assert.equal(new Store().hasVsCode(), false, 'existing standalone file stays selected');
    assert.equal(new Store({ settingsPath: file }).hasVsCode(), true);
    assert.throws(() => new Store({ standalone: true, settingsPath: file }), /either/);
    legacy.set('language', 'ru');
    assert.match(fs.readFileSync(file, 'utf8'), /keep comment/);
  `);
});

test('visibility overrides and Enter target remain usable without VS Code', (t) => {
  fixture(t).run(`
    const store = new Store();
    store.setPref('codexVisibility', 'show');
    store.setPref('enterTarget', 'both');
    store.reload();
    assert.deepEqual(store.clients(), { claude: false, codex: true });
    assert.equal(store.enterTarget(), 'cli');
    store.saveProfiles([{ name: 'Saved', env: {} }]);
    store.setPref('claudeVisibility', 'hide');
    assert.equal(store.clients().claude, false);
  `);
});

test('main menu exposes only the detected client and Settings can enable missing clients', (t) => {
  for (const agent of ['claude', 'codex', 'none', 'both']) {
    const f = fixture(t);
    for (const client of ['claude', 'codex']) {
      if (agent !== client && agent !== 'both') continue;
      const dir = client === 'claude' ? f.env.CLAUDE_CONFIG_DIR : f.env.CODEX_HOME;
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, client === 'claude' ? 'settings.json' : 'config.toml'), client === 'claude' ? '{}' : '');
    }
    f.run(`
      const tui = require('./cli/tui');
      Object.defineProperty(process.stdin, 'isTTY', { value: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true });
      tui.start = tui.stop = () => {};
      let screens = 0;
      tui.select = async (screen) => {
        const values = screen.items.map((x) => x.value);
        if (screens++ === 0) {
          assert.equal(values.includes('add'), ${agent === 'claude' || agent === 'both'});
          assert.equal(values.includes('addCodex'), ${agent === 'codex' || agent === 'both'});
          assert.equal(screen.header.some((x) => x.includes('VS Code extension:')), false);
          return { index: 0, item: { value: 'settings' } };
        }
        if (screens === 2) {
          assert.ok(values.some((x) => x && x.visibility === 'claude'));
          assert.ok(values.some((x) => x && x.visibility === 'codex'));
          assert.equal(values.some((x) => x && x.pref === 'enterTarget'), false);
        }
        return null;
      };
      require('./cli/main').main([]).then((code) => { assert.equal(code, 0); assert.equal(screens, 3); });
    `);
  }
});

test('client on PATH is detected before any config exists', (t) => {
  const f = fixture(t);
  const dir = path.join(f.home, 'commands'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, process.platform === 'win32' ? 'codex.cmd' : 'codex'), '', { mode: 0o755 });
  f.env.PATH = dir;
  f.run(`assert.deepEqual(new Store().clients(), { claude: false, codex: true });`);
});

test('installer copies a working independent app and can update it without altering profiles', (t) => {
  const f = fixture(t);
  const prefix = path.join(f.home, 'installed app');
  const install = () => spawnSync(process.execPath, [path.join(root, 'cli/install.js'), '--prefix', prefix, '--json'], { env: f.env, encoding: 'utf8' });
  const first = install(); assert.equal(first.status, 0, first.stderr);
  const result = JSON.parse(first.stdout);
  assert.equal(result.prefix, prefix);
  assert.equal(fs.existsSync(result.command), true);
  f.run(`new Store().saveProfiles([{ id: 'keep', name: 'Keep', env: {} }]);`);
  assert.equal(install().status, 0);
  const args = [path.join(prefix, 'bin', 'claude-providers.js'), 'list'];
  const launched = spawnSync(process.execPath, args, { env: f.env, encoding: 'utf8' });
  assert.equal(launched.status, 0, launched.stderr);
  assert.match(launched.stdout, /Keep/);
  // Verify the real OS launcher too, including paths with spaces.
  const shim = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `""${result.command}" --version"`], { env: f.env, encoding: 'utf8', windowsVerbatimArguments: true })
    : spawnSync(result.command, ['--version'], { env: f.env, encoding: 'utf8' });
  assert.equal(shim.status, 0, shim.stderr);
  assert.equal(shim.stdout.trim(), require('../package.json').version);
  assert.equal(fs.existsSync(f.env.CLAUDE_CONFIG_DIR), false);
  assert.equal(fs.existsSync(f.env.CODEX_HOME), false);
});

test('invalid arguments fail without writing settings', (t) => {
  const f = fixture(t);
  for (const args of [['--config'], ['--settings'], ['--standalone', '--settings', 'x']]) {
    const result = f.cli(...args); assert.equal(result.status, 1); assert.ok(result.stderr.trim());
  }
  assert.equal(fs.existsSync(path.join(f.home, '.claude-provider-switcher')), false);
});

test('CLI import command detects extension formats and client-specific commands filter entries', (t) => {
  const f = fixture(t);
  const file = path.join(f.home, 'exported profiles.json');
  fs.writeFileSync(file, JSON.stringify([
    { name: 'Claude Imported', env: { ANTHROPIC_BASE_URL: 'https://example.invalid', ANTHROPIC_AUTH_TOKEN: 'private-key' } },
    { name: 'Codex Imported', codex: { base_url: 'https://example.invalid/v1', model: 'm', models: ['m', 'other'] }, apiKey: 'codex-key' },
  ]));
  const result = f.cli('import', file);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /private-key|codex-key/);
  assert.match(f.cli('list').stdout, /Claude Imported/);
  assert.match(f.cli('codex', 'list').stdout, /Codex Imported/);
  assert.equal(f.cli('claude', 'import', file).status, 0);
  assert.equal(f.cli('codex', 'import', file).status, 0);
  f.run(`const s = new Store(); assert.equal(s.profiles().length, 2); assert.equal(s.codexProfiles().length, 2);`);
  assert.equal(fs.existsSync(f.env.CLAUDE_CONFIG_DIR), false);
  assert.equal(fs.existsSync(f.env.CODEX_HOME), false);
});

test('menu imports after preview confirmation; cancellation keeps storage absent', (t) => {
  for (const confirm of [true, false]) {
    const f = fixture(t);
    const file = path.join(f.home, 'profiles.json');
    fs.writeFileSync(file, JSON.stringify([{ name: 'From Extension', codex: {}, apiKey: 'never-display-this' }]));
    f.run(`
      const tui = require('./cli/tui');
      Object.defineProperty(process.stdin, 'isTTY', { value: true });
      Object.defineProperty(process.stdout, 'isTTY', { value: true });
      tui.start = tui.stop = () => {};
      tui.prompt = async () => ${JSON.stringify(file)};
      let screens = 0;
      tui.select = async (screen) => {
        assert.equal(JSON.stringify(screen).includes('never-display-this'), false);
        if (screens++ === 0) return { index: 0, item: { value: 'import' } };
        if (screens === 2) {
          assert.ok(screen.items.some((p) => p.label.includes('From Extension')));
          return { index: 0, item: { value: ${confirm} } };
        }
        return null;
      };
      require('./cli/main').main([]).then((code) => {
        assert.equal(code, 0);
        const store = new Store();
        assert.equal(store.codexProfiles().length, ${confirm ? 1 : 0});
        assert.equal(fs.existsSync(store.settingsPath), ${confirm});
        assert.equal(fs.existsSync(process.env.CODEX_HOME), false);
      });
    `);
  }
});
