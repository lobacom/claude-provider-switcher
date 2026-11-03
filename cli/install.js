#!/usr/bin/env node
// User-local, dependency-free installation. No editor or AI client is needed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const source = path.resolve(__dirname, '..');
const quoteSh = (s) => "'" + s.replace(/'/g, "'\\''") + "'";

function defaults() {
  const prefix = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'claude-provider-switcher')
    : path.join(os.homedir(), '.local', 'share', 'claude-provider-switcher');
  return { prefix, binDir: process.platform === 'win32' ? path.join(prefix, 'bin') : path.join(os.homedir(), '.local', 'bin') };
}

function install(options = {}) {
  if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node.js 18+ is required.');
  const locations = defaults();
  const prefix = path.resolve(options.prefix || locations.prefix);
  const binDir = path.resolve(options.binDir || (options.prefix ? path.join(prefix, 'bin') : locations.binDir));
  const within = (file, dir) => file === dir || file.startsWith(dir + path.sep);
  if (within(source, prefix) || ['bin', 'cli', 'src'].some((dir) => within(prefix, path.join(source, dir)))) {
    throw new Error('The install directory must be separate from the source files.');
  }
  // Copy only runtime files, never credentials, git data, dependencies or VSIXs.
  fs.mkdirSync(prefix, { recursive: true });
  for (const name of ['bin', 'cli', 'src', 'package.json', 'providers.json', 'LICENSE', 'README.md']) {
    fs.cpSync(path.join(source, name), path.join(prefix, name), { recursive: true });
  }
  const entry = path.join(prefix, 'bin', 'claude-providers.js');
  const check = spawnSync(process.execPath, [entry, '--version'], { encoding: 'utf8' });
  if (check.status !== 0) throw new Error(`Installed CLI failed its startup check: ${check.stderr || check.error || ''}`);
  fs.mkdirSync(binDir, { recursive: true });
  const command = path.join(binDir, process.platform === 'win32' ? 'claude-providers.cmd' : 'claude-providers');
  const launcher = process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath.replace(/%/g, '%%')}" "${entry.replace(/%/g, '%%')}" %*\r\n`
    : `#!/bin/sh\nexec ${quoteSh(process.execPath)} ${quoteSh(entry)} "$@"\n`;
  fs.writeFileSync(command, launcher, { mode: 0o755 });
  if (process.platform !== 'win32') fs.chmodSync(command, 0o755);
  return { prefix, binDir, command, version: check.stdout.trim() };
}

function main(argv) {
  const options = {};
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node cli/install.js [--prefix <directory>] [--bin-dir <directory>] [--json]\nRequires Node.js 18+. Installs for the current user; leaves all client configs untouched.');
      return;
    }
    if (arg === '--json') { json = true; continue; }
    if (!['--prefix', '--bin-dir'].includes(arg) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Invalid installer option: ${arg}`);
    options[arg === '--prefix' ? 'prefix' : 'binDir'] = argv[++i];
  }
  const result = install(options);
  if (json) console.log(JSON.stringify(result));
  else console.log(`Installed claude-providers ${result.version}\nCommand: ${result.command}\nAdd to PATH if needed: ${result.binDir}\nRun claude-providers to open the arrow-key menu.`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
module.exports = { install, defaults };
