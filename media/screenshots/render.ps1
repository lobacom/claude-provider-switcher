# Re-renders the three screenshots using Edge headless. Run from anywhere.
# Re-creates the HTML mocks in a temp dir, then deletes them. PNGs stay.
$ErrorActionPreference = 'Stop'
$shotDir = $PSScriptRoot
$repoRoot = (Resolve-Path "$shotDir/..").Path
$mockDir = Join-Path $env:TEMP "csp-mocks-$(Get-Random)"
New-Item -ItemType Directory -Force $mockDir | Out-Null

# --- 1. Sidebar panel ---
@'
<!doctype html><html><head><meta charset="utf-8"><style>
  :root { --bg:#1e1e1e; --bg-row-active:#37373d; --border:#3c3c3c; --text:#cccccc; --text-dim:#858585; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);font:13px/1.4 -apple-system,Segoe WPC,Segoe UI,system-ui,sans-serif}
  .header{padding:8px 8px 4px;color:var(--text-dim);text-transform:uppercase;font-size:11px;letter-spacing:.5px;display:flex;align-items:center;justify-content:space-between}
  .row{display:flex;align-items:center;height:22px;padding:0 8px;gap:6px}
  .row .icon{width:16px;height:16px;flex:0 0 16px;display:flex;align-items:center;justify-content:center}
  .row .badge{width:12px;height:12px;flex:0 0 12px;display:flex;align-items:center;justify-content:center;font-size:10px}
  .row .name{flex:0 0 auto}.row .name b{font-weight:600}
  .row .desc{flex:1 1 auto;color:var(--text-dim);font-size:11px;padding-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .row.active{background:var(--bg-row-active)}.row.active .name{color:#fff}
</style></head><body>
<div class="header"><span>Providers</span><span style="color:var(--text-dim)">＋  ⟳</span></div>
<div class="row active"><span class="icon"><svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="7" fill="#0e7c3a"/><polyline points="4,8 7,11 12,5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="name"><b>Claude Subscription</b></span><span class="desc">native subscription</span></div>
'@ | Out-File -FilePath (Join-Path $mockDir '01-sidebar.html') -Encoding utf8
$rows = @(
  @{ b = '🟣'; n = 'DeepSeek';         d = 'https://api.deepseek.com/anthropic' },
  @{ b = '🟠'; n = 'MiniMax';          d = 'https://api.minimax.io/anthropic' },
  @{ b = '🔵'; n = 'LiteLLM';          d = 'https://gateway.example.com' },
  @{ b = '🟤'; n = 'LM Studio';        d = 'http://localhost:1234' },
  @{ b = '🟡'; n = 'Qwen (Alibaba)';   d = 'https://dashscope-intl.aliyuncs.com/…' },
  @{ b = '🟢'; n = 'Kimi (Moonshot)';  d = 'https://api.moonshot.ai/anthropic' },
  @{ b = '🟣'; n = 'Z.ai (GLM)';       d = 'https://api.z.ai/api/anthropic' },
  @{ b = '🔵'; n = 'OpenRouter';       d = 'https://openrouter.ai/api' },
  @{ b = '🟤'; n = 'Ollama';           d = 'http://localhost:11434' }
)
$rowsHtml = ($rows | ForEach-Object {
  '<div class="row"><span class="icon"><svg viewBox="0 0 16 16" width="14" height="14"><circle cx="8" cy="8" r="6" fill="none" stroke="#858585" stroke-width="1"/></svg></span>' +
  "<span class=""badge"">$($_.b)</span><span class=""name"">$($_.n)</span><span class=""desc"">$($_.d)</span></div>"
}) -join "`n"
Add-Content -Path (Join-Path $mockDir '01-sidebar.html') -Value $rowsHtml
'</body></html>' | Out-File -FilePath (Join-Path $mockDir '01-sidebar.html') -Append -Encoding utf8

# --- 2. Add provider picker ---
$presets = @(
  @{ img = 'claude.png';     n = 'Claude Subscription'; d = 'Native Claude Code login — no API key, no Base URL' }
  @{ img = 'claude.png';     n = 'Claude API';          d = 'https://api.anthropic.com — pay-per-token API key' }
  @{ img = 'deepseek.png';   n = 'DeepSeek';            d = 'https://api.deepseek.com/anthropic' }
  @{ img = 'fireworks.png';  n = 'Fireworks AI';        d = 'https://api.fireworks.ai/inference' }
  @{ img = 'moonshot.png';   n = 'Kimi (Moonshot)';     d = 'https://api.moonshot.ai/anthropic' }
  @{ img = 'minimax.png';    n = 'MiniMax';             d = 'https://api.minimax.io/anthropic' }
  @{ img = 'novita.png';     n = 'Novita';              d = 'https://api.novita.ai/anthropic' }
  @{ img = 'openrouter.png'; n = 'OpenRouter';          d = 'https://openrouter.ai/api' }
  @{ img = 'qwen.png';       n = 'Qwen (Alibaba)';      d = 'https://dashscope-intl.aliyuncs.com/apps/anthropic' }
  @{ img = 'zai.png';        n = 'Z.ai (GLM)';          d = 'https://api.z.ai/api/anthropic' }
  @{ img = 'lmstudio.png';   n = 'LM Studio';           d = 'http://localhost:1234' }
  @{ img = 'ollama.png';     n = 'Ollama';              d = 'http://localhost:11434' }
  @{ i = '⊙';               n = 'llama.cpp';           d = 'http://localhost:8080' }
  @{ img = 'vllm.png';       n = 'vLLM';                d = 'http://localhost:8000' }
)
$providerDir = (Resolve-Path "$repoRoot/providers").Path.Replace('\','/')
$pickRows = ($presets | ForEach-Object {
  $iconHtml = if ($_.img) { "<img src='file:///$providerDir/$($_.img)' width='14' height='14' style='border-radius:2px'>" } else { $_.i }
  "<div class=""row""><span class=""icon"">$iconHtml</span><span class=""label"">$($_.n)</span><span class=""desc"">$($_.d)</span></div>"
}) -join "`n"
@"
<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:16px;background:#1e1e1e;color:#cccccc;font:13px/1.4 -apple-system,Segoe WPC,Segoe UI,system-ui,sans-serif}
  .picker{background:#252526;border:1px solid #3c3c3c;border-radius:6px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.45)}
  .input{display:flex;align-items:center;height:28px;padding:0 8px;gap:6px;border-bottom:1px solid #3c3c3c;color:#858585}
  .row{display:flex;align-items:center;height:26px;padding:0 8px;gap:8px}
  .row:hover{background:#2d2d2d}
  .icon{width:16px;height:16px;flex:0 0 16px;display:flex;align-items:center;justify-content:center;font-size:14px}
  .label{white-space:nowrap}.desc{color:#858585;font-size:11px;padding-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sep{padding:4px 8px 2px;color:#858585;text-transform:uppercase;font-size:10px;letter-spacing:.5px;border-top:1px solid #3c3c3c}
  .sep:first-of-type{border-top:0}
</style></head><body><div class="picker">
  <div class="input">⌕ Pick a provider — fields are pre-filled and stay editable (add your API key)</div>
  <div class="row"><span class="icon">✎</span><span class="label">Custom</span><span class="desc">Start blank and fill every field yourself</span></div>
  <div class="sep">Anthropic</div>
  <div class="row"><span class="icon"><img src="file:///$providerDir/claude.png" width="14" height="14" style="border-radius:2px"></span><span class="label">Claude Subscription</span><span class="desc">Native Claude Code login — no API key, no Base URL</span></div>
  <div class="row"><span class="icon"><img src="file:///$providerDir/claude.png" width="14" height="14" style="border-radius:2px"></span><span class="label">Claude API</span><span class="desc">https://api.anthropic.com — pay-per-token API key</span></div>
  <div class="sep">Anthropic-compatible providers</div>
  $pickRows
</div></body></html>
"@ | Out-File -FilePath (Join-Path $mockDir '02-add-provider.html') -Encoding utf8

# --- 3. Tooltip ---
@"
<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}body{margin:0;padding:48px;background:#1e1e1e;color:#cccccc;font:13px/1.5 -apple-system,Segoe WPC,Segoe UI,system-ui,sans-serif}
  .tip{background:#252526;border:1px solid #3c3c3c;border-radius:6px;padding:10px 12px;width:380px;box-shadow:0 6px 18px rgba(0,0,0,.5);display:flex;gap:12px}
  .tip .logo{width:40px;height:40px;flex:0 0 40px}.tip .logo img{width:40px;height:40px;border-radius:4px}
  .tip h4{margin:0 0 4px;color:#fff;font-size:13px;font-weight:600}
  .tip .k{color:#858585}
  .tip .l{margin-top:2px}
</style></head><body>
  <div class="tip">
    <div class="logo"><img src="file:///$providerDir/deepseek.png"></div>
    <div>
      <h4>DeepSeek</h4>
      <div class="l">Hotkey: <span class="k">Ctrl+Alt+4</span></div>
      <div class="l">Base URL: <span class="k">https://api.deepseek.com/anthropic</span></div>
      <div class="l">opus → <span class="k">deepseek-v4-pro</span></div>
      <div class="l">sonnet → <span class="k">deepseek-v4-flash</span></div>
      <div class="l">haiku → <span class="k">deepseek-v4-flash</span></div>
    </div>
  </div>
</body></html>
"@ | Out-File -FilePath (Join-Path $mockDir '03-tooltip.html') -Encoding utf8

# --- render ---
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$sizes = @{
  '01-sidebar.html'      = '360,340'
  '02-add-provider.html' = '560,560'
  '03-tooltip.html'      = '500,200'
}
foreach ($name in $sizes.Keys) {
  $url = "file:///" + (Resolve-Path (Join-Path $mockDir $name)).Path.Replace('\','/')
  $out = Join-Path $shotDir ($name -replace '\.html$','.png')
  Remove-Item $out -ErrorAction SilentlyContinue
  & $edge --headless=new --hide-scrollbars --disable-gpu --no-default-browser-check --no-first-run --window-size=$($sizes[$name]) --screenshot=$out $url 2>&1 | Select-Object -Last 1
  if (Test-Path $out) { "$((Get-Item $out).Name.ToString())  $((Get-Item $out).Length) bytes" } else { "MISSING $out" }
}

Remove-Item -Recurse -Force $mockDir