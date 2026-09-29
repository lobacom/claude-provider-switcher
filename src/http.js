// Network probes against a provider's endpoint. Two kinds:
//  - model-list fetch (GET /v1/models & friends) — a metadata call that runs NO
//    inference, so it costs zero tokens; used for the model dropdown and the
//    health indicator;
//  - message probe (POST /v1/messages with max_tokens: 1) — proves the endpoint
//    AND the key work; used by "Test connection" and the fallback chain.

function normalizeUrl(u) {
  return (u || '').trim().replace(/\/+$/, '');
}

// ---- model listing ---------------------------------------------------------
// Fetch the model catalog so the user can pick an id instead of typing it.
// The catch: a provider's Anthropic Base URL often carries a path (e.g.
// `https://api.deepseek.com/anthropic`) that routes /v1/messages, but the model
// list lives elsewhere — usually off the host root (`/v1/models` or `/models`).
// So we try several candidate URLs and use the first that returns a list.
// Responses come as { data: [{ id }] }, { models: [...] }, a bare array, or
// string ids — we accept all of those shapes.

// Some gateways serve the Anthropic API and the model catalog on different paths,
// so neither `<base>/v1/models` nor the host root finds the list. Worse, a few
// (Z.ai, Zhipu) answer `<base>/v1/models` with HTTP 200 and an auth-error body,
// which masquerades as a reachable-but-empty catalog. Map each known Anthropic
// base to the real catalog endpoint we should probe in addition. `$1` is the host.
const CATALOG_OVERRIDES = [
  [/^(https?:\/\/[^/]+)\/api\/anthropic$/, '$1/api/paas/v4/models'],        // GLM family: Z.ai, Zhipu
  [/^(https?:\/\/[^/]+)\/apps\/anthropic$/, '$1/compatible-mode/v1/models'], // DashScope (Alibaba)
  [/^(https?:\/\/api\.novita\.ai)\/anthropic$/, '$1/v3/openai/models'],      // Novita
];

// Candidate model-list URLs for a Base URL, most-specific first.
function modelListCandidates(baseUrl) {
  const n = normalizeUrl(baseUrl);
  const out = [n + '/v1/models', n + '/models'];
  for (const [re, repl] of CATALOG_OVERRIDES) {
    if (re.test(n)) { out.push(n.replace(re, repl)); break; }
  }
  try {
    const u = new (require('url').URL)(n);
    const root = `${u.protocol}//${u.host}`;
    if (root !== n) out.push(root + '/v1/models', root + '/models'); // strip the path
  } catch { /* invalid URL — handled by the caller */ }
  return [...new Set(out)];
}

// GET one model-list URL. Resolves { status, models } — status 0 means the host
// didn't answer (DNS/connection/timeout); models is null unless we parsed a 2xx
// body into a non-empty-capable list.
function fetchModelsAt(modelsUrl, token, extra = {}) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new (require('url').URL)(modelsUrl);
      for (const [k, v] of Object.entries(extra.query || {})) url.searchParams.set(k, v);
    } catch {
      resolve({ status: 0, models: null });
      return;
    }
    const lib = url.protocol === 'http:' ? require('http') : require('https');
    const headers = { ...(extra.headers || {}), 'anthropic-version': '2023-06-01', accept: 'application/json' };
    if (token) {
      headers['x-api-key'] = token;
      headers['authorization'] = `Bearer ${token}`;
    }
    const req = lib.request(url, { method: 'GET', headers, timeout: 8000 }, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        const s = res.statusCode;
        let models = null;
        if (s >= 200 && s < 300) {
          try {
            const j = JSON.parse(raw);
            const arr = Array.isArray(j) ? j
              : Array.isArray(j.data) ? j.data
              : Array.isArray(j.models) ? j.models
              : [];
            models = arr
              .map((m) => (typeof m === 'string' ? m : (m && (m.id || m.name))))
              .filter(Boolean);
          } catch { /* leave models null — counts as a reachable non-list reply */ }
        }
        resolve({ status: s, models });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, models: null }); });
    req.on('error', () => resolve({ status: 0, models: null }));
    req.end();
  });
}

