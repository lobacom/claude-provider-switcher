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

---

<a id="english"></a>

## English

### Features

- 🗂️ **Sidebar UI** — a *Claude Providers* view in the Activity Bar to **add / edit / delete /
  duplicate / reorder / switch** providers. No hand-editing `settings.json`.
- ⌨️ **Per-profile hotkey** — each profile can own a shortcut (`Ctrl+Alt+1`…`Ctrl+Alt+9`,
  `Ctrl+Alt+0`). New profiles get the next free slot automatically; the binding is written to your
  `keybindings.json` for you.
- 🎛️ **Menu** — `Claude Provider: Select provider…`, or click the status bar item.
- 🔌 **Status bar indicator** — shows the active provider; hidden when no providers exist.
- ∞ **Unlimited profiles** (hotkeys cover the first 10 slots; the rest are switched via the sidebar/menu).

### Quick start

1. Install this extension and the [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) extension.
2. Open the **Claude Providers** view from the Activity Bar (the dotted icon) and click **+ Add
   provider**. Fill in the fields (see [Profile fields](#profile-fields)). An empty Base URL = native
   subscription.
3. Switch with the profile's **hotkey**, the **menu**, or the sidebar ▶ button.
4. **Start a new Claude Code session** (new chat / Reload Window) so it picks up the change — Claude
   Code reads the environment when a session starts, not live.

### Managing providers (sidebar)

| Action | Where |
| --- | --- |
| **Add** | view title-bar `+` (auto-assigns the next free hotkey) |
| **Switch to** | row ▶ (inline) |
| **Edit** | row ✎ (inline) or right-click → *Edit* |
| **Delete** | row 🗑 (inline) or right-click → *Delete* (deleting the active one switches to the first remaining; deleting the last resets to the subscription) |
| **Duplicate / Move up / Move down** | right-click menu |

The active provider is marked with a filled dot. Editing is field-by-field: pick a field, set its value,
repeat, then *Done*. **Color** and **Hotkey** are chosen from a dropdown — no codes to remember.

### Hotkeys

- Assigned per profile. Defaults to the next free `Ctrl+Alt+<n>` on **Add**; change it anytime via
  **Edit → Hotkey** (or set *None*).
- The extension keeps your **User `keybindings.json`** in sync automatically (it only manages its own
  `claudeProviderSwitcher.switchToIndex` entries and never touches your other shortcuts).

### Profile fields

| Field | Meaning |
| --- | --- |
| **Name** | Shown in the menu, sidebar, and status bar. |
| **Badge** | Optional color dot (🟢🔵🟣🟡🟠…) picked from a list. |
| **Hotkey** | Optional `Ctrl+Alt+<n>` shortcut, auto-assigned on Add. |
| `ANTHROPIC_BASE_URL` | Anthropic-compatible endpoint. **Empty = native subscription.** |
| `ANTHROPIC_AUTH_TOKEN` | API key for third-party endpoints (sent as a **Bearer** token). |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` / `…_SONNET_MODEL` / `…_HAIKU_MODEL` | Models the Opus/Sonnet/Haiku tiers map to. |
| `API_TIMEOUT_MS` | (optional) Request timeout in ms. |

> Inside Claude Code you can still switch tiers with `/model`.

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
| `claudeProviderSwitcher.showStatusBarItem` | `true` | Show the active-provider indicator in the status bar. |

### Notes

- **Restart the session after switching.** Claude Code reads `claudeCode.environmentVariables` when a
  session starts — switch, then open a new chat or reload the window.
- Prefer **`ANTHROPIC_AUTH_TOKEN`** over `ANTHROPIC_API_KEY` for third-party endpoints (Bearer header).
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
- ⌨️ **Хоткей на профиль** — у каждого профиля своя комбинация (`Ctrl+Alt+1`…`Ctrl+Alt+9`,
  `Ctrl+Alt+0`). Новому профилю автоматически выдаётся ближайший свободный слот; биндинг сам
  прописывается в твой `keybindings.json`.
- 🎛️ **Меню** — `Claude Provider: Select provider…` или клик по индикатору.
- 🔌 **Индикатор** активного провайдера в статус-баре; прячется, когда профилей нет.
- ∞ **Без лимита на число профилей** (хоткеи покрывают первые 10 слотов; остальные — через
  сайдбар/меню).

### Быстрый старт

1. Установи это расширение и [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code).
2. Открой панель **Claude Providers** в Activity Bar (иконка из точек) → **+ Add provider**. Заполни
   поля (см. [Поля профиля](#поля-профиля)). Пустой Base URL = нативная подписка.
3. Переключайся **хоткеем** профиля, через **меню** или кнопкой ▶ в сайдбаре.
4. **Запусти новую сессию Claude Code** (новый чат / Reload Window) — переменные читаются при старте
   сессии, не на лету.

### Управление провайдерами (сайдбар)

| Действие | Где |
| --- | --- |
| **Add** | кнопка `+` в шапке панели (сразу выдаёт ближайший свободный хоткей) |
| **Switch to** | ▶ в строке |
| **Edit** | ✎ в строке или ПКМ → *Edit* |
| **Delete** | 🗑 в строке или ПКМ → *Delete* (удаление активного → переключение на первого оставшегося; удаление последнего → сброс на подписку) |
| **Duplicate / Move up / Move down** | контекстное меню (ПКМ) |

Активный провайдер помечен закрашенной точкой. Редактирование — по полям: выбрал поле, задал значение,
повторил, потом *Done*. **Color** и **Hotkey** выбираются из списка — никаких кодов запоминать не надо.

### Хоткеи

- Назначаются на профиль. При **Add** ставится ближайший свободный `Ctrl+Alt+<n>`; сменить можно в любой
  момент через **Edit → Hotkey** (или *None*).
- Расширение само поддерживает твой **User `keybindings.json`** в актуальном виде (трогает только свои
  записи `claudeProviderSwitcher.switchToIndex`, чужие шорткаты не задевает).

### Поля профиля

| Поле | Смысл |
| --- | --- |
| **Name** | Имя в меню, сайдбаре и статус-баре. |
| **Badge** | Необязательный цветной кружок (🟢🔵🟣🟡🟠…) из списка. |
| **Hotkey** | Необязательный `Ctrl+Alt+<n>`, авто-назначается при Add. |
| `ANTHROPIC_BASE_URL` | Anthropic-совместимый эндпоинт. **Пусто = нативная подписка.** |
| `ANTHROPIC_AUTH_TOKEN` | Ключ для сторонних эндпоинтов (отправляется как **Bearer**). |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` / `…_SONNET_MODEL` / `…_HAIKU_MODEL` | На какие модели мапятся уровни Opus/Sonnet/Haiku. |
| `API_TIMEOUT_MS` | (необязательно) таймаут запроса в мс. |

> Внутри Claude Code уровни можно менять командой `/model`.

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
| `claudeProviderSwitcher.showStatusBarItem` | `true` | Показывать индикатор активного провайдера в статус-баре. |

### Заметки

- **После переключения перезапусти сессию.** Claude Code читает `claudeCode.environmentVariables` при
  старте сессии — переключись, затем открой новый чат или перезагрузи окно.
- Для сторонних эндпоинтов используй **`ANTHROPIC_AUTH_TOKEN`**, не `ANTHROPIC_API_KEY` (заголовок Bearer).
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
- ⌨️ **每个配置独立快捷键**（`Ctrl+Alt+1`…`Ctrl+Alt+9`、`Ctrl+Alt+0`）。新配置自动分配下一个空闲槽位；
  快捷键会自动写入你的 `keybindings.json`。
- 🎛️ **菜单** —— `Claude Provider: Select provider…`，或点击状态栏项。
- 🔌 **状态栏指示器** —— 显示当前服务商；无配置时隐藏。
- ∞ **配置数量不限**（快捷键覆盖前 10 个槽位，其余通过侧边栏/菜单切换）。

### 快速开始

1. 安装本扩展和 [Claude Code](https://marketplace.visualstudio.com/items?itemName=anthropic.claude-code) 扩展。
2. 从活动栏打开 **Claude Providers** 视图（圆点图标），点击 **+ Add provider**，填写字段（见下方
   [配置字段](#配置字段)）。Base URL 留空 = 原生订阅。
3. 用配置的**快捷键**、**菜单**或侧边栏 ▶ 按钮切换。
4. **启动新的 Claude Code 会话**（新对话 / 重载窗口）使其生效 —— Claude Code 在会话启动时读取环境变量，
   不会实时刷新。

### 管理服务商（侧边栏）

| 操作 | 位置 |
| --- | --- |
| **添加** | 视图标题栏的 `+`（自动分配下一个空闲快捷键） |
| **切换到** | 行内 ▶ |
| **编辑** | 行内 ✎ 或右键 → *Edit* |
| **删除** | 行内 🗑 或右键 → *Delete*（删除当前项会切到第一个剩余项；删除最后一个会重置为订阅） |
| **复制 / 上移 / 下移** | 右键菜单 |

当前服务商以实心圆点标记。编辑是逐字段进行的：选择字段、填值、重复，最后 *Done*。**颜色**与**快捷键**
都从下拉列表选择 —— 无需记任何代码。

### 快捷键

- 按配置分配。**添加**时默认取下一个空闲的 `Ctrl+Alt+<n>`；随时可在 **Edit → Hotkey** 修改（或设为 *None*）。
- 扩展会自动同步你的**用户 `keybindings.json`**（只管理自己的 `claudeProviderSwitcher.switchToIndex`
  条目，绝不触碰你的其他快捷键）。

### 配置字段

| 字段 | 含义 |
| --- | --- |
| **Name** | 显示在菜单、侧边栏和状态栏。 |
| **Badge** | 可选的彩色圆点（🟢🔵🟣🟡🟠…），从列表选择。 |
| **Hotkey** | 可选的 `Ctrl+Alt+<n>` 快捷键，添加时自动分配。 |
| `ANTHROPIC_BASE_URL` | Anthropic 兼容端点。**留空 = 原生订阅。** |
| `ANTHROPIC_AUTH_TOKEN` | 第三方端点的 API 密钥（以 **Bearer** 令牌发送）。 |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` / `…_SONNET_MODEL` / `…_HAIKU_MODEL` | Opus/Sonnet/Haiku 档位映射到的模型。 |
| `API_TIMEOUT_MS` | （可选）请求超时（毫秒）。 |

> 在 Claude Code 内部仍可用 `/model` 切换档位。

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
| `claudeProviderSwitcher.showStatusBarItem` | `true` | 在状态栏显示当前服务商指示器。 |

### 说明

- **切换后请重启会话。** Claude Code 在会话启动时读取 `claudeCode.environmentVariables` —— 切换后新建
  对话或重载窗口。
- 第三方端点优先用 **`ANTHROPIC_AUTH_TOKEN`** 而非 `ANTHROPIC_API_KEY`（Bearer 头）。
- 推理类模型在 `max_tokens` 过小时可能返回空的最终消息（token 都用于推理）—— 这是服务商行为，与本扩展无关。

---

## Privacy / Конфиденциальность / 隐私

This extension stores nothing remotely and bundles no credentials. It reads
`claudeProviderSwitcher.profiles`, writes `claudeCode.environmentVariables`, and manages its own
entries in your `keybindings.json`. · Расширение ничего не хранит удалённо и не содержит ключей. Оно
читает `claudeProviderSwitcher.profiles`, пишет `claudeCode.environmentVariables` и ведёт свои записи
в `keybindings.json`. · 本扩展不在远端存储任何内容，也不附带凭据。它读取 `claudeProviderSwitcher.profiles`、
写入 `claudeCode.environmentVariables`，并维护 `keybindings.json` 中属于自己的条目。

## License

MIT