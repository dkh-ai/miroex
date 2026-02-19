# Interactive CLI for MiroEx — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an interactive CLI (`src/cli.ts`) with inquirer menus for board selection and actions (render, export, info).

**Architecture:** Single new file `src/cli.ts` using `@inquirer/prompts` for interactive UI. Reuses existing MiroClient, renderer, and serializer. Minor changes to `miro-client.ts` (add `listBoards()`) and `render.ts` (export `wrapHtml()`).

**Tech Stack:** TypeScript, `@inquirer/prompts`, existing MiroEx modules

---

### Task 1: Install dependency and add npm script

**Files:**
- Modify: `package.json`

**Step 1: Install @inquirer/prompts**

Run: `cd . && npm install @inquirer/prompts`

**Step 2: Add cli script to package.json**

In `package.json`, add to `"scripts"`:
```json
"cli": "tsx src/cli.ts"
```

**Step 3: Verify install**

Run: `cd . && npm ls @inquirer/prompts`
Expected: `@inquirer/prompts@...` listed

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "Add @inquirer/prompts dependency and cli script"
```

---

### Task 2: Add `listBoards()` to MiroClient

**Files:**
- Modify: `src/miro-client.ts:77-171` (MiroClient class)

**Step 1: Add `listBoards()` method**

Add after `getBoardInfo()` method (line ~133), before `getBoardData()`:

```typescript
async listBoards(): Promise<MiroBoard[]> {
  return this.fetchAllPages<MiroBoard>(
    `${BASE_URL}/v2/boards?sort=last_modified&limit=50`
  );
}
```

Note: Uses existing `fetchAllPages()` with `MiroPaginatedResponse<MiroBoard>` — same pagination format as items/connectors.

**Step 2: Verify TypeScript compiles**

Run: `cd . && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/miro-client.ts
git commit -m "Add listBoards() method to MiroClient"
```

---

### Task 3: Export `wrapHtml()` from render.ts

**Files:**
- Modify: `src/render.ts:31`

**Step 1: Make wrapHtml exported**

Change line 31 from:
```typescript
function wrapHtml(svgContent: string, boardName: string): string {
```
to:
```typescript
export function wrapHtml(svgContent: string, boardName: string): string {
```

**Step 2: Verify TypeScript compiles**

Run: `cd . && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/render.ts
git commit -m "Export wrapHtml() for reuse in CLI"
```

---

### Task 4: Create `src/cli.ts` — board selection

**Files:**
- Create: `src/cli.ts`

**Step 1: Create cli.ts with board selection logic**

```typescript
import "dotenv/config";
import { select, input } from "@inquirer/prompts";
import { MiroClient } from "./miro-client.js";
import { renderBoardToSvg } from "./svg-renderer.js";
import { wrapHtml } from "./render.js";
import { serializeBoard } from "./serializer.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { BoardCache } from "./types.js";

const MANUAL_ENTRY = "__manual__";

function parseBoardId(raw: string): string {
  // Handle full Miro URLs: https://miro.com/app/board/uXjVN.../
  const urlMatch = raw.match(/board\/([^/?]+)/);
  if (urlMatch) return urlMatch[1];
  // Handle plain IDs (with or without = suffix)
  return raw.trim();
}

async function selectBoard(miro: MiroClient): Promise<string> {
  console.log("\nLoading boards...");
  let boards: { id: string; name: string }[] = [];
  try {
    boards = await miro.listBoards();
  } catch {
    console.log("Could not load board list. Enter ID manually.\n");
    const raw = await input({ message: "Board ID or URL:" });
    return parseBoardId(raw);
  }

  const choices = [
    ...boards.map((b) => ({ name: b.name, value: b.id })),
    { name: "── Enter board ID or URL ──", value: MANUAL_ENTRY },
  ];

  const selected = await select({ message: "Select a board:", choices });

  if (selected === MANUAL_ENTRY) {
    const raw = await input({ message: "Board ID or URL:" });
    return parseBoardId(raw);
  }

  return selected;
}

async function selectAction(): Promise<string> {
  return select({
    message: "Action:",
    choices: [
      { name: "Render (HTML viewer)", value: "render-html" },
      { name: "Render (SVG only)", value: "render-svg" },
      { name: "Export (JSON + text)", value: "export" },
      { name: "Board info", value: "info" },
    ],
  });
}

async function runAction(action: string, cache: BoardCache): Promise<void> {
  const boardName = cache.board.name;
  const safeId = cache.board.id;
  const safeName = boardName.replace(/[/\\?%*:|"<>]/g, "_");

  switch (action) {
    case "render-html": {
      const svg = renderBoardToSvg(cache.items, cache.connectors, boardName);
      const html = wrapHtml(svg, boardName);
      const outPath = `board-${safeId}.html`;
      writeFileSync(outPath, html);
      console.log(`Saved: ${outPath}`);
      if (process.platform === "darwin") {
        try { execSync(`open "${outPath}"`); } catch {}
      }
      break;
    }
    case "render-svg": {
      const svg = renderBoardToSvg(cache.items, cache.connectors, boardName);
      const outPath = `board-${safeId}.svg`;
      writeFileSync(outPath, svg);
      console.log(`Saved: ${outPath}`);
      if (process.platform === "darwin") {
        try { execSync(`open "${outPath}"`); } catch {}
      }
      break;
    }
    case "export": {
      const outDir = join("output", safeName);
      mkdirSync(outDir, { recursive: true });
      const rawPath = join(outDir, "01-raw-data.json");
      writeFileSync(rawPath, JSON.stringify(cache, null, 2));
      console.log(`Raw data: ${rawPath}`);
      const text = serializeBoard(cache);
      const textPath = join(outDir, "02-serialized.txt");
      writeFileSync(textPath, text);
      console.log(`Serialized: ${textPath} (${text.length.toLocaleString()} chars)`);
      break;
    }
    case "info": {
      const { items, connectors } = cache;
      const frames = items.filter((i) => i.type === "frame");
      console.log(`\nBoard: ${boardName}`);
      console.log(`Items: ${items.length}  Connectors: ${connectors.length}  Frames: ${frames.length}`);
      const types = new Map<string, number>();
      for (const i of items) types.set(i.type, (types.get(i.type) ?? 0) + 1);
      for (const [type, count] of [...types.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${type}: ${count}`);
      }
      if (frames.length > 0) {
        console.log("\nFrames:");
        for (const f of frames) {
          const childCount = items.filter((i) => i.parent?.id === f.id).length;
          console.log(`  ${f.data?.title ?? f.id} (${childCount} items)`);
        }
      }
      break;
    }
  }
}

async function main() {
  console.log("MiroEx — Miro Board Tools\n");
  const miro = new MiroClient();

  let boardId = process.argv[2] ? parseBoardId(process.argv[2]) : await selectBoard(miro);

  while (true) {
    console.log(`\nFetching board ${boardId}...`);
    const cache = await miro.getBoardData(boardId);
    console.log(`Board: "${cache.board.name}" — ${cache.items.length} items, ${cache.connectors.length} connectors`);

    const action = await selectAction();
    await runAction(action, cache);

    const next = await select({
      message: "Next:",
      choices: [
        { name: "Another action on this board", value: "same" },
        { name: "Choose different board", value: "other" },
        { name: "Exit", value: "exit" },
      ],
    });

    if (next === "exit") break;
    if (next === "other") {
      boardId = await selectBoard(miro);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Verify TypeScript compiles**

Run: `cd . && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "Add interactive CLI with board selection and actions"
```

---

### Task 5: Manual test and final commit

**Step 1: Run the CLI**

Run: `cd . && npm run cli`
Expected: Shows "MiroEx — Miro Board Tools", loads board list, allows selection

**Step 2: Test with a known board ID**

Run: `cd . && npm run cli -- <known_board_id>`
Expected: Skips board selection, goes straight to action menu

**Step 3: Test each action**

- Select "Board info" → shows stats
- Select "Render (HTML viewer)" → creates HTML file, opens in browser
- Select "Export" → creates output directory with files

**Step 4: Update CLAUDE.md with CLI docs**

Add to CLAUDE.md under "Commands" section:

```markdown
npm run cli    # Interactive CLI (board selection, render, export, info)
```

**Step 5: Final commit**

```bash
git add CLAUDE.md
git commit -m "Document interactive CLI in CLAUDE.md"
```
