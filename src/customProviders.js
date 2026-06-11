// Custom providers table (webview). VS Code's Settings UI only offers "Edit in
// settings.json" for an array-of-objects setting, so we ship a small webview that
// renders `customProviders` as an editable table. It reads and writes the exact
// same setting — the table maps one-to-one onto the JSON — so users can manage
// providers either way.

const vscode = require('vscode');
const crypto = require('crypto');
const { t } = require('./i18n');
const { SELF } = require('./constants');

// Keep only the known keys, drop nameless rows, trim strings. This is what gets
// written back to the setting (and read by getCustomPresets).
function sanitizeCustomProviders(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c.name !== 'string' || !c.name.trim()) continue;
    const o = { name: c.name.trim() };
    const str = (v) => (v == null ? '' : String(v).trim());
    if (str(c.baseUrl)) o.baseUrl = str(c.baseUrl);
    if (c.local) o.local = true;
    if (str(c.icon)) o.icon = str(c.icon);
    if (str(c.opusModel)) o.opusModel = str(c.opusModel);
    if (str(c.sonnetModel)) o.sonnetModel = str(c.sonnetModel);
    if (str(c.haikuModel)) o.haikuModel = str(c.haikuModel);
    out.push(o);
  }
  return out;
}

let customProvidersPanel; // singleton WebviewPanel (reused while open)

function manageCustomProviders() {
  if (customProvidersPanel) {
    customProvidersPanel.reveal();
    return;
  }
  const panel = vscode.window.createWebviewPanel(
    `${SELF}.customProvidersTable`,
    t('cp_title'),
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  customProvidersPanel = panel;
  panel.webview.html = customProvidersHtml(panel.webview);

  const post = () =>
    panel.webview.postMessage({
      type: 'load',
      providers: vscode.workspace.getConfiguration(SELF).get('customProviders') || [],
    });

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (!msg) return;
    if (msg.type === 'ready') {
      post();
    } else if (msg.type === 'save') {
      const clean = sanitizeCustomProviders(msg.providers);
      await vscode.workspace
        .getConfiguration(SELF)
        .update('customProviders', clean, vscode.ConfigurationTarget.Global);
      panel.webview.postMessage({ type: 'saved', count: clean.length });
    }
  });

  // Reflect edits made directly in settings.json back into the open table.
  const sub = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(`${SELF}.customProviders`)) post();
  });
  panel.onDidDispose(() => {
    sub.dispose();
    customProvidersPanel = undefined;
  });
}

// Re-render the table (if open) — used when the UI language changes.
function relocalizeCustomProvidersPanel() {
  if (customProvidersPanel) {
    customProvidersPanel.webview.html = customProvidersHtml(customProvidersPanel.webview);
  }
}

function customProvidersHtml(webview) {
  const n = crypto.randomBytes(16).toString('base64');
  const csp =
    `default-src 'none'; style-src 'nonce-${n}'; script-src 'nonce-${n}';`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${n}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
         padding: 12px 16px; font-size: var(--vscode-font-size); }
  h2 { margin: 0 0 4px; }
  .muted { color: var(--vscode-descriptionForeground); }
  p.muted { margin: 0 0 14px; max-width: 70ch; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 6px; vertical-align: middle; }
  th { font-weight: 600; border-bottom: 1px solid var(--vscode-panel-border);
       color: var(--vscode-descriptionForeground); font-size: 0.92em; white-space: nowrap; }
  td.center, th.center { text-align: center; }
  tbody tr:hover { background: var(--vscode-list-hoverBackground); }
  input[type=text] { width: 100%; box-sizing: border-box;
        background: var(--vscode-input-background); color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border, transparent); border-radius: 2px;
        padding: 3px 5px; font-family: inherit; font-size: inherit; }
  input[type=text]:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  input::placeholder { color: var(--vscode-input-placeholderForeground); }
  .actions { margin-top: 14px; display: flex; align-items: center; gap: 8px; }
  button { font-family: inherit; font-size: inherit; cursor: pointer;
        border: none; border-radius: 2px; padding: 5px 12px;
        background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.rm { padding: 2px 8px; background: transparent; color: var(--vscode-descriptionForeground); }
  button.rm:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-foreground); }
  .col-narrow { width: 64px; }
