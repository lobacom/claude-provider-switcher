// A tiny dependency-free terminal UI: full-screen menus driven by the arrow
// keys (no numbered items), a line editor, message boxes and a busy line.
// Everything renders into the alternate screen buffer, so the user's scrollback
// is left untouched when the app exits.

const out = process.stdout;
const input = process.stdin;

const useColor = out.isTTY && !process.env.NO_COLOR;
const sgr = (open, close) => (s) => (useColor ? `\x1b[${open}m${s}\x1b[${close}m` : String(s));
const style = {
  bold: sgr(1, 22),
  dim: sgr(2, 22),
  inverse: sgr(7, 27),
  red: sgr(31, 39),
  green: sgr(32, 39),
  yellow: sgr(33, 39),
  cyan: sgr(36, 39),
};

// ---- text measuring ---------------------------------------------------------
// Terminal cell width of a string: CJK and emoji take two cells. An
// approximation, but good enough to keep rows from wrapping.
const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦⚪⚫⬛⬜\u{1F300}-\u{1FAFF}]/u;
const ANSI = /\x1b\[[0-9;]*m/g;

function charWidth(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0xfe0f || cp === 0x200d || (cp >= 0x300 && cp <= 0x36f)) return 0;
  return WIDE.test(ch) ? 2 : 1;
}
function strWidth(s) {
  let w = 0;
  for (const ch of String(s).replace(ANSI, '')) w += charWidth(ch);
  return w;
}
// Cut plain text to `max` cells, ending with "…" when it was too long.
function truncate(s, max) {
  s = String(s);
  if (strWidth(s) <= max) return s;
  let w = 0;
  let res = '';
  for (const ch of s) {
    const cw = charWidth(ch);
    if (w + cw > max - 1) break;
    res += ch;
    w += cw;
  }
  return res + '…';
}
function cols() {
  return Math.max(20, out.columns || 80);
}
function rows() {
  return Math.max(8, out.rows || 24);
}

// ---- screen lifecycle ---------------------------------------------------------

let started = false;
let redraw = null; // re-renders the current screen (on terminal resize)

function start() {
  if (started) return;
  started = true;
  out.write('\x1b[?1049h\x1b[?25l'); // alternate screen, hide cursor
  input.setRawMode(true);
  input.resume();
  input.setEncoding('utf8');
  input.on('data', onData);
  out.on('resize', onResize);
}
function stop() {
  if (!started) return;
  started = false;
  input.off('data', onData);
  out.off('resize', onResize);
  try { input.setRawMode(false); } catch { /* stdin already closed */ }
  input.pause();
  out.write('\x1b[?25h\x1b[?1049l'); // show cursor, leave alternate screen
}
function onResize() {
  if (redraw) redraw();
}
process.on('exit', stop);

function paint(lines, cursor) {
  let s = '\x1b[H\x1b[2J' + lines.join('\x1b[K\r\n') + '\x1b[K';
  if (cursor) s += `\x1b[${cursor.row + 1};${cursor.col + 1}H\x1b[?25h`;
  else s += '\x1b[?25l';
  out.write(s);
}

// ---- keyboard ---------------------------------------------------------------

const SEQ = {
  '\x1b[A': 'up', '\x1bOA': 'up',
  '\x1b[B': 'down', '\x1bOB': 'down',
  '\x1b[C': 'right', '\x1bOC': 'right',
  '\x1b[D': 'left', '\x1bOD': 'left',
  '\x1b[H': 'home', '\x1bOH': 'home', '\x1b[1~': 'home', '\x1b[7~': 'home',
  '\x1b[F': 'end', '\x1bOF': 'end', '\x1b[4~': 'end', '\x1b[8~': 'end',
  '\x1b[5~': 'pageup', '\x1b[6~': 'pagedown',
  '\x1b[3~': 'delete',
};

