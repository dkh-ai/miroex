# MiroEx — Miro Board Reader for Claude Code

MCP-сервер, который превращает Miro-доски в машиночитаемый формат. Извлекает элементы доски через Miro REST API, кластеризует их пространственно и предоставляет Claude'у набор tools для навигации и извлечения знаний.

## Возможности

- **6 MCP tools** для навигации по доске: обзор, фреймы, кластеры, связи, поиск, полная сериализация
- **Пространственная кластеризация** — группировка элементов по близости (DBSCAN)
- **Текстовая сериализация** — доска в структурированный текст для LLM
- **Кэширование** — in-memory cache с TTL 5 минут
- **Read-only** — только чтение, без изменения досок

## Требования

- Node.js 18+
- Miro API token (scope: `boards:read`)

## Установка

```bash
cd ~/projects/miroex
npm install
npm run build
```

## Получение Miro API token

1. Перейти на https://miro.com/app/settings/user-profile/apps
2. Создать новое приложение (или использовать существующее)
3. Дать scope `boards:read`
4. Скопировать access token

## Подключение к Claude Code

```bash
claude mcp add miroex -e MIRO_API_TOKEN=<your-token> -- npx tsx /Users/khrupov/projects/miroex/src/index.ts
```

Проверка:
```bash
claude mcp list
```

## Доступные tools

| Tool | Описание |
|------|----------|
| `miro_read_board` | Обзор доски: метаданные, статистика, список фреймов |
| `miro_get_frame_content` | Содержимое фрейма с кластерами и связями |
| `miro_get_clusters` | Пространственные кластеры всех элементов |
| `miro_get_connections` | Граф коннекторов с контекстом |
| `miro_search` | Текстовый поиск по содержимому |
| `miro_get_board_as_text` | Полная сериализация доски в текст |

## Примеры использования

В Claude Code:
```
Прочитай доску miro с id uXjVOpTa57Q и извлеки все решения
```

```
Покажи граф связей на доске o9J_lE-o5AY
```

```
Найди на доске uXjVPbD1awU всё, что связано с "архитектура"
```

## Разработка

```bash
npm run dev    # Запуск в dev-режиме (tsx)
npm run build  # Компиляция TypeScript
npm start      # Запуск скомпилированной версии
```
