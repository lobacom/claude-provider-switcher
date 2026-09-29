const test = require('node:test');
const assert = require('node:assert/strict');
const toml = require('../src/toml');

const B = '# >>> begin >>>';
const E = '# <<< end <<<';

test('getTopLevelString reads basic and literal strings, ignores tables', () => {
  const text = [
    '# comment',
    'model = "gpt-x" # trailing',
    "profile = 'work'",
    '',
    '[profiles.work]',
    'profile = "not-top-level"',
  ].join('\n');
  assert.equal(toml.getTopLevelString(text, 'model'), 'gpt-x');
  assert.equal(toml.getTopLevelString(text, 'profile'), 'work');
  assert.equal(toml.getTopLevelString('[a]\nprofile = "x"\n', 'profile'), undefined);
});

test('setTopLevel inserts before the first table, never after it', () => {
  const text = 'model = "m"\n\n[tui]\nnotifications = true\n';
  const out = toml.setTopLevel(text, 'profile', '"cps-a"');
  assert.equal(out, 'model = "m"\nprofile = "cps-a"\n\n[tui]\nnotifications = true\n');
  assert.equal(toml.getTopLevelString(out, 'profile'), 'cps-a');
});

test('setTopLevel into a file that starts with a table', () => {
  const out = toml.setTopLevel('[tui]\nx = 1\n', 'profile', '"p"');
  assert.equal(out, 'profile = "p"\n\n[tui]\nx = 1\n');
});

test('setTopLevel into an empty file and a file without tables', () => {
  assert.equal(toml.setTopLevel('', 'profile', '"p"'), 'profile = "p"\n');
  assert.equal(toml.setTopLevel('model = "m"\n\n', 'profile', '"p"'), 'model = "m"\nprofile = "p"\n');
});

test('setTopLevel replaces in place and keeps a trailing comment', () => {
  const text = 'a = 1\nprofile = "old" # mine\nb = 2\n';
  assert.equal(toml.setTopLevel(text, 'profile', '"new"'), 'a = 1\nprofile = "new" # mine\nb = 2\n');
});

test('multi-line arrays and strings do not look like tables or keys', () => {
  const text = [
    'notify = [',
    '  "a",',
    '  ["nested"],',
    ']',
    'instructions = """',
    '[not.a.table]',
    'profile = "inside string"',
    '"""',
    '',
    '[real]',
    'x = 1',
  ].join('\n');
  assert.equal(toml.getTopLevelString(text, 'profile'), undefined);
  assert.deepEqual(toml.tableNames(text).map((t) => t.name), ['real']);
  const out = toml.setTopLevel(text, 'profile', '"p"');
  assert.equal(toml.getTopLevelString(out, 'profile'), 'p');
  assert.ok(out.indexOf('profile = "p"') < out.indexOf('[real]'));
  assert.ok(out.indexOf('profile = "p"') > out.indexOf('"""\n\n') - 1);
});

test('removeTopLevel removes a multi-line value entirely', () => {
  const text = 'a = [\n  1,\n  2,\n]\nb = 1\n';
  assert.equal(toml.removeTopLevel(text, 'a'), 'b = 1\n');
  assert.equal(toml.removeTopLevel(text, 'missing'), text);
});

test('setBlock appends, replaces and removes the managed block', () => {
  const base = 'model = "m"\n\n[tui]\nx = 1\n';
  const added = toml.setBlock(base, B, E, '[profiles.a]\nmodel = "x"');
  assert.equal(added, `${base}\n${B}\n[profiles.a]\nmodel = "x"\n${E}\n`);
  const replaced = toml.setBlock(added, B, E, '[profiles.b]');
  assert.equal(replaced, `${base}\n${B}\n[profiles.b]\n${E}\n`);
  assert.equal(toml.getBlock(replaced, B, E), '[profiles.b]');
  assert.equal(toml.setBlock(replaced, B, E, null), base);
});

test('setBlock keeps content that follows the block', () => {
  const text = `a = 1\n\n${B}\n[profiles.a]\n${E}\n\n[user]\ny = 2\n`;
  const out = toml.setBlock(text, B, E, '[profiles.z]');
  assert.equal(out, `a = 1\n\n${B}\n[profiles.z]\n${E}\n\n[user]\ny = 2\n`);
});

test('CRLF files stay CRLF', () => {
  const text = 'a = 1\r\n\r\n[t]\r\nx = 1\r\n';
  const out = toml.setTopLevel(text, 'profile', '"p"');
  assert.equal(out, 'a = 1\r\nprofile = "p"\r\n\r\n[t]\r\nx = 1\r\n');
  const withBlock = toml.setBlock(out, B, E, '[profiles.p]');
  assert.ok(!/[^\r]\n/.test(withBlock), 'no bare LF');
});

test('tableNames resolves quoted and dotted headers and skips the block', () => {
  const text = `[ "model_providers" . 'cps-a' ]\n[[arr]]\n${B}\n[profiles.cps-a]\n${E}\n`;
  assert.deepEqual(toml.tableNames(text, B, E).map((t) => t.name), ['model_providers.cps-a', 'arr']);
});

test('tomlString escapes quotes, backslashes, control chars and DEL', () => {
  assert.equal(toml.tomlString('a"b\\c\n\x7f'), '"a\\"b\\\\c\\n\\u007f"');
  assert.equal(toml.parseStringValue(toml.tomlString('ключ "x"\t')), 'ключ "x"\t');
  assert.equal(toml.tomlKey('X-Api-Key'), 'X-Api-Key');
  assert.equal(toml.tomlKey('a.b'), '"a.b"');
});
