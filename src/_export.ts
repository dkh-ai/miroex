/**
 * CLI utility: fetch a Miro board and save raw + serialized data to output/<boardName>/
 *
 * Usage: npx tsx src/_export.ts <board_id>
 */
import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { MiroClient } from "./miro-client.js";
import { serializeBoard } from "./serializer.js";
import { analyzeBoard } from "./analyzer.js";
import { confirm } from "@inquirer/prompts";

async function main() {
  const boardId = process.argv[2];
  if (!boardId) {
    console.error("Usage: npx tsx src/_export.ts <board_id>");
    process.exit(1);
  }

  const miro = new MiroClient();
  console.log(`Fetching board ${boardId}...`);
  const cache = await miro.getBoardData(boardId);

  const boardName = cache.board.name.replace(/[/\\?%*:|"<>]/g, "_");
  const outDir = join(import.meta.dirname ?? ".", "..", "output", boardName);
  mkdirSync(outDir, { recursive: true });

  // 1. Raw JSON cache
  const rawPath = join(outDir, "01-raw-data.json");
  writeFileSync(rawPath, JSON.stringify(cache, null, 2));
  console.log(`Saved raw data → ${rawPath} (${(Buffer.byteLength(JSON.stringify(cache)) / 1024 / 1024).toFixed(1)}MB)`);

  // 2. Serialized text
  const text = serializeBoard(cache);
  const textPath = join(outDir, "02-serialized.txt");
  writeFileSync(textPath, text);
  console.log(`Saved serialized text → ${textPath} (${text.length.toLocaleString()} chars)`);

  console.log(`\nOutput directory: ${outDir}`);

  if (process.env.OPENAI_API_KEY) {
    const generate = await confirm({ message: "Generate LLM analysis? (requires OPENAI_API_KEY)" });
    if (generate) {
      const frames = cache.items.filter((i) => i.type === "frame");
      const stats = { items: cache.items.length, connectors: cache.connectors.length, frames: frames.length };
      const result = await analyzeBoard(text, cache.board.name, boardId, stats);

      const analysisPath = join(outDir, "03-analysis.md");
      writeFileSync(analysisPath, result.analysis);
      console.log(`Saved analysis → ${analysisPath}`);

      const insightsPath = join(outDir, "04-insights.md");
      writeFileSync(insightsPath, result.insights);
      console.log(`Saved insights → ${insightsPath}`);
    }
  } else {
    console.log("Set OPENAI_API_KEY to generate 03-analysis.md and 04-insights.md automatically.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
