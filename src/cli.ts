import "dotenv/config";
import { select, input, confirm } from "@inquirer/prompts";
import { MiroClient } from "./miro-client.js";
import { renderBoardToSvg } from "./svg-renderer.js";
import { wrapHtml } from "./render.js";
import { serializeBoard } from "./serializer.js";
import { analyzeBoard, chatAboutBoard } from "./analyzer.js";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import type { BoardCache } from "./types.js";

const MANUAL_ENTRY = "__manual__";

function parseBoardId(raw: string): string {
  const urlMatch = raw.match(/board\/([^/?]+)/);
  if (urlMatch) return urlMatch[1];
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
      { name: "Analyze (LLM summary + insights + chat)", value: "analyze" },
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
    case "analyze": {
      const text = serializeBoard(cache);
      const frames = cache.items.filter((i) => i.type === "frame");
      const stats = { items: cache.items.length, connectors: cache.connectors.length, frames: frames.length };

      const result = await analyzeBoard(text, boardName, safeId, stats);

      console.log("\n" + result.analysis);
      console.log("\n---\n");
      console.log(result.insights);

      const outDir = join("output", safeName);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "03-analysis.md"), result.analysis);
      writeFileSync(join(outDir, "04-insights.md"), result.insights);
      console.log(`\nSaved to ${outDir}/03-analysis.md and 04-insights.md`);

      const startChat = await confirm({ message: "Start interactive chat about the board?" });
      if (startChat) {
        await chatAboutBoard(text, result.analysis, result.insights);
      }
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
