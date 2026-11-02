# Передача Claude: выпустить обновление с Alibaba Token Plan

## Задача и разрешение пользователя

Продолжи работу в `C:\Users\alex\claude-provider-switcher` и выпусти обновление расширения **Claude Provider Switcher** (`AlekseiLobanov.claude-provider-switcher`) в VS Code Marketplace и GitHub Releases. Пользователь прямо поручил push и выпуск обновления. Доведи проверку, коммит, push, тег и проверку публикации до результата; повторно спрашивать об общем разрешении на выпуск не нужно. При реальном блокере сообщи конкретную причину.

Репозиторий: `https://github.com/lobacom/claude-provider-switcher.git`.

На момент передачи текущая ветка — **`codex-switcher`**, версия в `package.json` — **`1.0.0`**. Изменения ещё не закоммичены и не опубликованы. Перед работой перечитай актуальные AGENTS.md и проверь git status, remotes, удалённые ветки, теги и последнюю опубликованную версию. Не предполагай, что рабочая ветка является основной веткой выпуска. Сохрани чужие изменения, которые могли появиться после передачи.

## Причина изменения

Существующий шаблон **Qwen (Alibaba)** предназначен для обычного Model Studio с оплатой по запросам в Singapore. Этот адрес действующий; он не является ошибочным или отключённым. Пользователь использует **Token Plan**, для которого нужны отдельные адрес и ключ. В журнале Claude Code был `403 invalid api-key`.

Ключи обычного Model Studio, Token Plan и Coding Plan нельзя смешивать. Token Plan и Coding Plan используют отдельные ключи `sk-sp-…`; один префикс не позволяет отличить эти два тарифа. API-ключи не добавлять в репозиторий, логи, release notes или сообщения.

## Что уже изменено в коде

### `providers.json`

Старый шаблон **Qwen (Alibaba)** полностью сохранён: имя, значок, URL `https://dashscope-intl.aliyuncs.com/apps/anthropic` и модели `qwen3.8-max` / `qwen3.7-plus` / `qwen3.7-flash`.

Добавлены два самостоятельных шаблона Claude Code:

- **Qwen (Alibaba Token Plan)**: `https://token-plan.ap-southeast-1.maas.aliyuncs.com/apps/anthropic`; `ANTHROPIC_MODEL=auto`; Opus/Sonnet/Haiku = `qwen3.8-max` / `qwen3.8-flash` / `qwen3.6-flash`; `CLAUDE_CODE_SUBAGENT_MODEL=auto`; `CLAUDE_CODE_MAX_CONTEXT_TOKENS=983616`.
- **Qwen (Alibaba Coding Plan)**: `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic`; основная модель, все три уровня и модель subagent = `qwen3.7-plus`.

В раздел Codex добавлен **Qwen (Alibaba Token Plan)**: `base_url=https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`, модель `qwen3.8-max`, reasoning effort `medium`. Можно выбрать другую Responses-совместимую модель тарифа, включая `glm-5.3`.

**Coding Plan в Codex не добавлен:** он не поддерживает Responses API, а текущий Codex работает только через Responses. Не подменять это `wire_api=chat` и не делать downgrade Codex.

### `src/agents/codex.js`

В `catalogEntryFor()` для точного хоста Token Plan и пути `/compatible-mode/v1` отключаются `supports_parallel_tool_calls` и `supports_reasoning_summaries`, согласно метаданным Alibaba. Поведение остальных провайдеров сохранено.

### `test/modelCatalog.test.js`

Добавлена проверка прохождения шаблона Token Plan через генерацию конфигурации и каталога Codex: URL, `wire_api=responses`, модель, reasoning effort, ограничения возможностей и смена модели на `glm-5.3`. Codex CLI в этом тесте подменён; это не сетевой smoke test.

### `README.md`, `CHANGELOG.md`

Добавлены пояснения по тарифам и Codex в английскую и русскую части README. В CHANGELOG добавлен раздел **Unreleased** для этого обновления.

Ни один ранее существовавший шаблон Claude или Codex не изменён — проверено сравнением с HEAD. Автоматической миграции пользовательских профилей нет. Установка обновления не должна переписывать существующие подключения.

## Локальная настройка пользователя — не часть релиза

Отдельно исправлен только личный профиль пользователя в настройках VS Code: переименован в **Qwen (Alibaba Token Plan)**, указан адрес и параметры Token Plan. Его пользовательская модель Fable **`glm-5.3` сохранена** — это допустимая модель тарифа, выбранная пользователем.

Пользователь сам заменил ключ на ключ Token Plan. В интерфейсе расширения наблюдался результат **connected (HTTP 200)**, затем пользователь подтвердил, что Claude Code работает. Эти личные настройки и ключи не включать в коммит. Активный провайдер во время проверки был MiniMax; текущее состояние могло измениться.

