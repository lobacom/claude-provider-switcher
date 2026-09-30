const test = require('node:test');
const assert = require('node:assert/strict');
const { hostOf, sameHostKeys, maskKey } = require('../src/keyMatch');

test('hostOf keeps the port, drops case and www', () => {
  assert.equal(hostOf('https://API.MiniMax.io/anthropic'), 'api.minimax.io');
  assert.equal(hostOf('http://localhost:11434/v1'), 'localhost:11434');
  assert.equal(hostOf('https://www.example.com'), 'example.com');
  assert.equal(hostOf(''), '');
  assert.equal(hostOf('not a url'), '');
});

test('sameHostKeys: same host only, set keys only, no duplicates, not the current key', () => {
  const others = [
    { profile: 'claude-mm', url: 'https://api.minimax.io/anthropic', token: 'sk-cp-1' },
    { profile: 'claude-mm-copy', url: 'https://api.minimax.io/anthropic', token: 'sk-cp-1' },
    { profile: 'claude-mm-2', url: 'https://api.minimax.io/anthropic', token: 'sk-cp-2' },
    { profile: 'claude-cn', url: 'https://api.minimaxi.com/anthropic', token: 'sk-cn' },
    { profile: 'claude-nokey', url: 'https://api.minimax.io/anthropic', token: '' },
    { profile: 'native', url: undefined, token: 'x' },
  ];
  assert.deepEqual(sameHostKeys('https://api.minimax.io/v1', others), [
    { profile: 'claude-mm', token: 'sk-cp-1' },
    { profile: 'claude-mm-2', token: 'sk-cp-2' },
  ]);
  assert.deepEqual(sameHostKeys('https://api.minimax.io/v1', others, 'sk-cp-1').map((c) => c.profile), ['claude-mm-2']);
  assert.deepEqual(sameHostKeys('http://localhost:1234/v1', [{ profile: 'o', url: 'http://localhost:11434', token: 'k' }]), []);
  assert.deepEqual(sameHostKeys(undefined, others), []);
});

test('maskKey shows only the ends of a long key', () => {
  assert.equal(maskKey('sk-cp-abcdefghijklmnop1234'), 'sk-cp-…1234');
  assert.equal(maskKey('short'), '••••');
});
