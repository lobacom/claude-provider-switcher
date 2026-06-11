// Shared identifiers and the contract between this extension and Claude Code.

// Our own configuration section / command prefix.
const SELF = 'claudeProviderSwitcher';

// The Claude Code setting the active provider env is written into.
const CLAUDE_SECTION = 'claudeCode';
const CLAUDE_KEY = 'environmentVariables';

// Anthropic's own API endpoint (the "Claude API" template; also recognised when
// matching a Base URL back to a provider logo).
const CLAUDE_API_URL = 'https://api.anthropic.com';

// The env keys this extension owns. When mirroring into ~/.claude/settings.json we
// only ever touch these — any other `env` entries the user keeps in that file are
// left untouched. They mirror the env-bearing entries of the editor's FIELDS.
const MANAGED_ENV_KEYS = [
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'API_TIMEOUT_MS',
];

module.exports = { SELF, CLAUDE_SECTION, CLAUDE_KEY, CLAUDE_API_URL, MANAGED_ENV_KEYS };
