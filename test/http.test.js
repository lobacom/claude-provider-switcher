const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { probeModelsList } = require('../src/http');
const codex = require('../src/agents/codex');

// A server that lists models only for requests carrying the profile's header
// and query parameter, and logs every URL it is asked for.
function server() {
  const seen = [];
  const srv = http.createServer((req, res) => {
    seen.push(req.url);
    const ok = req.url.startsWith('/v1/models?') && req.url.includes('api-version=1') && req.headers['api-key'] === 'k';
    res.writeHead(ok ? 200 : 404, { 'content-type': 'application/json' });
    res.end(ok ? JSON.stringify({ data: [{ id: 'm1' }, { id: 'm2' }] }) : '{}');
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, seen, base: `http://127.0.0.1:${srv.address().port}/v1` })));
}

test('Codex model list: <base>/models first, with the profile\'s headers and query params', async () => {
  const { srv, seen, base } = await server();
  try {
    const p = { codex: { base_url: base, http_headers: { 'api-key': 'k' }, query_params: { 'api-version': '1' } } };
    const r = await probeModelsList(base, '', codex.requestExtra(p));
    assert.deepEqual(r.models, ['m1', 'm2']);
    assert.equal(seen[0], '/v1/models?api-version=1');
    // Without them the same endpoint doesn't list anything.
    const bare = await probeModelsList(base, '');
    assert.equal(bare.ok, false);
    assert.equal(bare.reachable, true);
  } finally {
    srv.close();
  }
});
