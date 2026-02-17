# TODO: Планы развития

## Высокий приоритет

- [ ] **LLM-пайплайн в CLI** — полный цикл: fetch → export → анализ через Anthropic API → сохранение insights
  - Добавить шаг `03-analysis.md` и `04-insights.md` в пайплайн экспорта
  - Интеграция с `@anthropic-ai/sdk`
  - Настраиваемые промпты для анализа

- [ ] **Исправить isMain guard в render.ts** — текущая проверка через `import.meta.url.endsWith()` хрупкая
  - Рассмотреть `process.argv[1]` с `path.resolve()` или `fileURLToPath()`

## Средний приоритет

- [ ] **Список недавних досок** — сохранять последние использованные board_id в файл для быстрого доступа в CLI

- [ ] **Поддержка Linux** — заменить `open` на `xdg-open` / кроссплатформенный opener

- [ ] **Rate limit handling** — retry с exponential backoff при 429 от Miro API

## Низкий приоритет

- [ ] **Тесты** — unit-тесты для spatial.ts и serializer.ts (чистые функции, легко тестируются)

- [ ] **Новые типы элементов в SVG** — document, app_card, embed и другие Miro widget types

- [ ] **Фильтрация в CLI** — фильтр досок по имени в интерактивном списке

## Технический долг

- [ ] **_export.ts без guard** — `main()` вызывается безусловно при import (пока не импортируется, но потенциальная проблема)

- [ ] **Дублирование логики** — export в `cli.ts` и `_export.ts` дублируют код записи JSON/text. Вынести в общую функцию

## Идеи на будущее

- Websocket-подписка на изменения доски (Miro API v2 поддерживает webhooks)
- Diff между двумя snapshot'ами доски
- Экспорт в Obsidian markdown (фреймы → заметки, связи → links)
- Генерация Mermaid-диаграмм из коннекторов доски
