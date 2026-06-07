# Claude Provider Switcher

Switch the official [**Claude Code**](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
extension between different model providers — your **native Claude subscription**, a **self-hosted
gateway** (LiteLLM, etc.), **direct provider endpoints** (DeepSeek, MiniMax, …), or a **local server**
(LM Studio, Ollama) — from a **sidebar UI**, a **menu**, **per-profile hotkeys**, and a **status bar
indicator**. No manual JSON editing required.

It applies a profile by writing its environment variables into Claude Code's
`claudeCode.environmentVariables` setting, which Claude Code reads when a session starts.

**Languages:** [English](#english) · [Русский](#русский) · [中文](#zh)

> **No accounts, no keys bundled.** This extension ships zero credentials. Your profiles — including any
> API keys — live only in *your* settings and are never sent anywhere. ·
> **Никаких аккаунтов и ключей в пакете.** Профили (включая ключи) хранятся только в *твоих*
> настройках и никуда не отправляются. ·
> **不含任何账号或密钥。** 本扩展不附带任何凭据；你的配置（包括 API 密钥）仅保存在*你自己的*设置中，绝不外发。

![Claude Provider Switcher](https://raw.githubusercontent.com/lobacom/claude-provider-switcher/main/media/screenshot.png)

---

<a id="english"></a>

## English

### Features

- 🗂️ **Sidebar UI** — a *Claude Providers* view in the Activity Bar to **add / edit / delete /
  duplicate / reorder / switch** providers. No hand-editing `settings.json`.
- ➕ **Add your own providers** — the *Add provider* menu ships a built-in catalog, and a **table
  editor** (*Manage custom providers…*) lets you add any provider that isn't on it. Custom ones then
  appear in the menu tagged `(custom)`. Backed by the `customProviders` setting.
- ⌨️ **Per-profile hotkey** — each profile can own a shortcut (`Ctrl+Alt+1`…`Ctrl+Alt+9`,
  `Ctrl+Alt+0`). New profiles get the next free slot automatically; the binding is written to your
  `keybindings.json` for you.
- 🎛️ **Menu** — `Claude Provider: Select provider…`, or click the status bar item.
- 🔁 **Cycle** — `Ctrl+Alt+]` / `Ctrl+Alt+[` (macOS `Cmd+Alt+…`) jump to the next / previous provider.
- 📌 **Pin to workspace** — bind a provider to a folder; opening that workspace auto-switches to it
  (stored per-workspace, not in `settings.json`). Right-click → *Pin to this workspace*.
- ⚡ **Test connection** — check that an endpoint is reachable and your API key is accepted, right from the row.
- 🟢 **Health indicator** — a 🟢/🔴 tint shows each provider's reachability. Refresh on demand (❤ button)
  or set `healthCheck` to `periodic`. The check uses `GET /v1/models` — **no inference, zero tokens**.
- 🔀 **Auto-fallback** — give a profile a *fallback provider*; *Switch with fallback* probes it and, if
  it's down, switches to the fallback (following the chain). Flip on `autoFallbackOnApply` to apply this
  to every switch.
- 🧩 **Pick models from a list** — when setting the Opus/Sonnet/Haiku model, the editor fetches the
  provider's model catalog (`GET /v1/models`) so you choose from a dropdown instead of typing the id.
- 🔐 **Secure keys** — API keys are stored in VS Code **SecretStorage**, never in `settings.json`.
- 📤 **Import / Export** — share or back up your profiles as JSON (keys excluded by default).
- 🔌 **Status bar indicator** — shows the active provider; hidden when no providers exist. After a
  switch it tints and reminds you to restart the Claude Code session (toggle with `showRestartHint`).
- 🖥️ **Mirror to the CLI** — flip on `writeClaudeSettings` to also write the active provider into
  `~/.claude/settings.json`, so `claude` in a plain terminal (not just the VS Code extension) uses it.
  Only the keys this extension manages are touched; the rest of the file is preserved.
- ⚙️ **Switch action** — a setting controls what happens on every switch: just switch (`switch`, the
  default), or switch and immediately reload the window (`switchAndReload`) so a new Claude Code session
  starts against the new provider right away.
- 📝 **Gateway tip** — profiles whose `Base URL` looks like a third-party LLM gateway (non-Anthropic, non-
  local) get a short note in the tooltip about Claude Code's `/model` and `ANTHROPIC_DEFAULT_*_MODEL`
  behaviour for gateways. The other profiles are unchanged.
- 🧪 **Extra environment variables** — an *Extra environment variables* field in the profile editor lets
  you add any other variable Claude Code reads (e.g. `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`,
  `ANTHROPIC_CUSTOM_HEADERS`) without hand-editing `settings.json`.
- 🔄 **Switch & reload** — a dedicated *Switch provider & reload window* command (right-click a provider,
  or the palette) always switches and reloads in one step, regardless of the setting.
- ∞ **Unlimited profiles** (hotkeys cover the first 10 slots; the rest are switched via the sidebar/menu).

### Quick start

1. Install this extension and the [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) extension.
2. Open the **Claude Providers** view from the Activity Bar (the dotted icon) and click **+ Add
   provider**. Pick a **template** — *Custom* (blank), *Claude Subscription*, *Claude API*, a
   built-in **Anthropic-compatible provider** (DeepSeek, Kimi, MiniMax, Qwen, Z.ai, …), or a **local
   server** (Ollama, LM Studio, llama.cpp, vLLM): the Base URL (and model mapping, where fixed) is
   pre-filled. Then just add your API key. Every field stays editable (see
   [Profile fields](#profile-fields)); an empty Base URL = native subscription.
3. Switch with the profile's **hotkey**, the **menu**, or the sidebar ▶ button.
4. **Start a new Claude Code session** (new chat / Reload Window) so it picks up the change — Claude
   Code reads the environment when a session starts, not live.

### Managing providers (sidebar)

| Action | Where |
| --- | --- |
| **Add** | view title-bar `+` → pick a template (Custom / Claude Subscription / Claude API / a built-in provider), then add your key; auto-assigns the next free hotkey |
| **Switch to** | row ▶ (inline) |
| **Test connection** | row ⚡ (inline) or right-click → *Test connection* |
| **Edit** | row ✎ (inline) or right-click → *Edit* |
| **Delete** | row 🗑 (inline) or right-click → *Delete* (deleting the active one switches to the first remaining; deleting the last resets to the subscription) |
| **Duplicate / Move up / Move down** | right-click menu |
| **Pin to this workspace** | right-click → *Pin to this workspace* (the active folder auto-switches to it on open; pick *Don’t auto-switch* to unpin) |
| **Switch with fallback** | right-click → *Switch with fallback* (probes the provider; if it's down, switches to its fallback) |
| **Switch & reload window** | right-click → *Switch provider & reload window* (switches, then reloads so a new session picks it up) |
| **Check health** | view title-bar ❤ (refreshes the 🟢/🔴 reachability of every provider; token-free) |
| **Manage custom providers** | view title-bar overflow (`…`) → *Manage custom providers…*, or the bottom entry of the *Add provider* menu (opens a table editor for providers not in the built-in list) |
| **Import / Export** | view title-bar overflow (`…`) menu |

The active provider is marked with a filled dot. Editing is field-by-field: pick a field, set its value,
repeat, then *Done*. **Color** and **Hotkey** are chosen from a dropdown — no codes to remember.

### Adding a provider that isn't in the list

The **Add provider** menu ships a built-in catalog (loaded from a bundled `providers.json`), but you can
add your own. Run **Manage custom providers…** — from the *Add provider* menu (bottom entry), the view
title-bar `…` overflow, or the command palette — to open a small **table editor**:

| Column | Meaning |
| --- | --- |
| **Name** | Label shown in the *Add provider* menu. |
| **Base URL** | `ANTHROPIC_BASE_URL` of the provider's Anthropic-compatible endpoint. Leave empty for a subscription-style entry. |
| **Local** | Lists it under *Local servers* instead of *Anthropic-compatible providers*. |
| **Icon** | Optional: a logo file under `media/providers/`, or a VS Code codicon id (e.g. `server`). |
| **Opus / Sonnet / Haiku model** | Optional tier→model defaults, pre-filled into new profiles. |

Click **+ Add provider**, fill the row, then **Save**. Your providers then show up in the *Add provider*
menu tagged `(custom)`, and their endpoints are matched for logos and health checks just like the
built-ins. The table maps one-to-one onto the `claudeProviderSwitcher.customProviders` setting, so you
can edit that JSON directly too. **API keys aren't entered here** — you add them per profile (kept in
SecretStorage) after picking the provider.

### Hotkeys

- Assigned per profile. Defaults to the next free `Ctrl+Alt+<n>` on **Add**; change it anytime via
  **Edit → Hotkey** (or set *None*).
- The extension keeps your **User `keybindings.json`** in sync automatically (it only manages its own
  `claudeProviderSwitcher.switchToIndex` entries and never touches your other shortcuts).

### Profile fields

| Field | Meaning |
| --- | --- |
| **Name** | Shown in the menu, sidebar, and status bar. |
| **Badge** | A color shape (🟢🔵🟣🟡🟠🟩🟦🔷…) picked from a list; auto-assigned on Add. (The provider **logo** shows in the Add menu and the hover tooltip.) |
| **Hotkey** | Optional `Ctrl+Alt+<n>` shortcut, auto-assigned on Add. |
| **Fallback provider** | (optional) Another profile to switch to when this one is unreachable — used by *Switch with fallback* and `autoFallbackOnApply`. |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible endpoint. **Empty = native subscription.** |
| `ANTHROPIC_AUTH_TOKEN` | API key for third-party endpoints. **Stored in SecretStorage**, not `settings.json`; the editor shows it masked. |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` / `…_SONNET_MODEL` / `…_HAIKU_MODEL` | Models the Opus/Sonnet/Haiku tiers map to. Picking the field fetches the endpoint's model list (`GET /v1/models`) so you choose from a dropdown; *Enter manually…* is always available. |
| `API_TIMEOUT_MS` | (optional) Request timeout in ms. |
| **Extra environment variables** | (optional) Any other env var Claude Code reads — e.g. `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`, `ANTHROPIC_CUSTOM_HEADERS`. Add/edit/clear them in a small list; keys that have their own field above are rejected. |

> Inside Claude Code you can still switch tiers with `/model`.

#### When do you need extra environment variables?

Most setups never need these — the dedicated fields cover the common case. The *Extra environment
variables* field is an escape hatch for third-party endpoints and gateways that need a per-provider
tweak Claude Code reads from the environment. Common ones:

| Variable | When you need it | Why per-provider |
| --- | --- | --- |
| `MAX_THINKING_TOKENS` = `0` | A gateway/model rejects requests because of thinking/reasoning params (e.g. `400 thinking options type cannot be disabled when reasoning_effort is set`). Setting it to `0` turns thinking off. | Depends on the specific gateway/model |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` = `1` | Same idea on older models (Opus 4.6 / Sonnet 4.6) — reverts to a fixed thinking budget. | Model-specific |
| `ANTHROPIC_CUSTOM_HEADERS` | The endpoint needs extra HTTP headers (a second auth token, a tenant id, routing hints). Format: `Header-Name: value` (newline-separated for several). | Each gateway has its own |
| `DISABLE_PROMPT_CACHING` = `1` | The endpoint doesn't understand `cache_control` and errors out on cached requests. | A property of that provider |
| `ANTHROPIC_CUSTOM_MODEL_OPTION` (+ `…_NAME`, `…_DESCRIPTION`) | Add a single model id to the `/model` picker that discovery wouldn't list (e.g. a non-`claude`-named gateway model). | Specific to the gateway's model ids |
| `ANTHROPIC_DEFAULT_OPUS_MODEL_NAME` / `…_DESCRIPTION` | Give a pinned gateway model a friendly label in the `/model` picker. | Cosmetic, per gateway |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` = `1` | List the gateway's *other* models in `/model` from its `/v1/models`. Your three tier pins already appear in the picker as Custom Opus/Sonnet/Haiku — this is only for the rest of the catalog, and **only adds ids starting with `claude`/`anthropic`** (so it does nothing for DeepSeek/MiniMax/GLM-style names; use `ANTHROPIC_DEFAULT_*_MODEL` for those). Rarely needed. | Gateway-specific, opt-in |

> These take effect on the **next** Claude Code session (start a new chat or reload the window). They
> don't fix a *resumed* session, which keeps the model and settings from its saved transcript.

### Example provider configs

You normally add these via the sidebar, but here are the values to enter (replace `YOUR_*_KEY`):

**Native Claude subscription** — leave every field empty (Base URL empty).

**DeepSeek** (direct, Anthropic-compatible):

| Field | Value |
| --- | --- |
| Base URL | `https://api.deepseek.com/anthropic` |
| Auth token | `YOUR_DEEPSEEK_API_KEY` |
| Opus / Sonnet / Haiku | `deepseek-v4-pro` / `deepseek-v4-flash` / `deepseek-v4-flash` |

**MiniMax** (direct; models must be explicit):

| Field | Value |
| --- | --- |
| Base URL | `https://api.minimax.io/anthropic` |
| Auth token | `YOUR_MINIMAX_API_KEY` |
| Opus / Sonnet / Haiku | `MiniMax-M3` / `MiniMax-M3` / `MiniMax-M2.7` |

**Local LM Studio** (offline) — enable the server (*Developer → Start Server*, port `1234`); use the
exact model **id** from `http://localhost:1234/v1/models`; token = any non-empty string:

| Field | Value |
| --- | --- |
| Base URL | `http://localhost:1234` |
| Auth token | `lmstudio` |
| Opus / Sonnet / Haiku | `your-loaded-model-id` |

**Self-hosted gateway** (LiteLLM / OpenAI-compatible proxy) — one endpoint, switch models with `/model`:

| Field | Value |
| --- | --- |
| Base URL | `https://your-gateway.example` |
| Auth token | `YOUR_GATEWAY_KEY` |
| Opus / Sonnet / Haiku | your gateway's model aliases |

<details>
<summary>Prefer editing JSON directly? Example <code>settings.json</code></summary>

```jsonc
"claudeProviderSwitcher.profiles": [
  { "name": "Subscription", "color": "🟢", "hotkey": "Ctrl+Alt+1", "env": {} },
  {
    "name": "DeepSeek", "color": "🟣", "hotkey": "Ctrl+Alt+2",
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "YOUR_DEEPSEEK_API_KEY",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "deepseek-v4-pro",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-flash",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash"
    }
  },
  {
    "name": "MiniMax", "color": "🟡", "hotkey": "Ctrl+Alt+3",
    "env": {
      "ANTHROPIC_BASE_URL": "https://api.minimax.io/anthropic",
      "ANTHROPIC_AUTH_TOKEN": "YOUR_MINIMAX_API_KEY",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "MiniMax-M3",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "MiniMax-M3",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "MiniMax-M2.7"
    }
  },
  {
    "name": "LM Studio", "color": "🟠", "hotkey": "Ctrl+Alt+4",
    "env": {
      "ANTHROPIC_BASE_URL": "http://localhost:1234",
      "ANTHROPIC_AUTH_TOKEN": "lmstudio",
      "ANTHROPIC_DEFAULT_OPUS_MODEL": "your-loaded-model-id",
      "ANTHROPIC_DEFAULT_SONNET_MODEL": "your-loaded-model-id",
      "ANTHROPIC_DEFAULT_HAIKU_MODEL": "your-loaded-model-id"
    }
  }
]
```
</details>

### Settings

| Setting | Default | Description |
| --- | --- | --- |
| `claudeProviderSwitcher.profiles` | `[]` | Provider profiles `{ name, color?, hotkey?, env }`. Managed via the sidebar. |
| `claudeProviderSwitcher.customProviders` | `[]` | Extra providers added to the **Add provider** menu `{ name, baseUrl?, local?, icon?, opusModel?, sonnetModel?, haikuModel? }`. Use this to add a provider that isn't built in; edit it as a table in the Settings UI. |
| `claudeProviderSwitcher.language` | `auto` | UI language for the extension's own menus, notifications, sidebar, status bar and custom-providers table: `auto` / `en` / `ru` / `zh`. `auto` follows VS Code, falling back to English. Switches live. |
| `claudeProviderSwitcher.showStatusBarItem` | `true` | Show the active-provider indicator in the status bar. |
| `claudeProviderSwitcher.switchAction` | `switch` | What happens on every switch (sidebar click, hotkey, cycle, menu): `switch` — switch the provider, then remind to restart the session; `switchAndReload` — switch and immediately reload the window so the next session picks up the new provider. |
| `claudeProviderSwitcher.writeClaudeSettings` | `false` | Also mirror the active provider into the Claude Code **CLI** config at `~/.claude/settings.json` (under `env`), so `claude` in a plain terminal uses the same provider. Only the keys this extension manages are touched; the rest of the file is preserved. Writes the active API key there in plain text. |
| `claudeProviderSwitcher.showRestartHint` | `true` | After switching, tint the status bar item and remind you the Claude Code session must restart (new chat / Reload Window) to take effect. Clears on reload. |

### Notes

- **Start a new session after switching.** Claude Code reads `claudeCode.environmentVariables` when a
  session starts, not live — so after switching, **open a new chat**. A *resumed* chat (and a window
  reload, which restores the conversation) keeps the model and settings from its saved transcript, so a
  reload alone may not pick up a model change. Set `claudeProviderSwitcher.switchAction` to
  `switchAndReload`, or use the *Switch provider & reload window* command, to reload automatically — but
  a fresh chat is the reliable way to apply a provider/model change.
- Prefer **`ANTHROPIC_AUTH_TOKEN`** over `ANTHROPIC_API_KEY` for third-party endpoints (Bearer header).
- **Local servers** (Ollama, LM Studio, llama.cpp, vLLM): the preset fills the Base URL and a
  throwaway token — set the **model** to your loaded model id. For **llama.cpp**, start `llama-server`
  with **`--jinja`**, otherwise tool calls won't work and Claude Code stops acting like an agent.
- Reasoning models may return an empty final message when `max_tokens` is too low (tokens go into
  reasoning) — provider behavior, not the switcher.

---

<a id="русский"></a>

## Русский

Расширение переключает официальное [**Claude Code**](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
между провайдерами моделей: **нативная подписка**, **собственный шлюз** (LiteLLM и т.п.), **прямые
эндпоинты** (DeepSeek, MiniMax, …) или **локальный сервер** (LM Studio, Ollama) — через **сайдбар**,
**меню**, **хоткеи на профиль** и **индикатор в статус-баре**. Ручная правка JSON не нужна.

Профиль применяется записью его переменных в `claudeCode.environmentVariables`, которую Claude Code
читает при старте сессии.

### Возможности

- 🗂️ **Сайдбар** — панель *Claude Providers* в Activity Bar: **добавить / изменить / удалить /
  дублировать / переместить / переключить** провайдера. Без правки `settings.json` руками.
- ➕ **Свои провайдеры** — в меню *Add provider* есть встроенный каталог, а **табличный редактор**
  (*Manage custom providers…*) позволяет добавить любого провайдера, которого в нём нет. Свои
  провайдеры появляются в меню с пометкой `(custom)`. Хранится в настройке `customProviders`.
- ⌨️ **Хоткей на профиль** — у каждого профиля своя комбинация (`Ctrl+Alt+1`…`Ctrl+Alt+9`,
  `Ctrl+Alt+0`). Новому профилю автоматически выдаётся ближайший свободный слот; биндинг сам
  прописывается в твой `keybindings.json`.
- 🎛️ **Меню** — `Claude Provider: Select provider…` или клик по индикатору.
- 🔁 **Цикл** — `Ctrl+Alt+]` / `Ctrl+Alt+[` (на macOS `Cmd+Alt+…`) переключают на следующего / предыдущего провайдера.
- 📌 **Привязка к workspace** — закрепи провайдера за папкой; при открытии этого workspace расширение
  автоматически переключится на него (хранится по workspace, не в `settings.json`). ПКМ → *Pin to this workspace*.
- ⚡ **Проверка соединения** — прямо из строки профиля проверить, что эндпоинт доступен и ключ принят.
- 🟢 **Индикатор здоровья** — цвет 🟢/🔴 показывает доступность каждого провайдера. Обновляй по кнопке (❤)
  или включи `healthCheck` = `periodic`. Проверка идёт через `GET /v1/models` — **без инференса, ноль токенов**.
- 🔀 **Авто-фолбэк** — задай профилю *резервный провайдер*; *Switch with fallback* проверит его и, если
  он недоступен, переключится на резервный (по цепочке). Включи `autoFallbackOnApply`, чтобы так
  работало при каждом переключении.
- 🧩 **Выбор модели из списка** — при задании модели Opus/Sonnet/Haiku редактор подтягивает каталог
  моделей провайдера (`GET /v1/models`), и ты выбираешь из выпадающего списка, а не вводишь id вручную.
- 🔐 **Безопасные ключи** — API-ключи хранятся в **SecretStorage** VS Code, а не в `settings.json`.
- 📤 **Импорт / экспорт** — поделиться профилями или сделать бэкап в JSON (ключи по умолчанию исключаются).
- 🔌 **Индикатор** активного провайдера в статус-баре; прячется, когда профилей нет. После переключения
  подсвечивается и напоминает перезапустить сессию Claude Code (отключается настройкой `showRestartHint`).
- 🖥️ **Зеркалирование в CLI** — включи `writeClaudeSettings`, чтобы активный провайдер также писался в
  `~/.claude/settings.json`, и `claude` в обычном терминале (а не только расширение в VS Code) использовал
  его. Трогаются только ключи, которыми управляет расширение; остальное в файле сохраняется.
- ⚙️ **Действие при переключении** — настройка определяет, что происходит при каждом переключении: просто
  переключить (`switch`, по умолчанию) или переключить и сразу перезагрузить окно (`switchAndReload`),
  чтобы новая сессия Claude Code стартовала на новом провайдере без лишних действий.
- 📝 **Подсказка про шлюз** — у профилей с чужим `Base URL` (не Anthropic, не localhost) в тултипе
  появляется короткая заметка о поведении Claude Code для шлюзов (`/model` и `ANTHROPIC_DEFAULT_*_MODEL`).
  Остальные профили не меняются.
- 🧪 **Доп. переменные окружения** — поле *Доп. переменные окружения* в редакторе профиля позволяет
  задать любую другую переменную, которую читает Claude Code (напр. `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`,
  `ANTHROPIC_CUSTOM_HEADERS`) без ручной правки `settings.json`.
- 🔄 **Переключить и перезагрузить** — отдельная команда *Переключиться и перезагрузить окно* (ПКМ по
  провайдеру или палитра) всегда переключает и перезагружает, независимо от настройки.
- ∞ **Без лимита на число профилей** (хоткеи покрывают первые 10 слотов; остальные — через
  сайдбар/меню).

### Быстрый старт

1. Установи это расширение и [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code).
2. Открой панель **Claude Providers** в Activity Bar (иконка из точек) → **+ Add provider**. Выбери
   **шаблон** — *Custom* (пусто), *Claude Subscription*, *Claude API*, встроенный
   **Anthropic-совместимый провайдер** (DeepSeek, Kimi, MiniMax, Qwen, Z.ai, …) или **локальный
   сервер** (Ollama, LM Studio, llama.cpp, vLLM): Base URL (и маппинг моделей, где он фиксирован)
   подставится сам. Останется только вписать свой API-ключ. Все поля остаются редактируемыми
   (см. [Поля профиля](#поля-профиля)); пустой Base URL = нативная подписка.
3. Переключайся **хоткеем** профиля, через **меню** или кнопкой ▶ в сайдбаре.
4. **Запусти новую сессию Claude Code** (новый чат / Reload Window) — переменные читаются при старте
   сессии, не на лету.

### Управление провайдерами (сайдбар)

| Действие | Где |
| --- | --- |
| **Add** | кнопка `+` в шапке → выбор шаблона (Custom / Claude Subscription / Claude API / встроенный провайдер), затем впиши ключ; сразу выдаёт ближайший свободный хоткей |
| **Switch to** | ▶ в строке |
| **Test connection** | ⚡ в строке или ПКМ → *Test connection* |
| **Edit** | ✎ в строке или ПКМ → *Edit* |
| **Delete** | 🗑 в строке или ПКМ → *Delete* (удаление активного → переключение на первого оставшегося; удаление последнего → сброс на подписку) |
| **Duplicate / Move up / Move down** | контекстное меню (ПКМ) |
| **Manage custom providers** | меню «…» в шапке → *Manage custom providers…*, либо нижний пункт меню *Add provider* (табличный редактор для провайдеров не из встроенного списка) |
| **Import / Export** | меню «…» в шапке панели |

Активный провайдер помечен закрашенной точкой. Редактирование — по полям: выбрал поле, задал значение,
повторил, потом *Done*. **Color** и **Hotkey** выбираются из списка — никаких кодов запоминать не надо.

### Добавление провайдера, которого нет в списке

Меню **Add provider** содержит встроенный каталог (грузится из вшитого `providers.json`), но можно
добавить и своего. Запусти **Manage custom providers…** — из меню *Add provider* (нижний пункт), из
меню «…» в шапке панели или из палитры команд — откроется **табличный редактор**:

| Колонка | Смысл |
| --- | --- |
| **Name** | Имя в меню *Add provider*. |
| **Base URL** | `ANTHROPIC_BASE_URL` Anthropic-совместимого эндпоинта. Пусто — вариант «как подписка». |
| **Local** | Помещает провайдера в раздел *Local servers*, а не *Anthropic-compatible providers*. |
| **Icon** | Необязательно: файл логотипа из `media/providers/` или id codicon (напр. `server`). |
| **Opus / Sonnet / Haiku model** | Необязательные модели по уровням, подставляются в новый профиль. |

Нажми **+ Add provider**, заполни строку, затем **Save**. Провайдеры появятся в меню *Add provider* с
пометкой `(custom)`, а их эндпоинты так же сопоставляются с логотипами и health-check, как встроенные.
Таблица один-в-один соответствует настройке `claudeProviderSwitcher.customProviders` — этот JSON можно
править и напрямую. **Ключи здесь не вводятся** — их добавляешь в профиль (хранятся в SecretStorage)
уже после выбора провайдера.

### Хоткеи

- Назначаются на профиль. При **Add** ставится ближайший свободный `Ctrl+Alt+<n>`; сменить можно в любой
  момент через **Edit → Hotkey** (или *None*).
- Расширение само поддерживает твой **User `keybindings.json`** в актуальном виде (трогает только свои
  записи `claudeProviderSwitcher.switchToIndex`, чужие шорткаты не задевает).

### Поля профиля

| Поле | Смысл |
| --- | --- |
| **Name** | Имя в меню, сайдбаре и статус-баре. |
| **Badge** | Цветная фигурка (🟢🔵🟣🟡🟠🟩🟦🔷…) из списка; авто-назначается при Add. (**Логотип** провайдера показывается в меню Add и во всплывающей подсказке.) |
| **Hotkey** | Необязательный `Ctrl+Alt+<n>`, авто-назначается при Add. |
| `ANTHROPIC_BASE_URL` | Anthropic-совместимый эндпоинт. **Пусто = нативная подписка.** |
| `ANTHROPIC_AUTH_TOKEN` | Ключ для сторонних эндпоинтов. **Хранится в SecretStorage**, а не в `settings.json`; в редакторе показывается замаскированным. |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` / `…_SONNET_MODEL` / `…_HAIKU_MODEL` | На какие модели мапятся уровни Opus/Sonnet/Haiku. |
| `API_TIMEOUT_MS` | (необязательно) таймаут запроса в мс. |
| **Доп. переменные окружения** | (необязательно) любая другая переменная, которую читает Claude Code — напр. `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`, `ANTHROPIC_CUSTOM_HEADERS`. Добавляются/меняются/удаляются в списке; ключи, у которых есть своё поле выше, отклоняются. |

> Внутри Claude Code уровни можно менять командой `/model`.

#### Когда реально нужны доп. переменные окружения?

Большинству они не нужны — штатных полей хватает для обычных случаев. Поле *Доп. переменные окружения* —
это «отвёртка» для сторонних эндпоинтов и шлюзов, которым нужна донастройка на уровне провайдера,
читаемая Claude Code из окружения. Частые:

| Переменная | Когда нужна | Почему per-provider |
| --- | --- | --- |
| `MAX_THINKING_TOKENS` = `0` | Шлюз/модель отвергает запрос из-за thinking/reasoning-параметров (напр. `400 thinking options type cannot be disabled when reasoning_effort is set`). `0` отключает thinking. | Зависит от конкретного шлюза/модели |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` = `1` | То же на старых моделях (Opus 4.6 / Sonnet 4.6) — возврат к фиксированному бюджету thinking. | Зависит от модели |
| `ANTHROPIC_CUSTOM_HEADERS` | Эндпоинту нужны доп. HTTP-заголовки (второй токен, tenant-id, маршрутизация). Формат: `Header-Name: value` (несколько — через перенос строки). | У каждого шлюза свои |
| `DISABLE_PROMPT_CACHING` = `1` | Эндпоинт не понимает `cache_control` и падает на кэшируемых запросах. | Свойство этого провайдера |
| `ANTHROPIC_CUSTOM_MODEL_OPTION` (+ `…_NAME`, `…_DESCRIPTION`) | Добавить в picker `/model` id модели, которую discovery не покажет (напр. модель шлюза не на `claude`). | Зависит от id моделей шлюза |
| `ANTHROPIC_DEFAULT_OPUS_MODEL_NAME` / `…_DESCRIPTION` | Дать прикреплённой модели шлюза понятное имя в picker `/model`. | Косметика, по шлюзу |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` = `1` | Показать в `/model` *остальные* модели шлюза из его `/v1/models`. Твои три tier-модели уже в picker'е как Custom Opus/Sonnet/Haiku — это только для остального каталога, и **добавляет лишь id на `claude`/`anthropic`** (для имён вроде DeepSeek/MiniMax/GLM ничего не даёт — используй `ANTHROPIC_DEFAULT_*_MODEL`). Нужна редко. | Per-gateway, по желанию |

> Применяются в **следующей** сессии Claude Code (новый чат или перезагрузка окна). Возобновлённую
> сессию они не меняют — она тянет модель и настройки из сохранённого transcript.

### Примеры провайдеров

Обычно их добавляют через сайдбар, но вот значения для ввода (вместо `YOUR_*_KEY` — свои ключи):

- **Нативная подписка** — все поля пустые (пустой Base URL).
- **DeepSeek:** Base URL `https://api.deepseek.com/anthropic`, токен `YOUR_DEEPSEEK_API_KEY`,
  Opus/Sonnet/Haiku = `deepseek-v4-pro` / `deepseek-v4-flash` / `deepseek-v4-flash`.
- **MiniMax:** Base URL `https://api.minimax.io/anthropic`, токен `YOUR_MINIMAX_API_KEY`,
  Opus/Sonnet/Haiku = `MiniMax-M3` / `MiniMax-M3` / `MiniMax-M2.7`.
- **LM Studio:** Base URL `http://localhost:1234`, токен `lmstudio`, модель = точный `id` из
  `http://localhost:1234/v1/models` (включи сервер: *Developer → Start Server*).
- **Свой шлюз:** Base URL `https://your-gateway.example`, токен `YOUR_GATEWAY_KEY`, модели — алиасы
  твоего шлюза.

Полный пример `settings.json` см. в свёрнутом блоке английской секции выше.

### Настройки

| Настройка | По умолчанию | Описание |
| --- | --- | --- |
| `claudeProviderSwitcher.profiles` | `[]` | Профили `{ name, color?, hotkey?, env }`. Управляются через сайдбар. |
| `claudeProviderSwitcher.customProviders` | `[]` | Свои провайдеры для меню **Add provider** `{ name, baseUrl?, local?, icon?, opusModel?, sonnetModel?, haikuModel? }`. Добавляйте недостающего провайдера; редактируется таблицей в UI настроек. |
| `claudeProviderSwitcher.language` | `auto` | Язык интерфейса расширения (меню, уведомления, сайдбар, статус-бар, таблица провайдеров): `auto` / `en` / `ru` / `zh`. `auto` следует языку VS Code с откатом на английский. Переключается на лету. |
| `claudeProviderSwitcher.showStatusBarItem` | `true` | Показывать индикатор активного провайдера в статус-баре. |
| `claudeProviderSwitcher.switchAction` | `switch` | Что делать при каждом переключении (клик в сайдбаре, хоткей, цикл, меню): `switch` — переключить и напомнить о перезапуске сессии; `switchAndReload` — переключить и сразу перезагрузить окно, чтобы новая сессия стартовала на новом провайдере. |
| `claudeProviderSwitcher.writeClaudeSettings` | `false` | Дублировать активного провайдера в **CLI**-конфиг Claude Code `~/.claude/settings.json` (в ключ `env`), чтобы `claude` в обычном терминале использовал того же провайдера. Трогаются только управляемые расширением ключи; остальное в файле сохраняется. Активный API-ключ пишется туда открытым текстом. |
| `claudeProviderSwitcher.showRestartHint` | `true` | После переключения подсвечивать индикатор в статус-баре и напоминать, что сессию Claude Code нужно перезапустить (новый чат / Reload Window). Сбрасывается при перезагрузке окна. |

### Заметки

- **После переключения начни новую сессию.** Claude Code читает `claudeCode.environmentVariables` при
  старте сессии, а не на лету — поэтому после переключения **открой новый чат**. *Возобновлённый* чат
  (и перезагрузка окна, которая восстанавливает беседу) держит модель и настройки из сохранённого
  transcript, так что один лишь reload может не подхватить смену модели. Можно включить
  `claudeProviderSwitcher.switchAction` = `switchAndReload` или использовать команду *Переключиться и
  перезагрузить окно* для авто-reload — но надёжно применяет смену провайдера/модели именно новый чат.
- Для сторонних эндпоинтов используй **`ANTHROPIC_AUTH_TOKEN`**, не `ANTHROPIC_API_KEY` (заголовок Bearer).
- **Локальные серверы** (Ollama, LM Studio, llama.cpp, vLLM): пресет подставляет Base URL и
  токен-заглушку — задай **модель** = id своей загруженной модели. Для **llama.cpp** запускай
  `llama-server` с флагом **`--jinja`**, иначе не работают вызовы инструментов и Claude Code
  перестаёт вести себя как агент.
- Reasoning-модели при малом `max_tokens` могут вернуть пустой финальный ответ — это поведение
  провайдера, не переключателя.

---

<a id="zh"></a>

## 中文

本扩展让官方 [**Claude Code**](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code)
扩展在不同的模型服务商之间切换 —— **原生 Claude 订阅**、**自建网关**（LiteLLM 等）、**服务商直连端点**
（DeepSeek、MiniMax 等）或**本地服务**（LM Studio、Ollama）—— 通过**侧边栏界面**、**菜单**、**每个配置的
快捷键**以及**状态栏指示器**。无需手动编辑 JSON。

切换时，它会把所选配置的环境变量写入 `claudeCode.environmentVariables`，Claude Code 在会话启动时读取该设置。

### 功能特性

- 🗂️ **侧边栏界面** —— 活动栏中的 *Claude Providers* 视图，可**添加 / 编辑 / 删除 / 复制 / 重排 / 切换**
  服务商。无需手动改 `settings.json`。
- ➕ **添加自定义服务商** —— *Add provider* 菜单自带内置目录，**表格编辑器**（*Manage custom providers…*）
  让你添加其中没有的任意服务商。自定义项会以 `(custom)` 标记出现在菜单中。由 `customProviders` 设置存储。
- ⌨️ **每个配置独立快捷键**（`Ctrl+Alt+1`…`Ctrl+Alt+9`、`Ctrl+Alt+0`）。新配置自动分配下一个空闲槽位；
  快捷键会自动写入你的 `keybindings.json`。
- 🎛️ **菜单** —— `Claude Provider: Select provider…`，或点击状态栏项。
- 🔁 **循环切换** —— `Ctrl+Alt+]` / `Ctrl+Alt+[`（macOS 为 `Cmd+Alt+…`）切换到下一个 / 上一个服务商。
- 📌 **绑定到工作区** —— 将服务商绑定到某个文件夹；打开该工作区时自动切换到它（按工作区存储，
  不写入 `settings.json`）。右键 → *Pin to this workspace*。
- ⚡ **测试连接** —— 直接在行内检查端点是否可达、API 密钥是否被接受。
- 🟢 **健康指示器** —— 用 🟢/🔴 颜色显示每个服务商的可达性。可按需刷新（❤ 按钮），或将 `healthCheck`
  设为 `periodic`。检测使用 `GET /v1/models` —— **不触发推理、零 token 消耗**。
- 🔀 **自动回退** —— 为配置指定一个*回退服务商*；*Switch with fallback* 会先探测目标，若不可达则切换到
  回退服务商（沿链依次尝试）。开启 `autoFallbackOnApply` 可让每次切换都执行此操作。
- 🧩 **从列表选择模型** —— 设置 Opus/Sonnet/Haiku 模型时，编辑器会从服务商拉取模型目录（`GET /v1/models`），
  让你从下拉列表中选择，而无需手动输入 id。
- 🔐 **密钥安全** —— API 密钥存储在 VS Code **SecretStorage** 中，而非 `settings.json`。
- 📤 **导入 / 导出** —— 以 JSON 形式分享或备份配置（默认不含密钥）。
- 🔌 **状态栏指示器** —— 显示当前服务商；无配置时隐藏。切换后会高亮并提醒你重启 Claude Code 会话
  （可用 `showRestartHint` 关闭）。
- 🖥️ **同步到 CLI** —— 开启 `writeClaudeSettings` 后，活动服务商也会写入 `~/.claude/settings.json`（其
  `env` 键），让在普通终端运行的 `claude`（而不仅是 VS Code 扩展）使用同一服务商。仅修改本扩展管理的键，
  文件其余内容保持不变。
- ⚙️ **切换行为设置** —— 控制每次切换（侧边栏点击、快捷键、循环、菜单）时执行的操作：仅切换
  （`switch`，默认），或切换并立即重新加载窗口（`switchAndReload`），使新会话立刻使用新服务商。
- 📝 **网关提示** —— `Base URL` 看起来像第三方 LLM 网关（非 Anthropic、非 localhost）的服务商，其
  悬停提示会附上关于 Claude Code 在网关上对 `/model` 和 `ANTHROPIC_DEFAULT_*_MODEL` 行为的简短说明。
  其他服务商不受影响。
- 🧪 **额外环境变量** —— 配置编辑器中的*额外环境变量*字段，可添加 Claude Code 读取的任意其他变量
  （如 `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`、`ANTHROPIC_CUSTOM_HEADERS`），无需手动编辑 `settings.json`。
- 🔄 **切换并重新加载** —— 专用的 *切换服务商并重新加载窗口* 命令（右键点击服务商或命令面板）始终一步
  完成切换与重载，不受设置影响。
- ∞ **配置数量不限**（快捷键覆盖前 10 个槽位，其余通过侧边栏/菜单切换）。

### 快速开始

1. 安装本扩展和 [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) 扩展。
2. 从活动栏打开 **Claude Providers** 视图（圆点图标），点击 **+ Add provider**，选择一个**模板** ——
   *Custom*（空白）、*Claude Subscription*、*Claude API*、内置的 **Anthropic 兼容服务商**（DeepSeek、
   Kimi、MiniMax、Qwen、Z.ai 等）或**本地服务**（Ollama、LM Studio、llama.cpp、vLLM）：Base URL（以及
   固定的模型映射）会自动填好，你只需填入自己的 API 密钥。所有字段仍可编辑（见下方
   [配置字段](#配置字段)）；Base URL 留空 = 原生订阅。
3. 用配置的**快捷键**、**菜单**或侧边栏 ▶ 按钮切换。
4. **启动新的 Claude Code 会话**（新对话 / 重载窗口）使其生效 —— Claude Code 在会话启动时读取环境变量，
   不会实时刷新。

### 管理服务商（侧边栏）

| 操作 | 位置 |
| --- | --- |
| **添加** | 视图标题栏的 `+` → 选择模板（Custom / Claude Subscription / Claude API / 内置服务商），再填入密钥；自动分配下一个空闲快捷键 |
| **切换到** | 行内 ▶ |
| **测试连接** | 行内 ⚡ 或右键 → *Test connection* |
| **编辑** | 行内 ✎ 或右键 → *Edit* |
| **删除** | 行内 🗑 或右键 → *Delete*（删除当前项会切到第一个剩余项；删除最后一个会重置为订阅） |
| **复制 / 上移 / 下移** | 右键菜单 |
| **管理自定义服务商** | 视图标题栏「…」菜单 → *Manage custom providers…*，或 *Add provider* 菜单底部项（为不在内置列表中的服务商打开表格编辑器） |
| **导入 / 导出** | 视图标题栏的「…」菜单 |

当前服务商以实心圆点标记。编辑是逐字段进行的：选择字段、填值、重复，最后 *Done*。**颜色**与**快捷键**
都从下拉列表选择 —— 无需记任何代码。

### 添加内置列表中没有的服务商

**Add provider** 菜单自带一份内置目录（从打包的 `providers.json` 加载），但你也可以添加自己的。运行
**Manage custom providers…** —— 从 *Add provider* 菜单（底部项）、视图标题栏「…」菜单或命令面板 ——
打开一个**表格编辑器**：

| 列 | 含义 |
| --- | --- |
| **Name** | 在 *Add provider* 菜单中显示的名称。 |
| **Base URL** | 服务商 Anthropic 兼容端点的 `ANTHROPIC_BASE_URL`。留空表示「订阅式」条目。 |
| **Local** | 将其列在 *Local servers* 而非 *Anthropic-compatible providers* 下。 |
| **Icon** | 可选：`media/providers/` 下的标志文件，或 VS Code codicon id（如 `server`）。 |
| **Opus / Sonnet / Haiku model** | 可选的档位→模型默认值，会预填到新配置中。 |

点击 **+ Add provider**，填好一行，然后 **Save**。你的服务商会以 `(custom)` 标记出现在 *Add provider*
菜单中，其端点也会像内置项一样用于标志匹配和健康检测。该表格与 `claudeProviderSwitcher.customProviders`
设置一一对应，你也可以直接编辑该 JSON。**这里不填密钥** —— 选择服务商后在每个配置中单独添加（保存在
SecretStorage 中）。

### 快捷键

- 按配置分配。**添加**时默认取下一个空闲的 `Ctrl+Alt+<n>`；随时可在 **Edit → Hotkey** 修改（或设为 *None*）。
- 扩展会自动同步你的**用户 `keybindings.json`**（只管理自己的 `claudeProviderSwitcher.switchToIndex`
  条目，绝不触碰你的其他快捷键）。

### 配置字段

| 字段 | 含义 |
| --- | --- |
| **Name** | 显示在菜单、侧边栏和状态栏。 |
| **Badge** | 彩色图形（🟢🔵🟣🟡🟠🟩🟦🔷…），从列表选择；添加时自动分配。（服务商**标志**显示在 Add 菜单和悬停提示中。） |
| **Hotkey** | 可选的 `Ctrl+Alt+<n>` 快捷键，添加时自动分配。 |
| `ANTHROPIC_BASE_URL` | Anthropic 兼容端点。**留空 = 原生订阅。** |
| `ANTHROPIC_AUTH_TOKEN` | 第三方端点的 API 密钥。**存储在 SecretStorage** 中，而非 `settings.json`；编辑器中以掩码显示。 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` / `…_SONNET_MODEL` / `…_HAIKU_MODEL` | Opus/Sonnet/Haiku 档位映射到的模型。 |
| `API_TIMEOUT_MS` | （可选）请求超时（毫秒）。 |
| **额外环境变量** | （可选）Claude Code 读取的任意其他变量 —— 如 `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY`、`ANTHROPIC_CUSTOM_HEADERS`。在小列表中添加/编辑/删除；上方已有专门字段的键会被拒绝。 |

> 在 Claude Code 内部仍可用 `/model` 切换档位。

#### 什么时候真的需要额外环境变量？

大多数场景都用不到 —— 专用字段已覆盖常见需求。*额外环境变量*字段是为第三方端点和网关准备的「应急口」，
用于设置 Claude Code 从环境读取的、针对单个服务商的调整。常见的有：

| 变量 | 何时需要 | 为何按服务商设置 |
| --- | --- | --- |
| `MAX_THINKING_TOKENS` = `0` | 网关/模型因 thinking/reasoning 参数拒绝请求（如 `400 thinking options type cannot be disabled when reasoning_effort is set`）。设为 `0` 关闭 thinking。 | 取决于具体网关/模型 |
| `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING` = `1` | 旧模型（Opus 4.6 / Sonnet 4.6）上同理 —— 恢复固定 thinking 预算。 | 取决于模型 |
| `ANTHROPIC_CUSTOM_HEADERS` | 端点需要额外 HTTP 头（第二个令牌、tenant id、路由提示）。格式：`Header-Name: value`（多个用换行分隔）。 | 各网关各不相同 |
| `DISABLE_PROMPT_CACHING` = `1` | 端点不理解 `cache_control`，对缓存请求报错。 | 该服务商的特性 |
| `ANTHROPIC_CUSTOM_MODEL_OPTION`（+ `…_NAME`、`…_DESCRIPTION`） | 向 `/model` picker 添加 discovery 不会列出的模型 id（如非 `claude` 命名的网关模型）。 | 取决于网关的模型 id |
| `ANTHROPIC_DEFAULT_OPUS_MODEL_NAME` / `…_DESCRIPTION` | 给固定的网关模型在 `/model` picker 里一个友好名称。 | 外观，按网关 |
| `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY` = `1` | 在 `/model` 中列出网关 `/v1/models` 里的*其他*模型。你的三个档位模型已作为 Custom Opus/Sonnet/Haiku 出现在 picker 中 —— 这只用于其余目录，且**只添加 id 以 `claude`/`anthropic` 开头的模型**（对 DeepSeek/MiniMax/GLM 之类的名称无效，请用 `ANTHROPIC_DEFAULT_*_MODEL`）。很少需要。 | 按网关，可选 |

> 这些在**下一个** Claude Code 会话生效（新建对话或重新加载窗口）。它们不会改变*恢复的*会话 ——
> 后者沿用其已保存 transcript 中的模型与设置。

### 服务商示例（用自己的密钥替换 `YOUR_*_KEY`）

- **原生 Claude 订阅** —— 所有字段留空（Base URL 为空）。
- **DeepSeek：** Base URL `https://api.deepseek.com/anthropic`，令牌 `YOUR_DEEPSEEK_API_KEY`，
  Opus/Sonnet/Haiku = `deepseek-v4-pro` / `deepseek-v4-flash` / `deepseek-v4-flash`。
- **MiniMax：** Base URL `https://api.minimax.io/anthropic`，令牌 `YOUR_MINIMAX_API_KEY`，
  Opus/Sonnet/Haiku = `MiniMax-M3` / `MiniMax-M3` / `MiniMax-M2.7`。
- **本地 LM Studio：** Base URL `http://localhost:1234`，令牌 `lmstudio`，模型 = `http://localhost:1234/v1/models`
  返回的精确 `id`（启动服务：*Developer → Start Server*）。
- **自建网关：** Base URL `https://your-gateway.example`，令牌 `YOUR_GATEWAY_KEY`，模型 = 你网关的模型别名。

### 设置项

| 设置 | 默认 | 说明 |
| --- | --- | --- |
| `claudeProviderSwitcher.profiles` | `[]` | 服务商配置 `{ name, color?, hotkey?, env }`，通过侧边栏管理。 |
| `claudeProviderSwitcher.customProviders` | `[]` | 添加到 **Add provider** 菜单的自定义服务商 `{ name, baseUrl?, local?, icon?, opusModel?, sonnetModel?, haikuModel? }`，用于添加内置列表中没有的服务商；可在设置界面以表格形式编辑。 |
| `claudeProviderSwitcher.language` | `auto` | 扩展自身界面（菜单、通知、侧边栏、状态栏、自定义服务商表格）的语言：`auto` / `en` / `ru` / `zh`。`auto` 跟随 VS Code，回退到英语。实时切换。 |
| `claudeProviderSwitcher.showStatusBarItem` | `true` | 在状态栏显示当前服务商指示器。 |
| `claudeProviderSwitcher.switchAction` | `switch` | 每次切换（侧边栏点击、快捷键、循环、菜单）时执行的操作：`switch` —— 切换后提醒重启会话；`switchAndReload` —— 切换后立即重新加载窗口，使新会话使用新服务商。 |
| `claudeProviderSwitcher.writeClaudeSettings` | `false` | 同时将活动服务商写入 Claude Code **CLI** 配置 `~/.claude/settings.json`（`env` 键），让普通终端中的 `claude` 使用同一服务商。仅修改本扩展管理的键，文件其余内容保持不变。活动 API 密钥会以明文写入该文件。 |
| `claudeProviderSwitcher.showRestartHint` | `true` | 切换后高亮状态栏项并提醒 Claude Code 会话需要重启（新建对话 / 重新加载窗口）才能生效。重载窗口后清除。 |

### 说明

- **切换后请开始新会话。** Claude Code 在会话启动时读取 `claudeCode.environmentVariables`，而非实时刷新
  —— 因此切换后请**新建对话**。*恢复的*对话（以及会恢复对话的窗口重载）会沿用其已保存 transcript 中的
  模型与设置，所以仅重载窗口可能无法应用模型变更。可将 `claudeProviderSwitcher.switchAction` 设为
  `switchAndReload`，或使用 *切换服务商并重新加载窗口* 命令来自动重载 —— 但可靠地应用服务商/模型变更的方式
  是新建对话。
- 第三方端点优先用 **`ANTHROPIC_AUTH_TOKEN`** 而非 `ANTHROPIC_API_KEY`（Bearer 头）。
- **本地服务**（Ollama、LM Studio、llama.cpp、vLLM）：预设会填好 Base URL 和一个占位令牌 —— 请把**模型**
  设为你已加载模型的 id。对于 **llama.cpp**，启动 `llama-server` 时要加 **`--jinja`**，否则工具调用无法
  工作，Claude Code 会不再像智能体一样运行。
- 推理类模型在 `max_tokens` 过小时可能返回空的最终消息（token 都用于推理）—— 这是服务商行为，与本扩展无关。

---

## Privacy / Конфиденциальность / 隐私

This extension stores nothing remotely and bundles no credentials. It reads
`claudeProviderSwitcher.profiles`, keeps API keys in VS Code **SecretStorage** (not `settings.json`),
writes `claudeCode.environmentVariables` (including the active provider's key, which Claude Code reads
there), and manages its own entries in your `keybindings.json`. *Test connection* sends one request
to the endpoint you configured — nowhere else. · Расширение ничего не хранит удалённо и не содержит
ключей. Оно читает `claudeProviderSwitcher.profiles`, хранит API-ключи в **SecretStorage** VS Code (а
не в `settings.json`), пишет `claudeCode.environmentVariables` (включая ключ активного провайдера,
откуда его читает Claude Code) и ведёт свои записи в `keybindings.json`. *Проверка соединения*
отправляет один запрос только на указанный тобой эндпоинт. · 本扩展不在远端存储任何内容，也不附带凭据。它读取
`claudeProviderSwitcher.profiles`，将 API 密钥保存在 VS Code **SecretStorage**（而非 `settings.json`），
写入 `claudeCode.environmentVariables`（含当前服务商的密钥，Claude Code 在此读取），并维护 `keybindings.json`
中属于自己的条目。*测试连接* 仅向你配置的端点发送一个请求。

## Trademarks / Товарные знаки / 商标

Provider names and logos (DeepSeek, MiniMax, Qwen, Z.ai, Vercel, Poe, …) are trademarks of their
respective owners and are used here **for identification only**. This extension is **independent and
not affiliated with, endorsed by, or sponsored by** any of these providers. ·
Названия и логотипы провайдеров (DeepSeek, MiniMax, Qwen, Z.ai, Vercel, Poe и др.) — товарные знаки
их владельцев и используются **только для идентификации**. Расширение **независимо и не
аффилировано** ни с одним из провайдеров, не одобрено и не спонсируется ими. ·
各服务商名称与标志（DeepSeek、MiniMax、Qwen、Z.ai、Vercel、Poe 等）为其各自所有者的商标，此处**仅用于
标识**。本扩展**独立运作，与上述任何服务商无隶属、背书或赞助关系**。

## License

MIT