function parseKeys(s) {
  const keys = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === '\x1b') {
      const m = /^\x1b(\[[0-9;]*[A-Za-z~]|O[A-Za-z])/.exec(s.slice(i));
      if (m) {
        keys.push({ name: SEQ[m[0]] || 'unknown' });
        i += m[0].length;
      } else {
        keys.push({ name: 'escape' });
        i++;
      }
      continue;
    }
    if (c === '\r' || c === '\n') {
      keys.push({ name: 'enter' });
      i += c === '\r' && s[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (c === '\x7f' || c === '\b') { keys.push({ name: 'backspace' }); i++; continue; }
    if (c === '\x03') { keys.push({ name: 'ctrl-c' }); i++; continue; }
    if (c === '\x15') { keys.push({ name: 'ctrl-u' }); i++; continue; }
    if (c === '\t') { keys.push({ name: 'tab' }); i++; continue; }
    if (c < ' ') { i++; continue; }
    const ch = String.fromCodePoint(s.codePointAt(i));
    keys.push({ name: 'char', ch });
    i += ch.length;
  }
  return keys;
}

let handler = null; // the active screen's key handler

function onData(chunk) {
  for (const key of parseKeys(chunk)) {
    if (key.name === 'ctrl-c') {
      stop();
      process.exit(130);
    }
    if (!handler) break; // nobody listening — drop type-ahead
    handler(key);
  }
}

// Run a screen: `render()` paints it, `onKey(key, done)` handles input and calls
// done(result) to close it. Resolves with that result.
function screen(render, onKey) {
  return new Promise((resolve) => {
    const done = (v) => {
      handler = null;
      redraw = null;
      resolve(v);
    };
    redraw = render;
    handler = (key) => onKey(key, done);
    render();
  });
}

function headerLines(title, header) {
  const w = cols();
  const lines = [];
  if (title) lines.push(style.bold(truncate(title, w)), '');
  for (const h of header || []) lines.push(truncate(h, w));
  if (header && header.length) lines.push('');
  return lines;
}

// ---- select -----------------------------------------------------------------
// items: [{ label, hint, value, separator, disabled }]. Up/Down (or k/j) move,
// Enter picks, Esc/Left/q goes back (resolves null). `keys` maps extra key names
// (e.g. { right: 'actions' }) to an action name returned alongside the item.
// Resolves { item, index, action } or null.
function select({ title, header, items, index = 0, footer, keys = {} }) {
  const selectable = (i) => items[i] && !items[i].separator && !items[i].disabled;
  const step = (from, dir) => {
    for (let n = 1; n <= items.length; n++) {
      const j = (from + dir * n + items.length * n) % items.length;
      if (selectable(j)) return j;
    }
    return from;
  };
  let cur = selectable(index) ? index : step(Math.max(-1, index - 1), 1);
  let top = 0;

  const render = () => {
    const w = cols();
    const lines = headerLines(title, header);
    const foot = footer ? ['', style.dim(truncate(footer, w))] : [];
    const room = Math.max(3, rows() - lines.length - foot.length);
    if (cur < top) top = cur;
    if (cur >= top + room) top = cur - room + 1;
    top = Math.max(0, Math.min(top, Math.max(0, items.length - room)));
    const slice = items.slice(top, top + room);
    slice.forEach((it, k) => {
      const i = top + k;
      if (it.separator) {
        lines.push(style.dim(truncate(it.label ? `  ── ${it.label} ──` : '', w)));
        return;
      }
      const hint = it.hint ? `  ${it.hint}` : '';
      const labelRoom = Math.max(8, w - 2 - Math.min(strWidth(hint), Math.floor(w / 2)));
      const label = truncate(it.label, labelRoom);
      const hintText = truncate(hint, Math.max(0, w - 2 - strWidth(label)));
      if (i === cur) {
        lines.push(style.cyan('❯ ') + style.inverse(style.bold(label)) + style.dim(hintText));
      } else if (it.disabled) {
        lines.push('  ' + style.dim(label + hintText));
      } else {
        lines.push('  ' + label + style.dim(hintText));
      }
    });
    if (items.length > room) {
      const more = [];
      if (top > 0) more.push('↑');
      if (top + room < items.length) more.push('↓');
      if (more.length) lines[lines.length - 1] += style.dim('  ' + more.join(' '));
    }
    paint(lines.concat(foot));
  };

  return screen(render, (key, done) => {
    const name = key.name === 'char' ? { k: 'up', j: 'down', q: 'escape' }[key.ch] || key.ch : key.name;
    if (name === 'up') cur = step(cur, -1);
    else if (name === 'down') cur = step(cur, 1);
    else if (name === 'home') cur = step(-1, 1);
    else if (name === 'end') cur = step(items.length, -1);
    else if (name === 'pageup' || name === 'pagedown') {
      // jump up to 10 rows without wrapping around
      const dir = name === 'pageup' ? -1 : 1;
      for (let n = 0; n < 10; n++) {
        const j = step(cur, dir);
        if ((j - cur) * dir <= 0) break;
        cur = j;
      }
    }
    else if (name === 'enter') return selectable(cur) && done({ item: items[cur], index: cur, action: 'enter' });
    else if (keys[name]) return selectable(cur) && done({ item: items[cur], index: cur, action: keys[name] });
    else if (name === 'escape' || name === 'left' || name === 'backspace') return done(null);
    else return;
    render();
  });
}

// ---- input ------------------------------------------------------------------
// A one-line editor. Enter accepts, Esc cancels (resolves null). `mask` hides
// the text (API keys). `validate(v)` returns an error string to block Enter.
function prompt({ title, header, label, value = '', mask = false, placeholder = '', validate, footer }) {
  let text = String(value);
  let pos = [...text].length;
  let error = '';

  const render = () => {
    const w = cols();
    const lines = headerLines(title, header);
    if (label) lines.push(truncate(label, w));
    const chars = [...text];
    const shown = mask ? '•'.repeat(chars.length) : text;
    const shownChars = [...shown];
    // keep the cursor in view on long values
    const room = w - 3;
    let start = 0;
    while (strWidth(shownChars.slice(start, pos).join('')) > room - 1) start++;
    const visible = truncate(shownChars.slice(start).join(''), room);
    const line = text ? visible : style.dim(truncate(placeholder, room));
    const row = lines.length;
    lines.push(style.cyan('› ') + line);
    if (error) lines.push(style.red(truncate(error, w)));
    if (footer) lines.push('', style.dim(truncate(footer, w)));
    paint(lines, { row, col: 2 + strWidth(shownChars.slice(start, pos).join('')) });
  };

  return screen(render, (key, done) => {
    const chars = [...text];
    if (key.name === 'enter') {
      const err = validate ? validate(text) : '';
      if (err) {
        error = err;
        return render();
      }
      return done(text);
    }
    if (key.name === 'escape') return done(null);
    if (key.name === 'char') {
      chars.splice(pos, 0, key.ch);
      pos++;
    } else if (key.name === 'backspace') {
      if (pos > 0) chars.splice(--pos, 1);
    } else if (key.name === 'delete') {
      chars.splice(pos, 1);
    } else if (key.name === 'left') pos = Math.max(0, pos - 1);
    else if (key.name === 'right') pos = Math.min(chars.length, pos + 1);
    else if (key.name === 'home') pos = 0;
    else if (key.name === 'end') pos = chars.length;
    else if (key.name === 'ctrl-u') {
      chars.length = 0;
      pos = 0;
    } else return;
    text = chars.join('');
    error = '';
    render();
  });
}

// ---- message / busy -----------------------------------------------------------

function message({ title, lines, footer }) {
  const render = () => {
    const w = cols();
    const body = headerLines(title, []);
    const foot = footer ? ['', style.dim(truncate(footer, w))] : [];
    const room = Math.max(1, rows() - body.length - foot.length);
    const shown = lines.length > room ? lines.slice(0, room - 1).concat('…') : lines;
    for (const l of shown) body.push(truncate(l, w));
    body.push(...foot);
    paint(body);
  };
  return screen(render, (key, done) => {
    if (['enter', 'escape', 'left', 'char', 'backspace'].includes(key.name)) done();
  });
}

// Show a "working…" line while `promise` runs.
async function busy(title, text, promise) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let f = 0;
  const render = () => paint(headerLines(title, []).concat(style.cyan(frames[f]) + ' ' + truncate(text, cols() - 2)));
  redraw = render;
  render();
  const timer = setInterval(() => {
    f = (f + 1) % frames.length;
    render();
  }, 80);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
    redraw = null;
  }
}

module.exports = { style, strWidth, truncate, start, stop, select, prompt, message, busy };
