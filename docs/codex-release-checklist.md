# Выпуск переключателя Codex (0.10.0) — чек-лист и промпт

Код переключателя Codex (этапы 1–3) уже в `main`. Перед тем как поднимать версию и ставить тег,
его нужно проверить на настоящей машине: в облачной песочнице, где он писался, не было
сети к провайдерам и настоящего VS Code. План и открытые вопросы — в документе
[«План: переключатель провайдеров для Codex»](https://claude.ai/code/artifact/80a572cf-2c69-4256-b399-9be12d802a58).

> Тег `v*` сразу публикует расширение в Marketplace (`.github/workflows/release.yml`).
> Ставить его только после того, как пройдены все пункты ниже.

## 1. Собрать и поставить локально

```bash
git checkout main && git pull
npm test                                   # 30 тестов, все должны пройти
npx --yes @vscode/vsce package -o cps-local.vsix
code --install-extension cps-local.vsix --force
```

Перезагрузить окно VS Code. До проверки сделать копию `~/.codex/config.toml`
(расширение само делает `config.toml.cps-backup` при первой записи, но лишняя копия не помешает).

## 2. Проверки

### Каталог на `/v1/responses`

Codex работает только через OpenAI Responses API. Каждый пункт каталога
(`providers.json` → `codex`) должен отвечать на `POST <base_url>/responses`.

- [ ] **OpenAI API** `https://api.openai.com/v1`: с ключом — 200 или 400, без ключа — 401 (не 404).
- [ ] **OpenRouter** `https://openrouter.ai/api/v1`: то же.
- [ ] **LM Studio** `http://localhost:1234/v1` (если установлен, модель загружена).
- [ ] **Ollama** `http://localhost:11434/v1` (если установлен).
- [ ] **vLLM** `http://localhost:8000/v1` (если есть).
- [ ] Для каждого, что не прошёл: убрать из каталога или поправить `base_url`.

Пример проверки без ключа:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://openrouter.ai/api/v1/responses \
  -H 'content-type: application/json' -d '{"model":"x","input":"ping"}'
```

### Настоящий Codex CLI

- [ ] Добавить профиль (например OpenRouter) в представлении **Codex**, переключиться.
- [ ] `~/.codex/config.toml`: верхние `model_provider` / `model` — от профиля; ключа в файле нет,
      есть `auth = { command = "cat", … }` (на Windows `cmd`, `/c`, `type`).
- [ ] `codex exec "say hi"` отвечает через выбранного провайдера.
- [ ] `codex --profile <key> exec "say hi"` работает для неактивного профиля.
- [ ] *Codex по умолчанию* возвращает прежние `model` / `model_provider`.
- [ ] Windows: ключ читается через `cmd /d /c type "<путь>"` (в пути могут быть пробелы).

### Расширение Codex в VS Code

- [ ] Переключить провайдера, начать **новый** чат в расширении Codex **без** перезагрузки окна.
      Посмотреть, какой провайдер записан в новом журнале:
      `~/.codex/sessions/<сегодня>/rollout-*.jsonl`, первая строка, `payload.model_provider`.
- [ ] Если без перезагрузки старый провайдер — проверить после *Reload Window*
      и записать в README («нужна перезагрузка окна»).

### Интерфейс расширения (кликает человек)

- [ ] Статус-бар `Codex: <имя>` и меню по клику.
- [ ] Представление Codex: переключение по клику, ⚡ тест, ✎ редактор (все поля), удаление.
- [ ] Горячие клавиши `Ctrl+Shift+Alt+1…0`, перебор `Ctrl+Shift+Alt+]` / `[` —
      нет конфликтов с другими сочетаниями.
- [ ] Fallback, *Переключить и перезагрузить окно*, закрепление за папкой (📌).
- [ ] Экспорт / импорт `codex-providers.json`; импорт этого файла в Claude ничего не создаёт.
- [ ] Подсказка профиля показывает токены (после пары запросов через Codex).
- [ ] Колонка «Codex Base URL» в *Manage custom providers…*.
- [ ] Язык интерфейса ru / zh: строки Codex переведены.
- [ ] Часть Claude не сломалась: переключение, хоткеи `Ctrl+Alt+…`, тест, импорт/экспорт.

### Терминальное приложение

- [ ] `claude-providers` → секция Codex, переключение, `→` действия, мастер добавления.
- [ ] `claude-providers codex list | current | use <имя> | default`.

### Скриншот

- [ ] Добавить в README снимок с видом Codex (настоящий, или макет через
      `media/screenshots/render.ps1`).

## 3. Выпуск

- [ ] `package.json` → `"version": "0.10.0"`.
- [ ] `CHANGELOG.md`: заголовок `## Unreleased` → `## 0.10.0`
      (workflow берёт текст релиза именно из раздела `## <версия>`).
- [ ] Коммит в `main`, затем `git tag v0.10.0 && git push origin v0.10.0`.
- [ ] Проверить, что workflow *Release* прошёл, версия появилась в Marketplace и GitHub Release.

## Промпт для Claude Code в консоли

Скопировать в `claude` в корне репозитория:

```text
В этом репозитории (claude-provider-switcher) в main уже влит переключатель провайдеров
для OpenAI Codex (этапы 1–3). Он писался в облачной песочнице без сети к провайдерам и без
VS Code, поэтому перед выпуском версии 0.10.0 его надо проверить на этой машине.

Прочитай docs/codex-release-checklist.md, CHANGELOG.md (раздел Unreleased) и код
src/agents/codex.js, src/codex.js, cli/main.js (секция Codex). Затем пройди чек-лист:

1. npm test; собери .vsix и установи его в VS Code (code --install-extension … --force).
   Перед любыми изменениями сделай копию ~/.codex/config.toml.
2. Проверь каждый пункт каталога providers.json → codex на POST <base_url>/responses
   (curl; без ключа 401 значит маршрут есть, 404 — нет). Ключи спроси у меня, в файлы
   и в историю их не записывай.
3. Проверь настоящий codex CLI: переключение через `claude-providers codex use …`,
   `codex exec`, `codex --profile <key> exec`, возврат через `claude-providers codex default`.
   Убедись, что ключей нет в config.toml.
4. Для расширения Codex в VS Code: попроси меня начать новый чат без перезагрузки окна,
   затем по payload.model_provider в новом ~/.codex/sessions/…/rollout-*.jsonl скажи,
   какой провайдер реально использовался. Повтори после Reload Window.
5. Пункты интерфейса, где нужно кликать, давай мне по одному и проверяй результат
   по файлам (config.toml, ~/.claude-provider-switcher/codex-keys, keybindings.json).
6. Всё, что не работает, исправь отдельными коммитами с тестами; отмечай пункты
   в docs/codex-release-checklist.md.

Версию не поднимай и тег не ставь, пока я не подтвержу, что все проверки пройдены.
После подтверждения: version 0.10.0 в package.json, "## Unreleased" → "## 0.10.0"
в CHANGELOG.md, коммит, затем покажи мне команды для тега — пушить тег буду я.
```
