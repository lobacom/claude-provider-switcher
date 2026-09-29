// A minimal, line-preserving TOML editor for Codex's config.toml. It is not a
// full TOML parser: it only knows enough of the syntax (strings, comments,
// multi-line arrays / inline tables) to tell top-level keys from table headers,
// so it can
//  - read / set / remove a key at the top level (before the first table),
//  - replace a block of lines between two marker comments,
//  - list the table headers that appear in the file.
// Everything else in the file — the user's comments, ordering and formatting —
// is left byte for byte. Pure Node (no `vscode`), shared by the extension and
// the terminal app.

// Scan `text` line by line and report, for each line, whether it starts inside a
// value that spans lines (a multi-line string or an open array / inline table).
// Returns { lines, eol, starts[] } where starts[i] = true when line i begins at
// the top of the grammar (a key, a table header, a comment or blank).
function scan(text) {
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const starts = [];
  let mode = null; // null | '"""' | "'''"
  let depth = 0; // open [ / { inside a value
  for (const line of lines) {
    starts.push(mode === null && depth === 0);
    let i = 0;
    // A table header line: `[` at line start while at the top. Its brackets are
    // not value brackets, so skip the whole line (a trailing comment is fine).
    if (mode === null && depth === 0 && /^\s*\[/.test(line)) continue;
    while (i < line.length) {
      if (mode) {
        if (mode === '"""' && line[i] === '\\') { i += 2; continue; }
        if (line.startsWith(mode, i)) {
          // A closing delimiter may be followed by up to two extra quotes that
          // belong to the string (e.g. `""""` ends with a quote in the value).
          let j = i + 3;
          while (j < line.length && line[j] === mode[0] && j < i + 5) j++;
          mode = null;
          i = j;
          continue;
        }
        i++;
        continue;
      }
      const ch = line[i];
      if (ch === '#') break;
      if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
        mode = line.substr(i, 3);
        i += 3;
        continue;
      }
      if (ch === '"') {
        i++;
        while (i < line.length && line[i] !== '"') i += line[i] === '\\' ? 2 : 1;
        i++;
        continue;
      }
      if (ch === "'") {
        const j = line.indexOf("'", i + 1);
        i = j < 0 ? line.length : j + 1;
        continue;
      }
      if (ch === '[' || ch === '{') depth++;
      else if ((ch === ']' || ch === '}') && depth > 0) depth--;
      i++;
    }
  }
  return { lines, eol, starts };
}

// Parse a table header line (`[a.b]`, `[[a]]`, `[ "x.y" . z ]  # c`) into its
// dotted name with quotes resolved, joined by '.', or null for other lines.
function headerName(line) {
  const m = /^\s*(\[\[?)(.*?)(\]\]?)\s*(#.*)?$/.exec(line);
  if (!m) return null;
  const parts = [];
  const re = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([A-Za-z0-9_-]+))\s*(\.|$)/y;
  let s = m[2];
  let pos = 0;
  while (pos < s.length) {
    re.lastIndex = pos;
    const p = re.exec(s);
    if (!p) return m[2].trim();
    if (p[1] !== undefined) {
      try { parts.push(JSON.parse(`"${p[1]}"`)); } catch { parts.push(p[1]); }
    } else {
      parts.push(p[2] !== undefined ? p[2] : p[3]);
    }
    pos = re.lastIndex;
  }
  return parts.join('.');
}

// The top-level key a line defines (`key = …`, `"key" = …`), or null. Dotted
// keys (`a.b = 1`) return the full dotted text.
function keyOfLine(line) {
  const m = /^\s*("(?:[^"\\]|\\.)*"|'[^']*'|[A-Za-z0-9_.\s"'-]+?)\s*=/.exec(line);
  if (!m) return null;
  let k = m[1].trim();
  if (/^"/.test(k)) {
    try { return JSON.parse(k); } catch { return k.slice(1, -1); }
  }
  if (/^'/.test(k)) return k.slice(1, -1);
  return k.replace(/\s*\.\s*/g, '.');
}

