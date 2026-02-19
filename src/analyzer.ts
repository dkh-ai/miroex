import OpenAI from "openai";
import { createInterface } from "readline";

const MODEL = "gpt-4o";

const ANALYSIS_SYSTEM_PROMPT = `Ты — аналитик визуальных досок Miro. Тебе дан сериализованный текст доски (фреймы, элементы, связи). Твоя задача — написать структурный анализ доски в формате markdown.

Формат ответа (строго следуй структуре):

# {boardName} — Анализ доски

> Board ID: \`{boardId}\`
> Дата анализа: {сегодняшняя дата YYYY-MM-DD}
> Объём: {items} items, {connectors} connectors, {frames} frames

---

## Что это

2-3 предложения: назначение доски, контекст, автор (если понятно из контента).

---

## Структура доски

По каждому фрейму:
### Фрейм "{название}" (позиция на доске) — N сущностей, M связей

Содержимое: основные элементы, группы, паттерны. Используй списки и подзаголовки для группировки.

Для незафреймленных кластеров — краткое описание.

---

## Граф связей

### Типы отношений (labels на коннекторах)

Таблица: отношение | кол-во | семантика

### Сущности-мосты между фреймами (если есть)

Какие сущности дублируются или связывают разные фреймы.

---

## Цветовая кодировка (если применима)

Таблица: цвет | значение

---

## Статистика

Таблица: метрика | значение

Правила:
- Пиши на русском
- Будь конкретным: цитируй названия элементов из доски
- Не додумывай — описывай только то, что есть в данных
- Не пиши "инсайты" и "рекомендации" — это будет в отдельном документе
- Используй markdown таблицы и списки для наглядности`;

const INSIGHTS_SYSTEM_PROMPT = `Ты — стратегический консультант. Тебе дан сериализованный текст Miro-доски и её структурный анализ. Твоя задача — написать инсайты и рекомендации.

Формат ответа (строго следуй структуре):

# {boardName} — Инсайты и TL;DR

---

## TL;DR

2-3 предложения суммаризация: что это за доска, ключевая ценность, масштаб.

---

## Ключевые инсайты

3-5 пронумерованных инсайтов. Каждый:

### N. Название инсайта

Пояснение: что увидел, почему это важно, какие следствия. Можно использовать схемы из текста (code blocks).

---

## Сильные стороны

Список: что хорошо сделано на доске.

## Слабые стороны / что доработать

Список: что можно улучшить, что отсутствует, что не связано.

---

## Рекомендации

Конкретные шаги: что сделать дальше. 3-5 пунктов.

---

## Статистика

Таблица: метрика | значение

Правила:
- Пиши на русском
- Будь конкретным: ссылайся на элементы доски по имени
- Инсайты должны быть нетривиальными — не пересказывай анализ, а делай выводы
- Рекомендации должны быть actionable
- Учитывай контекст из анализа`;

export interface AnalysisResult {
  analysis: string;
  insights: string;
}

export interface BoardStats {
  items: number;
  connectors: number;
  frames: number;
}

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env or export it.");
  }
  return new OpenAI({ apiKey });
}

export async function analyzeBoard(
  serializedText: string,
  boardName: string,
  boardId: string,
  stats: BoardStats,
): Promise<AnalysisResult> {
  const openai = getOpenAI();

  const context = `Board name: ${boardName}\nBoard ID: ${boardId}\nItems: ${stats.items}, Connectors: ${stats.connectors}, Frames: ${stats.frames}\n\n${serializedText}`;

  // Step 1: Analysis
  console.log("\nGenerating analysis...");
  const analysisResponse = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      { role: "user", content: context },
    ],
    temperature: 0.3,
  });
  const analysis = analysisResponse.choices[0].message.content ?? "";

  // Step 2: Insights (gets analysis as context)
  console.log("Generating insights...");
  const insightsResponse = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: INSIGHTS_SYSTEM_PROMPT },
      {
        role: "user",
        content: `## Сериализованная доска\n\n${serializedText}\n\n## Структурный анализ\n\n${analysis}`,
      },
    ],
    temperature: 0.4,
  });
  const insights = insightsResponse.choices[0].message.content ?? "";

  return { analysis, insights };
}

const CHAT_SYSTEM_PROMPT = `Ты — эксперт по анализу Miro-досок. Пользователь задаёт вопросы о конкретной доске. У тебя есть:
1. Полный сериализованный текст доски (все элементы, связи, фреймы)
2. Структурный анализ доски
3. Инсайты и рекомендации

Отвечай на русском, конкретно, со ссылками на элементы доски. Если не можешь найти ответ в данных — скажи об этом.`;

export async function chatAboutBoard(
  serializedText: string,
  analysis: string,
  insights: string,
): Promise<void> {
  const openai = getOpenAI();

  const systemContent = `${CHAT_SYSTEM_PROMPT}\n\n## Сериализованная доска\n\n${serializedText}\n\n## Анализ\n\n${analysis}\n\n## Инсайты\n\n${insights}`;

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
  ];

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = (prompt: string): Promise<string> =>
    new Promise((resolve) => rl.question(prompt, resolve));

  console.log('\nChat about this board. Type "exit" or press Enter on empty line to quit.\n');

  try {
    while (true) {
      const userInput = await ask("You: ");
      const trimmed = userInput.trim();

      if (!trimmed || trimmed === "exit" || trimmed === "quit") {
        break;
      }

      messages.push({ role: "user", content: trimmed });

      const stream = await openai.chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.3,
        stream: true,
      });

      process.stdout.write("\nAssistant: ");
      let fullResponse = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        process.stdout.write(delta);
        fullResponse += delta;
      }
      process.stdout.write("\n\n");

      messages.push({ role: "assistant", content: fullResponse });
    }
  } finally {
    rl.close();
  }

  console.log("Chat ended.");
}
