// Strings of the terminal app. Anything not defined here falls back to the
// extension's own table (src/i18n.js) — field labels, colors, test results and
// the Add-provider menu are shared, so both UIs read the same.

const ext = require('../src/i18n');

const STRINGS = {
  en: {
    appTitle: 'Claude Provider Switcher',
    hdr_cli: 'Terminal (claude CLI):  {name}',
    hdr_vscode: 'VS Code extension:      {name}',
    st_default: 'default (no provider env)',
    st_custom: 'custom env (not a saved provider)',
    mark_cli: '● terminal',
    mark_vscode: '● VS Code',
    menu_add: 'Add provider…',
    menu_health: 'Check health of all providers',
    menu_settings: 'Settings…',
    menu_quit: 'Quit',
    footer_main: '↑↓ move · Enter switch {target} · → actions · Esc quit',
    footer_menu: '↑↓ move · Enter select · Esc back',
    footer_input: 'Enter save · Esc cancel · Ctrl+U clear',
    footer_msg: 'Press any key…',
    target_cli: 'terminal',
    target_both: 'terminal + VS Code',
    act_switchCli: 'Switch terminal (claude CLI)',
    act_switchVsCode: 'Switch VS Code extension',
    act_switchBoth: 'Switch both',
    act_edit: 'Edit…',
    act_key: 'API key…',
    act_test: 'Test connection',
    act_duplicate: 'Duplicate',
    act_moveUp: 'Move up',
    act_moveDown: 'Move down',
    act_delete: 'Delete',
    back: 'Back',
    cancel: 'Cancel',
    key_set: 'key set',
    key_fromEnv: 'key taken from the active env',
    key_missing: 'no key',
    switchedCli: '✓ Terminal → {name}. Start a new `claude` session to apply.',
    switchedVsCode: '✓ VS Code extension → {name}. Start a new Claude Code chat (or Reload Window) to apply.',
    switchedBoth: '✓ Terminal and VS Code → {name}. Start a new session to apply.',
    noKeyTitle: 'No API key for "{name}"',
    noKeyLabel: 'Enter the API key (leave empty to switch without one):',
    keyLabel: 'API key for "{name}" (empty removes it):',
    keyNote: 'Stored in {path} (owner-only). VS Code picks it up when "Share API keys with the terminal" is on.',
    keySaved: '✓ API key for "{name}" saved.',
    keyRemoved: '✓ API key for "{name}" removed.',
    deleted: '✓ Deleted "{name}".',
    duplicated: '✓ Duplicated "{name}".',
    added: '✓ Added "{name}".',
    copySuffix: ' copy',
    healthTitle: 'Provider health',
    set_title: 'Settings',
    set_app: 'Terminal app',
    set_ext: 'VS Code extension (written to settings.json)',
    set_files: 'Files',
    set_enterTarget: 'Enter in the provider list switches',
    on: 'on',
    off: 'off',
    numberPrompt: 'Enter a number ≥ {min}',
    file_settings: 'VS Code settings: {path}',
    file_claude: 'claude CLI settings: {path}',
    file_keys: 'API keys: {path}',
    notFound: '(not found)',
    parseError: "Can't read {path}: {msg}",
    parseErrorHint: 'Fix the file, or point the app at another one with --settings <path>.',
    noProfiles: 'No providers yet — add one below.',
    shareHint: 'Tip: enable "Share API keys with the terminal" in Settings so the keys you entered in VS Code work here.',
    error: 'Error: {msg}',
    s_language: 'Language',
    s_switchAction: 'Switch action (VS Code)',
    s_writeClaudeSettings: 'VS Code mirrors its provider into ~/.claude/settings.json',
    s_shareKeysWithTerminal: 'Share API keys with the terminal',
    s_showStatusBarItem: 'Status bar indicator',
    s_showUsageStats: 'Usage statistics in tooltips',
    s_showTokenStats: 'Token statistics in tooltips',
    s_showRestartHint: 'Restart hint after switching',
    s_applyPinnedOnOpen: 'Apply pinned provider on workspace open',
    s_autoFallbackOnApply: 'Auto-fallback when switching',
    s_healthCheck: 'Health check',
    s_healthCheckIntervalMinutes: 'Health check interval (minutes)',
    v_auto: 'auto',
    v_switch: 'switch',
    v_switchAndReload: 'switch & reload window',
    v_manual: 'manual',
    v_periodic: 'periodic',
    usage: `Usage: claude-providers [command] [--settings <path>]

Without a command, opens the interactive menu (arrow keys, Enter, Esc).

Commands:
  list                 List providers and which one is active
  current              Print the provider the claude CLI uses
  use <name|#n>        Switch the claude CLI (~/.claude/settings.json)
      --vscode         …also switch the VS Code extension
  codex list           List Codex providers and which one is active
  codex current        Print the provider Codex uses
  codex use <name|#n>  Switch Codex (~/.codex/config.toml: codex CLI + extension)
  codex default        Give Codex back its own config.toml settings
  help                 Show this help

Options:
  --settings <path>    VS Code settings.json to use (default: auto-detected;
                       env CLAUDE_PROVIDERS_VSCODE_SETTINGS works too)`,
    // Codex
    hdr_codex: 'Codex (config.toml):    {name}',
    codexSep: 'Codex',
    codex_default: 'default (your own config.toml settings)',
    mark_codex: '● Codex',
    menu_addCodex: 'Add Codex provider…',
    menu_codexReset: 'Codex: back to your own settings',
    switchedCodex: '✓ Codex → {name}. Start a new Codex session to apply.',
    codexResetDone: '✓ Codex → your own config.toml settings. Start a new Codex session to apply.',
    act_switchCodex: 'Switch Codex',
    act_model: 'Model…',
    codexNoModel: 'No model — Codex default',
    codexModelSet: '✓ Model for "{name}" → {model}.',
    noCodexProfiles: 'No Codex providers yet.',
    cli_notFound: 'No provider matches "{q}".',
    cli_needTty: 'The interactive menu needs a terminal. Use "claude-providers help" for scriptable commands.',
  },

  ru: {
    appTitle: 'Claude Provider Switcher',
    hdr_cli: 'Терминал (claude CLI):   {name}',
    hdr_vscode: 'Расширение VS Code:      {name}',
    st_default: 'по умолчанию (без env провайдера)',
    st_custom: 'свой env (не сохранённый провайдер)',
    mark_cli: '● терминал',
    mark_vscode: '● VS Code',
    menu_add: 'Добавить провайдера…',
    menu_health: 'Проверить доступность всех провайдеров',
    menu_settings: 'Настройки…',
    menu_quit: 'Выход',
    footer_main: '↑↓ выбор · Enter переключить {target} · → действия · Esc выход',
    footer_menu: '↑↓ выбор · Enter открыть · Esc назад',
    footer_input: 'Enter сохранить · Esc отмена · Ctrl+U очистить',
    footer_msg: 'Нажмите любую клавишу…',
    target_cli: 'терминал',
    target_both: 'терминал + VS Code',
    act_switchCli: 'Переключить терминал (claude CLI)',
    act_switchVsCode: 'Переключить расширение VS Code',
    act_switchBoth: 'Переключить оба',
    act_edit: 'Редактировать…',
    act_key: 'API-ключ…',
    act_test: 'Проверить соединение',
    act_duplicate: 'Дублировать',
    act_moveUp: 'Переместить вверх',
    act_moveDown: 'Переместить вниз',
    act_delete: 'Удалить',
    back: 'Назад',
    cancel: 'Отмена',
    key_set: 'ключ задан',
    key_fromEnv: 'ключ взят из активного env',
    key_missing: 'нет ключа',
    switchedCli: '✓ Терминал → {name}. Запустите новую сессию `claude`, чтобы применить.',
    switchedVsCode: '✓ Расширение VS Code → {name}. Начните новый чат Claude Code (или Reload Window).',
    switchedBoth: '✓ Терминал и VS Code → {name}. Начните новую сессию, чтобы применить.',
    noKeyTitle: 'Нет API-ключа для «{name}»',
    noKeyLabel: 'Введите API-ключ (пусто — переключить без ключа):',
    keyLabel: 'API-ключ для «{name}» (пусто — удалить):',
    keyNote: 'Хранится в {path} (доступ только владельцу). VS Code подхватит его, если включено «Делиться API-ключами с терминалом».',
    keySaved: '✓ API-ключ для «{name}» сохранён.',
    keyRemoved: '✓ API-ключ для «{name}» удалён.',
    deleted: '✓ «{name}» удалён.',
    duplicated: '✓ «{name}» продублирован.',
    added: '✓ «{name}» добавлен.',
    copySuffix: ' копия',
    healthTitle: 'Доступность провайдеров',
    set_title: 'Настройки',
    set_app: 'Терминальное приложение',
    set_ext: 'Расширение VS Code (пишется в settings.json)',
    set_files: 'Файлы',
    set_enterTarget: 'Enter в списке провайдеров переключает',
    on: 'вкл',
    off: 'выкл',
    numberPrompt: 'Введите число ≥ {min}',
    file_settings: 'Настройки VS Code: {path}',
    file_claude: 'Настройки claude CLI: {path}',
    file_keys: 'API-ключи: {path}',
    notFound: '(не найден)',
    parseError: 'Не удалось прочитать {path}: {msg}',
    parseErrorHint: 'Исправьте файл или укажите другой через --settings <путь>.',
    noProfiles: 'Провайдеров пока нет — добавьте ниже.',
    shareHint: 'Совет: включите «Делиться API-ключами с терминалом» в настройках, чтобы здесь работали ключи из VS Code.',
    error: 'Ошибка: {msg}',
    s_language: 'Язык',
    s_switchAction: 'Действие при переключении (VS Code)',
    s_writeClaudeSettings: 'VS Code дублирует провайдера в ~/.claude/settings.json',
    s_shareKeysWithTerminal: 'Делиться API-ключами с терминалом',
    s_showStatusBarItem: 'Индикатор в строке состояния',
    s_showUsageStats: 'Статистика использования в подсказках',
    s_showTokenStats: 'Статистика токенов в подсказках',
    s_showRestartHint: 'Напоминание о перезапуске после переключения',
    s_applyPinnedOnOpen: 'Применять закреплённого провайдера при открытии',
    s_autoFallbackOnApply: 'Автоматический fallback при переключении',
    s_healthCheck: 'Проверка доступности',
    s_healthCheckIntervalMinutes: 'Интервал проверки (минуты)',
    v_auto: 'авто',
    v_switch: 'переключить',
    v_switchAndReload: 'переключить и перезагрузить окно',
    v_manual: 'вручную',
    v_periodic: 'периодически',
    usage: `Использование: claude-providers [команда] [--settings <путь>]

Без команды открывает интерактивное меню (стрелки, Enter, Esc).

Команды:
  list                 Список провайдеров и активный
  current              Провайдер, который использует claude CLI
  use <имя|#n>         Переключить claude CLI (~/.claude/settings.json)
      --vscode         …и заодно расширение VS Code
  codex list           Список провайдеров Codex и активный
  codex current        Провайдер, который использует Codex
  codex use <имя|#n>   Переключить Codex (~/.codex/config.toml: CLI и расширение)
  codex default        Вернуть Codex его собственные настройки config.toml
  help                 Эта справка

Параметры:
  --settings <путь>    settings.json VS Code (по умолчанию ищется сам;
                       также переменная CLAUDE_PROVIDERS_VSCODE_SETTINGS)`,
    // Codex
    hdr_codex: 'Codex (config.toml):     {name}',
    codexSep: 'Codex',
    codex_default: 'по умолчанию (ваши настройки config.toml)',
    mark_codex: '● Codex',
    menu_addCodex: 'Добавить провайдера Codex…',
    menu_codexReset: 'Codex: вернуть ваши настройки',
    switchedCodex: '✓ Codex → {name}. Начните новую сессию Codex, чтобы применить.',
    codexResetDone: '✓ Codex → ваши настройки config.toml. Начните новую сессию Codex, чтобы применить.',
    act_switchCodex: 'Переключить Codex',
    act_model: 'Модель…',
    codexNoModel: 'Без модели — по умолчанию Codex',
    codexModelSet: '✓ Модель для «{name}» → {model}.',
    noCodexProfiles: 'Провайдеров Codex пока нет.',
    cli_notFound: 'Нет провайдера, подходящего под «{q}».',
    cli_needTty: 'Интерактивному меню нужен терминал. Команды для скриптов: «claude-providers help».',
  },

  zh: {
    appTitle: 'Claude Provider Switcher',
    hdr_cli: '终端 (claude CLI)：   {name}',
    hdr_vscode: 'VS Code 扩展：        {name}',
    st_default: '默认（无服务商环境变量）',
    st_custom: '自定义环境变量（不是已保存的服务商）',
    mark_cli: '● 终端',
    mark_vscode: '● VS Code',
    menu_add: '添加服务商…',
    menu_health: '检查所有服务商的可用性',
    menu_settings: '设置…',
    menu_quit: '退出',
    footer_main: '↑↓ 移动 · Enter 切换{target} · → 操作 · Esc 退出',
    footer_menu: '↑↓ 移动 · Enter 选择 · Esc 返回',
    footer_input: 'Enter 保存 · Esc 取消 · Ctrl+U 清空',
    footer_msg: '按任意键…',
    target_cli: '终端',
    target_both: '终端 + VS Code',
    act_switchCli: '切换终端 (claude CLI)',
    act_switchVsCode: '切换 VS Code 扩展',
    act_switchBoth: '两者都切换',
    act_edit: '编辑…',
    act_key: 'API 密钥…',
    act_test: '测试连接',
    act_duplicate: '复制',
    act_moveUp: '上移',
    act_moveDown: '下移',
    act_delete: '删除',
    back: '返回',
    cancel: '取消',
    key_set: '已设置密钥',
    key_fromEnv: '密钥取自当前环境变量',
    key_missing: '无密钥',
    switchedCli: '✓ 终端 → {name}。启动新的 `claude` 会话以生效。',
    switchedVsCode: '✓ VS Code 扩展 → {name}。开始新的 Claude Code 对话（或 Reload Window）以生效。',
    switchedBoth: '✓ 终端和 VS Code → {name}。开始新会话以生效。',
    noKeyTitle: '"{name}" 没有 API 密钥',
    noKeyLabel: '输入 API 密钥（留空则不带密钥切换）：',
    keyLabel: '"{name}" 的 API 密钥（留空即删除）：',
    keyNote: '保存在 {path}（仅所有者可读）。开启"与终端共享 API 密钥"后 VS Code 会读取它。',
    keySaved: '✓ 已保存 "{name}" 的 API 密钥。',
    keyRemoved: '✓ 已删除 "{name}" 的 API 密钥。',
    deleted: '✓ 已删除 "{name}"。',
    duplicated: '✓ 已复制 "{name}"。',
    added: '✓ 已添加 "{name}"。',
    copySuffix: ' 副本',
    healthTitle: '服务商可用性',
    set_title: '设置',
    set_app: '终端应用',
    set_ext: 'VS Code 扩展（写入 settings.json）',
    set_files: '文件',
    set_enterTarget: '在服务商列表中按 Enter 切换',
    on: '开',
    off: '关',
    numberPrompt: '输入一个 ≥ {min} 的数字',
    file_settings: 'VS Code 设置：{path}',
    file_claude: 'claude CLI 设置：{path}',
    file_keys: 'API 密钥：{path}',
    notFound: '（未找到）',
    parseError: '无法读取 {path}：{msg}',
    parseErrorHint: '请修复该文件，或用 --settings <路径> 指定其他文件。',
    noProfiles: '还没有服务商 — 在下方添加。',
    shareHint: '提示：在设置中开启"与终端共享 API 密钥"，即可在这里使用 VS Code 中输入的密钥。',
    error: '错误：{msg}',
    s_language: '语言',
    s_switchAction: '切换动作（VS Code）',
    s_writeClaudeSettings: 'VS Code 同步服务商到 ~/.claude/settings.json',
    s_shareKeysWithTerminal: '与终端共享 API 密钥',
    s_showStatusBarItem: '状态栏指示器',
    s_showUsageStats: '提示中显示使用统计',
    s_showTokenStats: '提示中显示 token 统计',
    s_showRestartHint: '切换后提示重启',
    s_applyPinnedOnOpen: '打开工作区时应用固定的服务商',
    s_autoFallbackOnApply: '切换时自动回退',
    s_healthCheck: '可用性检查',
    s_healthCheckIntervalMinutes: '检查间隔（分钟）',
    v_auto: '自动',
    v_switch: '切换',
    v_switchAndReload: '切换并重新加载窗口',
    v_manual: '手动',
    v_periodic: '定期',
    usage: `用法：claude-providers [命令] [--settings <路径>]

不带命令时打开交互式菜单（方向键、Enter、Esc）。

命令：
  list                 列出服务商及当前激活的服务商
  current              显示 claude CLI 正在使用的服务商
  use <名称|#n>        切换 claude CLI（~/.claude/settings.json）
      --vscode         …同时切换 VS Code 扩展
  codex list           列出 Codex 服务商及当前激活的服务商
  codex current        显示 Codex 正在使用的服务商
  codex use <名称|#n>  切换 Codex（~/.codex/config.toml：CLI 与扩展）
  codex default        恢复 Codex 自己的 config.toml 设置
  help                 显示此帮助

选项：
  --settings <路径>    要使用的 VS Code settings.json（默认自动查找；
                       也可用环境变量 CLAUDE_PROVIDERS_VSCODE_SETTINGS）`,
    // Codex
    hdr_codex: 'Codex (config.toml)： {name}',
    codexSep: 'Codex',
    codex_default: '默认（你自己的 config.toml 设置）',
    mark_codex: '● Codex',
    menu_addCodex: '添加 Codex 服务商…',
    menu_codexReset: 'Codex：恢复你自己的设置',
    switchedCodex: '✓ Codex → {name}。开始新的 Codex 会话以生效。',
    codexResetDone: '✓ Codex → 你自己的 config.toml 设置。开始新的 Codex 会话以生效。',
    act_switchCodex: '切换 Codex',
    act_model: '模型…',
    codexNoModel: '不指定 — 使用 Codex 默认',
    codexModelSet: '✓ "{name}" 的模型 → {model}。',
    noCodexProfiles: '尚无 Codex 服务商。',
    cli_notFound: '没有匹配 "{q}" 的服务商。',
    cli_needTty: '交互式菜单需要终端。可用于脚本的命令见 "claude-providers help"。',
  },
};

let lang = 'en';

function setLang(l) {
  lang = STRINGS[l] ? l : 'en';
  ext.setLang(lang);
}

function t(key, params) {
  const own = (STRINGS[lang] && STRINGS[lang][key]) != null ? STRINGS[lang][key] : STRINGS.en[key];
  let s = own != null ? own : ext.t(key);
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

module.exports = { t, setLang };