// Index of the first table header line, or lines.length when there is none.
function firstTableIndex(sc) {
  for (let i = 0; i < sc.lines.length; i++) {
    if (sc.starts[i] && /^\s*\[/.test(sc.lines[i])) return i;
  }
  return sc.lines.length;
}

// Span [start, end] (inclusive) of the top-level key `key`, or null. A value that
// continues on later lines (multi-line string / array) extends the span to the
// last of those lines.
function topLevelSpan(sc, key) {
  const end = firstTableIndex(sc);
  for (let i = 0; i < end; i++) {
    if (!sc.starts[i] || keyOfLine(sc.lines[i]) !== key) continue;
    let j = i;
    while (j + 1 < sc.lines.length && !sc.starts[j + 1]) j++;
    return [i, j];
  }
  return null;
}

// Parse a single-line TOML string value (basic or literal). Anything else
// (numbers, arrays, multi-line strings) returns undefined.
function parseStringValue(raw) {
  const v = raw.trim().replace(/\s+#.*$/, '');
  if (/^"(?:[^"\\]|\\.)*"$/.test(v)) {
    try { return JSON.parse(v.replace(/\\U([0-9a-fA-F]{8})/g, (_, h) => {
      const cp = parseInt(h, 16);
      return JSON.stringify(String.fromCodePoint(cp)).slice(1, -1);
    })); } catch { return undefined; }
  }
  if (/^'[^']*'$/.test(v)) return v.slice(1, -1);
  return undefined;
}

// The string value of a top-level key; undefined when absent or not a string.
function getTopLevelString(text, key) {
  const sc = scan(text);
  const span = topLevelSpan(sc, key);
  if (!span) return undefined;
  const line = sc.lines[span[0]];
  return parseStringValue(line.slice(line.indexOf('=') + 1));
}

// True when the top level defines `key` (any value type).
function hasTopLevelKey(text, key) {
  return !!topLevelSpan(scan(text), key);
}