// Try every candidate; return the first model list found. On failure, report
// whether the host was reachable at all and whether auth was rejected, so
// callers can give a useful message / health verdict. `extra` (Codex profiles):
// { headers, query } sent with every request, and `openai: true` for an
// OpenAI-style Base URL that already ends in /v1 — its list is <base>/models.
async function probeModelsList(baseUrl, token, extra = {}) {
  let reachable = false;
  let auth = false;
  let serverError = false;
  const candidates = modelListCandidates(baseUrl);
  if (extra.openai) candidates.unshift(normalizeUrl(baseUrl) + '/models');
  for (const u of new Set(candidates)) {
    const r = await fetchModelsAt(u, token, extra);
    if (r.status === 0) continue; // host didn't answer at this URL
    reachable = true;
    if (r.models && r.models.length) return { ok: true, models: r.models, reachable: true };
    if (r.status === 401 || r.status === 403) auth = true;
    if (r.status >= 500) serverError = true;
  }
  return { ok: false, models: [], reachable, auth, serverError };
}

// ---- message probe ---------------------------------------------------------
// Fire a single small POST /v1/messages and classify the response. We don't care
// about the body — any HTTP reply means the host is reachable; the status code
// tells us whether auth worked. A 400 (e.g. unknown model) still proves the
// endpoint and key are fine, which is all we want to confirm here.

function httpProbe(baseUrl, token, model) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new (require('url').URL)(normalizeUrl(baseUrl) + '/v1/messages');
    } catch {
      resolve({ kind: 'error', msg: 'Invalid Base URL' });
      return;
    }
    const lib = url.protocol === 'http:' ? require('http') : require('https');
    const body = JSON.stringify({
      model: model || 'claude-3-5-haiku-latest',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });
    const headers = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'content-length': Buffer.byteLength(body),
    };
    if (token) {
      // Anthropic uses x-api-key; many gateways accept a Bearer token. Send both.
      headers['x-api-key'] = token;
      headers['authorization'] = `Bearer ${token}`;
    }
    const req = lib.request(url, { method: 'POST', headers, timeout: 12000 }, (res) => {
      res.on('data', () => {}); // drain so the socket can close
      res.on('end', () => resolve({ kind: 'status', status: res.statusCode }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ kind: 'error', msg: 'Timed out after 12s' }); });
    req.on('error', (e) => resolve({ kind: 'error', msg: e.message }));
    req.write(body);
    req.end();
  });
}

// ---- Responses API probe (Codex) ---------------------------------------------
// Codex speaks the OpenAI Responses API, so its "Test connection" fires one small
// POST <base_url>/responses (base_url already ends in /v1). Same result shape as
// httpProbe: any HTTP reply proves the host; the status tells us about the key.
// `extra` carries the profile's http_headers / query_params.

function httpProbeResponses(baseUrl, token, model, extra = {}) {
  return new Promise((resolve) => {
    let url;
    try {
      url = new (require('url').URL)(normalizeUrl(baseUrl) + '/responses');
      for (const [k, v] of Object.entries(extra.query || {})) url.searchParams.set(k, v);
    } catch {
      resolve({ kind: 'error', msg: 'Invalid Base URL' });
      return;
    }
    const lib = url.protocol === 'http:' ? require('http') : require('https');
    const body = JSON.stringify({
      model: model || 'gpt-5-mini',
      input: 'ping',
      max_output_tokens: 16,
    });
    const headers = {
      ...(extra.headers || {}),
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
    };
    if (token) headers['authorization'] = `Bearer ${token}`;
    const req = lib.request(url, { method: 'POST', headers, timeout: 20000 }, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve({ kind: 'status', status: res.statusCode }));
    });
    req.on('timeout', () => { req.destroy(); resolve({ kind: 'error', msg: 'Timed out after 20s' }); });
    req.on('error', (e) => resolve({ kind: 'error', msg: e.message }));
    req.write(body);
    req.end();
  });
}

// "Healthy" for fallback purposes = HTTP 200 or 400 (endpoint + key work; a 400
// like "unknown model" still proves the route is good).
function probeHealthy(r) {
  if (!r || r.kind === 'error') return false;
  return r.status === 200 || r.status === 400;
}

module.exports = { normalizeUrl, probeModelsList, httpProbe, httpProbeResponses, probeHealthy };