</style>
</head>
<body>
  <h2>${t('cp_heading')}</h2>
  <p class="muted">${t('cp_intro')}</p>
  <table>
    <thead>
      <tr>
        <th>${t('cp_col_name')}</th>
        <th>${t('cp_col_baseUrl')}</th>
        <th class="center col-narrow">${t('cp_col_local')}</th>
        <th>${t('cp_col_icon')}</th>
        <th>${t('cp_col_opus')}</th>
        <th>${t('cp_col_sonnet')}</th>
        <th>${t('cp_col_haiku')}</th>
        <th class="center col-narrow"></th>
      </tr>
    </thead>
    <tbody id="rows"></tbody>
  </table>
  <div class="actions">
    <button id="add">${t('cp_add')}</button>
    <button id="save" class="primary">${t('cp_save')}</button>
    <span id="status" class="muted"></span>
  </div>
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const L = ${JSON.stringify({
    empty: t('cp_empty'),
    saved: t('cp_saved', { count: '{count}' }),
    remove: t('cp_remove'),
  })};
  const tbody = document.getElementById('rows');
  let state = [];

  function txt(row, field, ph) {
    const td = document.createElement('td');
    const i = document.createElement('input');
    i.type = 'text'; i.value = row[field] || ''; i.placeholder = ph || '';
    i.addEventListener('input', (e) => { row[field] = e.target.value; });
    td.appendChild(i); return td;
  }

  function render() {
    tbody.textContent = '';
    if (!state.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8; td.className = 'muted center';
      td.style.padding = '14px';
      td.textContent = L.empty;
      tr.appendChild(td); tbody.appendChild(tr); return;
    }
    state.forEach((row) => {
      const tr = document.createElement('tr');
      tr.appendChild(txt(row, 'name', 'My Gateway'));
      tr.appendChild(txt(row, 'baseUrl', 'https://api.example.com/anthropic'));
      const tdL = document.createElement('td'); tdL.className = 'center';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!row.local;
      cb.addEventListener('change', (e) => { row.local = e.target.checked; });
      tdL.appendChild(cb); tr.appendChild(tdL);
      tr.appendChild(txt(row, 'icon', 'server'));
      tr.appendChild(txt(row, 'opusModel', ''));
      tr.appendChild(txt(row, 'sonnetModel', ''));
      tr.appendChild(txt(row, 'haikuModel', ''));
      const tdR = document.createElement('td'); tdR.className = 'center';
      const b = document.createElement('button'); b.className = 'rm'; b.textContent = '✕'; b.title = L.remove;
      b.addEventListener('click', () => { state.splice(state.indexOf(row), 1); render(); });
      tdR.appendChild(b); tr.appendChild(tdR);
      tbody.appendChild(tr);
    });
  }

  document.getElementById('add').addEventListener('click', () => { state.push({ name: '' }); render(); });
  document.getElementById('save').addEventListener('click', () => {
    vscode.postMessage({ type: 'save', providers: state });
  });

  window.addEventListener('message', (ev) => {
    const m = ev.data || {};
    if (m.type === 'load') {
      state = Array.isArray(m.providers) ? m.providers.map((x) => Object.assign({}, x)) : [];
      render();
    } else if (m.type === 'saved') {
      const s = document.getElementById('status');
      s.textContent = L.saved.replace('{count}', m.count);
      setTimeout(() => { s.textContent = ''; }, 3000);
    }
  });

  vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}

module.exports = { manageCustomProviders, relocalizeCustomProvidersPanel };
