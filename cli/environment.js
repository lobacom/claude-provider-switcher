// Detect clients without launching them (or requiring either of them).
const fs = require('fs');
const os = require('os');
const path = require('path');

function hasCommand(name) {
  const extensions = process.platform === 'win32'
    ? ['', ...(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';')]
    : [''];
  return (process.env.PATH || '').split(path.delimiter).filter(Boolean).some((dir) =>
    extensions.some((ext) => {
      const file = path.join(dir.replace(/^"|"$/g, ''), name + ext);
      try {
        if (!fs.statSync(file).isFile()) return false;
        fs.accessSync(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK);
        return true;
      } catch { return false; }
    }));
}

function detectClients() {
  return {
    claude: hasCommand('claude') || fs.existsSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'settings.json')),
    codex: hasCommand('codex') || fs.existsSync(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'config.toml')),
  };
}

module.exports = { detectClients, hasCommand };