## Уже выполненные проверки и пределы результата

- Последний полный прогон: **43 теста, 43 passed** — `node --test --test-concurrency=1 'test/*.test.js'`.
- `git diff --check` прошёл.
- JSON каталога читается; все прежние шаблоны полностью совпадают с HEAD, добавлены только новые.
- Один параллельный прогон встретил Windows `EPERM` при rename временного `config.toml`; последовательный прогон прошёл. В песочнице также блокировался локальный HTTP-тест; успешный прогон выполнен вне песочницы.
- **Настоящий запрос через Codex с Token Plan ещё не выполнен.** Не утверждать обратного в релизе. Поддержка endpoint сверена с документацией Alibaba.
- VSIX для этих изменений пока не собирался и не устанавливался; Marketplace не обновлялся.

## Источники

- Claude Code: https://docs.modelstudio.console.alibabacloud.com/en/model-studio/claude-code
- Codex, включая Token Plan Responses и ограничения Coding Plan: https://docs.modelstudio.console.alibabacloud.com/en/model-studio/codex
- Token Plan и отдельные ключи: https://docs.modelstudio.console.alibabacloud.com/en/model-studio/token-plan-personal-quick-start
- Модели Token Plan: https://docs.modelstudio.console.alibabacloud.com/en/model-studio/token-plan-personal-overview
- Конфигурация Codex: https://learn.chatgpt.com/docs/config-file/config-reference

## Порядок завершения и выпуска

1. Проверь актуальное состояние репозитория и release workflow. Просмотри diff пяти изменённых файлов выше. Получи актуальные удалённые refs и выбери следующую свободную patch-версию; ожидается **1.0.1**, если после 1.0.0 ещё не было выпуска. Не используй номер из старого `docs/codex-release-checklist.md`: там исторический план выпуска 0.10.0.
2. Проверь совместимость: старый Qwen и все прочие шаблоны должны остаться без изменений; новые тарифы добавляются отдельно. Проверь, что и VS Code, и терминальное приложение получают новые пункты из общего каталога. Ключ Token Plan должен предлагаться к повторному использованию между Claude и Codex для того же хоста; существующий механизм same-host уже это делает.
3. Повтори тесты и `git diff --check`. При Windows EPERM используй последовательный запуск, не меняй прикладной код ради случайной блокировки временного файла.
4. Проверь настоящий Codex с Token Plan коротким запросом в изолированной конфигурации, используя сохранённый ключ через штатный механизм. Не переключай без необходимости активную конфигурацию пользователя и не выводи ключ. Если ключ недоступен из SecretStorage снаружи VS Code, не обходи шифрование: используй штатный интерфейс расширения или запроси у пользователя ввод в поле ключа, а не в чат. Отделяй эту проверку от уже успешной проверки Claude Code.
5. Обнови `package.json` и связанный lockfile, если он есть, до выбранной версии. Переименуй `## Unreleased` в `## <версия>` в CHANGELOG. Сохрани все относящиеся к выпуску записи.
6. Собери VSIX через `npx --yes @vscode/vsce package -o claude-provider-switcher-<версия>.vsix`. Проверь содержимое: `providers.json` и исправленный `src/agents/codex.js` включены; ключей, личных конфигураций, временных тестовых файлов нет. По возможности установи собранный VSIX и проверь наличие новых пунктов и сохранность старых подключений. Файлы `*.vsix` в git не добавлять.
7. Создай коммит с изменениями релиза. Доставь его в принятую для этого репозитория ветку выпуска, сохранив изменения рабочей ветки и актуальные удалённые коммиты. Если действуют branch protection или обязательный PR, следуй им. Не используй force push и не переписывай опубликованные теги.
8. После push проверенного release-коммита создай тег **`v<версия>` на этом коммите** и отправь его в origin. Workflow `.github/workflows/release.yml` запускается по push тегов `v*`: проверяет совпадение тега с package.json, собирает VSIX, публикует его в Marketplace через `VSCE_PAT`, затем создаёт GitHub Release с VSIX и текстом из соответствующего раздела CHANGELOG. Не запускай параллельно ручной `vsce publish`, чтобы не получить двойную публикацию.
9. Дождись результата workflow и проверь Marketplace и GitHub Release, включая фактическую версию и приложенный VSIX. При сбое исправь установленную причину; не сообщай об успешном выпуске по одному факту push тега.
10. В отчёте дай версию, commit hash, тег, ссылки на workflow, GitHub Release и Marketplace, результаты тестов и настоящего Codex smoke test, а также любые оставшиеся ограничения.

Этот документ — инструкция для следующего исполнителя. Его можно включить в коммит как историю передачи; `docs/**` уже исключён из VSIX через `.vscodeignore`.
