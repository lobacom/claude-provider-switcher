// Minimal JSONC support for VS Code's settings.json: parse with comments and
// trailing commas, and replace/insert one top-level property surgically — the
// rest of the file (comments, ordering, formatting) stays byte-for-byte intact.

function skipString(text, i) {
  // text[i] === '"'
  for (let j = i + 1; j < text.length; j++) {
    if (text[j] === '\\') j++;
    else if (text[j] === '"') return j + 1;
  }
  throw new Error('unterminated string');
}

function skipTrivia(text, i) {
  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '﻿') i++;
    else if (c === '/' && text[i + 1] === '/') {
      const e = text.indexOf('\n', i);
      i = e < 0 ? text.length : e + 1;
    } else if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      if (e < 0) throw new Error('unterminated comment');
      i = e + 2;
    } else break;
  }
  return i;
}

// Index just past the value starting at text[i].
function skipValue(text, i) {
  const c = text[i];
  if (c === '"') return skipString(text, i);
  if (c === '{' || c === '[') {
    let depth = 0;
    for (let j = i; j < text.length;) {
      j = skipTrivia(text, j);
      const d = text[j];
      if (d === '"') {
        j = skipString(text, j);
        continue;
      }
      if (d === '{' || d === '[') depth++;
      else if (d === '}' || d === ']') {
        depth--;
        if (depth === 0) return j + 1;
      }
      j++;
    }
    throw new Error('unterminated ' + (c === '{' ? 'object' : 'array'));
  }
  let j = i;
  while (j < text.length && !/[\s,}\]/]/.test(text[j])) j++;
  if (j === i) throw new Error(`unexpected "${c}" at ${i}`);
  return j;
}

// Locate the top-level object's members: [{ key, keyStart, valueStart, valueEnd }].
function scan(text) {
  let i = skipTrivia(text, 0);
  if (text[i] !== '{') throw new Error('settings.json is not a JSON object');
  const open = i;
  i++;
  const members = [];
  for (;;) {
    i = skipTrivia(text, i);
    if (i >= text.length) throw new Error('unterminated object');
    if (text[i] === '}') return { open, close: i, members };
    if (text[i] !== '"') throw new Error(`unexpected "${text[i]}" at ${i}`);
    const keyEnd = skipString(text, i);
    const key = JSON.parse(text.slice(i, keyEnd));
    const keyStart = i;
    i = skipTrivia(text, keyEnd);
    if (text[i] !== ':') throw new Error(`expected ":" at ${i}`);
    i = skipTrivia(text, i + 1);
    const valueStart = i;
    const valueEnd = skipValue(text, i);
    members.push({ key, keyStart, valueStart, valueEnd });
    i = skipTrivia(text, valueEnd);
    if (text[i] === ',') i++;
  }
}

// Parse JSONC: blank out comments and trailing commas, then JSON.parse.
function parse(text) {
  if (!text || !text.trim()) return {};
  let res = '';
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === '"') {
      const e = skipString(text, i);
      res += text.slice(i, e);
      i = e;
    } else if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
      i = skipTrivia(text, i);
      res += ' ';
    } else if (c === ',') {
      const n = skipTrivia(text, i + 1);
      if (text[n] !== '}' && text[n] !== ']') res += ',';
      i++;
    } else {
      res += c;
      i++;
    }
  }
  return JSON.parse(res.replace(/^﻿/, ''));
}

// Whitespace in front of position `pos` on its line.
function lineIndent(text, pos) {
  const ls = text.lastIndexOf('\n', pos - 1) + 1;
  const m = /^[ \t]*/.exec(text.slice(ls, pos));
  return m ? m[0] : '';
}

// Return `text` with top-level property `key` set to `value` (inserted at the
// end when missing). The value is serialized with the file's own indentation.
function setProperty(text, key, value) {
  if (!text || !text.trim()) text = '{\n}\n';
  const s = scan(text);
  const indent = s.members.length ? lineIndent(text, s.members[0].keyStart) || '\t' : '\t';
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const serialized = JSON.stringify(value, null, indent).split('\n').join(nl + indent);

  // JSON semantics: the last duplicate wins, so that's the one to replace.
  const hit = s.members.filter((m) => m.key === key).pop();
  if (hit) return text.slice(0, hit.valueStart) + serialized + text.slice(hit.valueEnd);

  const member = `${indent}${JSON.stringify(key)}: ${serialized}`;
  if (!s.members.length) {
    const inner = text.slice(s.open + 1, s.close);
    const tail = inner.includes('\n') ? '' : nl;
    return text.slice(0, s.open + 1) + nl + member + tail + text.slice(s.open + 1);
  }
  const last = s.members[s.members.length - 1];
  const after = skipTrivia(text, last.valueEnd);
  if (text[after] === ',') {
    // a trailing comma is already there — add the member right after it
    return text.slice(0, after + 1) + nl + member + text.slice(after + 1);
  }
  return text.slice(0, last.valueEnd) + ',' + nl + member + text.slice(last.valueEnd);
}

module.exports = { parse, setProperty };
