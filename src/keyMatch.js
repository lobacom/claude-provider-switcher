// Pure helpers for keyReuse.js (no VS Code API, so they are unit-tested).

// The host (with port) a Base URL points at, lowercased; '' when unparsable.
function hostOf(url) {
  try {
    return new URL(String(url || '').trim()).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

// From `others` ([{ profile, url, token }]), the ones whose URL has the same
// host as `url` and whose key is set and differs from `current` — one per
// distinct key, in order. Returns [{ profile, token }].
function sameHostKeys(url, others, current = '') {
  const host = hostOf(url);
  if (!host) return [];
  const seen = new Set([current]);
  const out = [];
  for (const o of others) {
    if (!o.token || seen.has(o.token) || hostOf(o.url) !== host) continue;
    seen.add(o.token);
    out.push({ profile: o.profile, token: o.token });
  }
  return out;
}

// A key shown in a menu: its start and end only.
function maskKey(k) {
  return k.length > 12 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '••••';
}

module.exports = { hostOf, sameHostKeys, maskKey };