// Set a top-level key to an already-serialized TOML value (see tomlString).
// An existing definition is replaced in place (a trailing comment on its line is
// kept); a new one goes next to a related key (`after` / `before`), else right
// before the first table header — never after it, where TOML would read it as a
// key of that table.
function setTopLevel(text, key, valueToml, { after = [], before = [] } = {}) {
  const sc = scan(text);
  const line = `${tomlKey(key)} = ${valueToml}`;
  const span = topLevelSpan(sc, key);
  if (span) {
    const old = sc.lines[span[0]];
    const comment = span[0] === span[1] ? /(\s+#[^"']*)$/.exec(old) : null;
    sc.lines.splice(span[0], span[1] - span[0] + 1, line + (comment ? comment[1] : ''));
    return sc.lines.join(sc.eol);
  }
  // A new key goes next to a related one when present (right after the first of
  // `after`, else right before the first of `before`), so a key that was removed
  // and is put back returns to its old place.
  for (const k of after) {
    const s = topLevelSpan(sc, k);
    if (s) {
      sc.lines.splice(s[1] + 1, 0, line);
      return sc.lines.join(sc.eol);
    }
  }
  for (const k of before) {
    const s = topLevelSpan(sc, k);
    if (s) {
      sc.lines.splice(s[0], 0, line);
      return sc.lines.join(sc.eol);
    }
  }
  const at = firstTableIndex(sc);
  if (at === sc.lines.length) {
    // No tables: append at the end, keeping a single trailing newline.
    const body = sc.lines.slice();
    while (body.length && body[body.length - 1] === '') body.pop();
    body.push(line);
    return body.join(sc.eol) + sc.eol;
  }
  // Right after the last top-level line above the first table (so blank lines
  // separating the top level from the tables stay where they are). With nothing
  // above the table, the key opens the file followed by a blank line.
  let pos = at;
  while (pos > 0 && sc.lines[pos - 1].trim() === '') pos--;
  if (pos > 0) sc.lines.splice(pos, 0, line);
  else sc.lines.splice(0, 0, line, '');
  return sc.lines.join(sc.eol);
}

// Remove a top-level key (all of its lines). No-op when absent.
function removeTopLevel(text, key) {
  const sc = scan(text);
  const span = topLevelSpan(sc, key);
  if (!span) return text;
  sc.lines.splice(span[0], span[1] - span[0] + 1);
  return sc.lines.join(sc.eol);
}

// Find the managed block: the lines from `begin` to `end` markers (inclusive),
// both at the top of the grammar. Returns [start, end] or null.
function blockSpan(sc, begin, end) {
  let s = -1;
  for (let i = 0; i < sc.lines.length; i++) {
    if (!sc.starts[i]) continue;
    const l = sc.lines[i].trim();
    if (s < 0 && l === begin) s = i;
    else if (s >= 0 && l === end) return [s, i];
  }
  return null;
}

// The text between the markers (exclusive), or null when there is no block.
function getBlock(text, begin, end) {
  const sc = scan(text);
  const span = blockSpan(sc, begin, end);
  return span ? sc.lines.slice(span[0] + 1, span[1]).join('\n') : null;
}

// Replace the managed block's body with `body` (lines, without the markers). A
// missing block is appended at the end of the file (after every table — the
// block holds tables of its own). `body === null` removes the block entirely.
function setBlock(text, begin, end, body) {
  const sc = scan(text);
  const span = blockSpan(sc, begin, end);
  const blockLines = body === null ? [] : [begin, ...body.split('\n'), end];
  let lines = sc.lines.slice();
  if (span) {
    lines.splice(span[0], span[1] - span[0] + 1, ...blockLines);
    if (body === null) {
      // Drop the blank line that separated the block from the content above.
      const at = span[0];
      if (at > 0 && lines[at - 1] === '' && (at === lines.length || lines[at] === '')) lines.splice(at - 1, 1);
    }
  } else if (body !== null) {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (lines.length) lines.push('');
    lines.push(...blockLines);
  }
  while (lines.length > 1 && lines[lines.length - 1] === '' && lines[lines.length - 2] === '') lines.pop();
  let out = lines.join(sc.eol);
  if (out && !out.endsWith(sc.eol)) out += sc.eol;
  return out;
}

// Every table header name in the file, with the line it is on. Lines inside the
// managed block (when markers are given) are skipped.
function tableNames(text, begin, end) {
  const sc = scan(text);
  const span = begin ? blockSpan(sc, begin, end) : null;
  const out = [];
  for (let i = 0; i < sc.lines.length; i++) {
    if (span && i >= span[0] && i <= span[1]) continue;
    if (!sc.starts[i] || !/^\s*\[/.test(sc.lines[i])) continue;
    const name = headerName(sc.lines[i]);
    if (name !== null) out.push({ name, line: i });
  }
  return out;
}

// ---- serialization ----------------------------------------------------------------

// A TOML basic string. JSON's escapes are valid TOML; TOML additionally forbids
// a raw DEL (U+007F), which JSON leaves alone.
function tomlString(s) {
  return JSON.stringify(String(s)).replace(/\x7f/g, '\\u007f');
}

// A key: bare when it only uses A-Za-z0-9_-, quoted otherwise.
function tomlKey(k) {
  return /^[A-Za-z0-9_-]+$/.test(k) ? k : tomlString(k);
}

// An inline table of string values: { "X-Header" = "v", … }.
function tomlInlineStrings(obj) {
  const parts = Object.entries(obj).map(([k, v]) => `${tomlKey(k)} = ${tomlString(v)}`);
  return `{ ${parts.join(', ')} }`;
}

module.exports = {
  scan,
  headerName,
  parseStringValue,
  getTopLevelString,
  hasTopLevelKey,
  setTopLevel,
  removeTopLevel,
  getBlock,
  setBlock,
  tableNames,
  tomlString,
  tomlKey,
  tomlInlineStrings,
};
