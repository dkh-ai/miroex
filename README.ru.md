# MiroEx — Чтение Miro-досок для LLM

[English version](README.md)

MCP-сервер, который превращает Miro-доски в структурированный машиночитаемый текст. Извлекает элементы доски через Miro REST API, кластеризует их пространственно и предоставляет Claude набор tools для навигации и извлечения знаний. Включает визуальный SVG-рендерер, анализ досок через GPT-4o и интерактивный CLI.

## Возможности

- **6 MCP tools** для навигации по доске: обзор, фреймы, кластеры, связи, поиск, полная сериализация
- **Интерактивный CLI** — выбор доски из списка, рендеринг, экспорт, анализ, статистика
- **Пространственная кластеризация** — группировка элементов по близости (DBSCAN)
- **Текстовая сериализация** — доска в структурированный текст для LLM
- **Визуальный рендеринг** — генерация SVG/HTML с интерактивным просмотром (pan/zoom)
- **Анализ досок** — опциональный анализ через GPT-4o с интерактивным чатом (требуется OpenAI API key)
- **Кэширование** — in-memory cache с TTL 5 минут
- **Read-only** — только чтение, без изменения досок

## Требования

- Node.js 18+
- Miro API token (scope: `boards:read`)
- OpenAI API key (опционально, для анализа досок)

## Установка

```bash
git clone https://github.com/dkh-ai/miroex.git
cd miroex
npm install
cp .env.example .env
```

Отредактируйте `.env` и добавьте ваш Miro API token:

```
MIRO_API_TOKEN=your-token-here
```

### Получение Miro API token

1. Перейти на https://miro.com/app/settings/user-profile/apps
2. Создать новое приложение (или использовать существующее)
3. Дать scope `boards:read`
4. Скопировать access token

## Использование

### Claude Code (MCP-сервер)

Зарегистрировать MiroEx как MCP-сервер:

```bash
claude mcp add miroex -e MIRO_API_TOKEN=<your-token> -- npx tsx $(pwd)/src/index.ts
```

Проверка:

```bash
claude mcp list
```

Теперь можно спрашивать Claude о Miro-досках:

```
Прочитай доску miro с id <board_id> и извлеки все решения
```

```
Покажи граф связей на доске <board_id>
```

```
Найди на доске <board_id> всё, что связано с "архитектура"
```

### Интерактивный CLI

```bash
npm run cli
```

Показывает список доступных досок, позволяет выбрать действие:
- **Render (HTML viewer)** — интерактивная визуализация в браузере
- **Render (SVG only)** — векторный файл
- **Export (JSON + text)** — сырые данные + текстовая сериализация + опциональный LLM-анализ
- **Analyze** — анализ через GPT-4o с интерактивным чатом
- **Board info** — статистика по элементам и фреймам

Можно передать board ID или Miro URL напрямую:

```bash
npm run cli -- <board_id>
npm run cli -- https://miro.com/app/board/uXjVN.../
```

### CLI-утилиты

| Команда | Описание |
|---------|----------|
| `npm run cli` | Интерактивное меню |
| `npx tsx src/render.ts <board_id>` | Рендеринг доски в HTML (открывает в браузере) |
| `npx tsx src/render.ts <board_id> --svg-only` | Рендеринг в SVG |
| `npx tsx src/_export.ts <board_id>` | Экспорт данных (JSON + текст + опциональный анализ) |

## MCP Tools

| Tool | Описание |
|------|----------|
| `miro_read_board` | Обзор доски: метаданные, статистика, список фреймов |
| `miro_get_frame_content` | Содержимое фрейма с кластерами и связями |
| `miro_get_clusters` | Пространственные кластеры всех элементов |
| `miro_get_connections` | Граф коннекторов с контекстом |
| `miro_search` | Текстовый поиск по содержимому |
| `miro_get_board_as_text` | Полная сериализация доски в текст |

## Конфигурация

| Переменная | Источник | Описание | Обязательна |
|------------|----------|----------|-------------|
| `MIRO_API_TOKEN` | `.env` или env | Bearer token для Miro API | Да |
| `OPENAI_API_KEY` | `.env` или env | OpenAI API key для анализа досок | Нет |

## Разработка

```bash
npm run dev    # MCP-сервер в dev-режиме (tsx, auto-reload)
npm run build  # Компиляция TypeScript в dist/
npm start      # Запуск скомпилированной версии
npm run render # Визуальный рендеринг (CLI)
npm run cli    # Интерактивное меню
```

## Зависимости

| Пакет | Назначение |
|-------|------------|
| `@modelcontextprotocol/sdk` | MCP protocol — McpServer, StdioServerTransport |
| `@inquirer/prompts` | Интерактивные CLI-промпты (select, input) |
| `openai` | OpenAI API клиент для анализа досок |
| `zod` | Schema validation для MCP tool inputs |
| `dotenv` | Загрузка переменных из `.env` |

## Решение проблем

| Проблема | Решение |
|----------|---------|
| `MIRO_API_TOKEN is not set` | Проверьте `.env` файл или передайте через env: `MIRO_API_TOKEN=xxx npm run cli` |
| MCP-сервер не отвечает | Проверьте `claude mcp list`. Переподключите если нужно. |
| Ошибка прав `boards:read` | Убедитесь что у Miro-приложения есть scope `boards:read` |
| Доска не найдена | Проверьте board ID. Можно использовать полный Miro URL. |
| Анализ не работает | Установите `OPENAI_API_KEY` в `.env`. Анализ опционален. |
| `tsx` не найден | Запустите `npm install` для установки dev-зависимостей |
| Ошибки сборки | Запустите `npm run build` и проверьте ошибки TypeScript |

## Лицензия

MIT
