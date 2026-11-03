const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const quotePS = (value) => "'" + value.replace(/'/g, "''") + "'";
const helper = path.resolve(__dirname, '../scripts/node-runtime.ps1');
function powershell(t, code) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-node-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const script = `$ErrorActionPreference = 'Stop'; . ${quotePS(helper)}; $target = ${quotePS(root)}; ${code}`;
  const result = spawnSync(path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'), ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('Windows bootstrap refuses a download whose checksum does not match and cleans temporary files', { skip: process.platform !== 'win32' }, (t) => {
  powershell(t, `
    function Invoke-WebRequest { param($Uri, $OutFile, [switch]$UseBasicParsing)
      if ($Uri -like '*SHASUMS256.txt') { [IO.File]::WriteAllText($OutFile, ('0' * 64) + '  node-v24.0.0-win-x64.zip') }
      else { [IO.File]::WriteAllText($OutFile, 'not a trusted archive') }
    }
    $env:PROCESSOR_ARCHITEW6432 = 'AMD64'
    try { Resolve-ProviderNode -InstallRoot $target -PrivateNode; throw 'Expected checksum rejection' }
    catch { if ($_.Exception.Message -notlike '*SHA-256 verification*') { throw } }
    if (Test-Path -LiteralPath (Join-Path $target 'runtime/node.exe')) { throw 'Rejected Node binary was installed' }
    if (@(Get-ChildItem -LiteralPath (Join-Path $target 'runtime') -Force).Count -ne 0) { throw 'Temporary files were not cleaned' }
  `);
});

test('Windows offline bootstrap reports missing Node without downloading or changing the install directory', { skip: process.platform !== 'win32' }, (t) => {
  powershell(t, `
    function Invoke-WebRequest { throw 'Network must not be used in offline mode' }
    try { Resolve-ProviderNode -InstallRoot $target -PrivateNode -NoNodeDownload; throw 'Expected missing runtime error' }
    catch { if ($_.Exception.Message -notlike '*downloads are disabled*') { throw } }
    if (@(Get-ChildItem -LiteralPath $target -Force).Count -ne 0) { throw 'Offline check created files' }
  `);
});
