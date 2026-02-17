# MiroEx — Miro Board Reader for Claude Code

MCP-сервер, который превращает Miro-доски в машиночитаемый формат. Извлекает элементы доски через Miro REST API, кластеризует их пространственно и предоставляет Claude'у набор tools для навигации и извлечения знаний. Включает визуальный SVG-рендерер и интерактивный CLI.

## Возможности

- **6 MCP tools** для навигации по доске: обзор, фреймы, кластеры, связи, поиск, полная сериализация
- **Интерактивный CLI** — выбор доски из списка, рендеринг, экспорт, просмотр статистики
- **Пространственная кластеризация** — группировка элементов по близости (DBSCAN)
- **Текстовая сериализация** — доска в структурированный текст для LLM
- **Визуальный рендеринг** — генерация SVG/HTML с интерактивным просмотром (pan/zoom)
- **Кэширование** — in-memory cache с TTL 5 минут
- **Read-only** — только чтение, без изменения досок

## Требования

- Node.js 18+
- Miro API token (scope: `boards:read`)

## Установка

```bash
cd ~/projects/miroex
npm install
```

## Настройка

### Получение Miro API token

1. Перейти на https://miro.com/app/settings/user-profile/apps
2. Создать новое приложение (или использовать существующее)
3. Дать scope `boards:read`
4. Скопировать access token

### Конфигурация

```bash
# Создать .env файл
echo "MIRO_API_TOKEN=<your-token>" > .env
```

| Параметр | Источник | Описание |
|----------|----------|----------|
| `MIRO_API_TOKEN` | `.env` или env var | Bearer token для Miro API (обязателен) |

## Использование

### Интерактивный CLI

```bash
npm run cli
```

Показывает список доступных досок, позволяет выбрать действие:
- Render (HTML viewer) — интерактивная визуализация в браузере
- Render (SVG only) — векторный файл
- Export (JSON + text) — сырые данные + текстовая сериализация
- Board info — статистика по элементам и фреймам

Можно передать board ID напрямую:
```bash
npm run cli -- <board_id>
npm run cli -- https://miro.com/app/board/uXjVN.../
```

### Подключение к Claude Code (MCP)

```bash
claude mcp add miroex -e MIRO_API_TOKEN=<your-token> -- npx tsx /Users/khrupov/projects/miroex/src/index.ts
```

Проверка:
```bash
claude mcp list
```

### Доступные MCP tools

| Tool | Описание |
|------|----------|
| `miro_read_board` | Обзор доски: метаданные, статистика, список фреймов |
| `miro_get_frame_content` | Содержимое фрейма с кластерами и связями |
| `miro_get_clusters` | Пространственные кластеры всех элементов |
| `miro_get_connections` | Граф коннекторов с контекстом |
| `miro_search` | Текстовый поиск по содержимому |
| `miro_get_board_as_text` | Полная сериализация доски в текст |

### Примеры запросов в Claude Code

```
Прочитай доску miro с id uXjVOpTa57Q и извлеки все решения
```

```
Покажи граф связей на доске o9J_lE-o5AY
```

```
Найди на доске uXjVPbD1awU всё, что связано с "архитектура"
```

### CLI-утилиты

| Команда | Описание |
|---------|----------|
| `npm run cli` | Интерактивное меню (выбор доски, действия) |
| `npx tsx src/render.ts <board_id>` | Визуальный рендеринг доски в HTML |
| `npx tsx src/render.ts <board_id> --svg-only` | Рендеринг в SVG |
| `npx tsx src/_export.ts <board_id>` | Экспорт данных (JSON + текст) |

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
| `zod` | Schema validation для MCP tool inputs |
| `dotenv` | Загрузка переменных из `.env` |
