/**
 * CLI: render a Miro board as visual HTML (with pan/zoom) or bare SVG.
 *
 * Usage: npx tsx src/render.ts <board_id> [-o path] [--svg-only]
 */
import "dotenv/config";
import { writeFileSync } from "fs";
import { execSync } from "child_process";
import { MiroClient } from "./miro-client.js";
import { renderBoardToSvg } from "./svg-renderer.js";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  let boardId = "";
  let output = "";
  let svgOnly = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-o" && args[i + 1]) {
      output = args[++i];
    } else if (args[i] === "--svg-only") {
      svgOnly = true;
    } else if (!args[i].startsWith("-")) {
      boardId = args[i];
    }
  }

  return { boardId, output, svgOnly };
}

export function wrapHtml(svgContent: string, boardName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${boardName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #2c2c2c; overflow: hidden; font-family: Arial, sans-serif; }
  #canvas { width: 100vw; height: 100vh; cursor: grab; }
  #canvas:active { cursor: grabbing; }
  #controls {
    position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 10;
  }
  #controls button {
    background: #444; color: #eee; border: 1px solid #666; border-radius: 6px;
    padding: 8px 16px; cursor: pointer; font-size: 13px;
  }
  #controls button:hover { background: #555; }
  #board-name {
    position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
    color: #888; font-size: 13px; z-index: 10;
  }
</style>
</head>
<body>
<div id="controls">
  <button onclick="resetView()">Reset</button>
  <button onclick="downloadSvg()">Download SVG</button>
</div>
<div id="board-name">${boardName}</div>
<div id="canvas">
${svgContent}
</div>
<script>
(function() {
  const svg = document.querySelector('#canvas svg');
  const vb = svg.viewBox.baseVal;
  const origVb = { x: vb.x, y: vb.y, w: vb.width, h: vb.height };
  let isPanning = false, startX, startY, startVbX, startVbY;

  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');

  svg.addEventListener('mousedown', e => {
    isPanning = true;
    startX = e.clientX;
    startY = e.clientY;
    startVbX = vb.x;
    startVbY = vb.y;
  });
  window.addEventListener('mousemove', e => {
    if (!isPanning) return;
    const scale = vb.width / svg.clientWidth;
    vb.x = startVbX - (e.clientX - startX) * scale;
    vb.y = startVbY - (e.clientY - startY) * scale;
  });
  window.addEventListener('mouseup', () => { isPanning = false; });

  svg.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const px = vb.x + vb.width * mx;
    const py = vb.y + vb.height * my;
    const nw = vb.width * factor;
    const nh = vb.height * factor;
    vb.x = px - nw * mx;
    vb.y = py - nh * my;
    vb.width = nw;
    vb.height = nh;
  }, { passive: false });

  window.resetView = () => {
    vb.x = origVb.x; vb.y = origVb.y;
    vb.width = origVb.w; vb.height = origVb.h;
  };

  window.downloadSvg = () => {
    const clone = svg.cloneNode(true);
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    const blob = new Blob([clone.outerHTML], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = document.title.replace(/[^a-zA-Z0-9_-]/g, '_') + '.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  };
})();
</script>
</body>
</html>`;
}

async function main() {
  const { boardId, output, svgOnly } = parseArgs(process.argv);

  if (!boardId) {
    console.error("Usage: npx tsx src/render.ts <board_id> [-o path] [--svg-only]");
    process.exit(1);
  }

  const miro = new MiroClient();
  console.log(`Fetching board ${boardId}...`);
  const cache = await miro.getBoardData(boardId);
  const boardName = cache.board.name;

  console.log(
    `Board: "${boardName}" — ${cache.items.length} items, ${cache.connectors.length} connectors`,
  );

  const svg = renderBoardToSvg(cache.items, cache.connectors, boardName);

  const defaultExt = svgOnly ? ".svg" : ".html";
  const outPath = output || `board-${boardId}${defaultExt}`;

  const content = svgOnly ? svg : wrapHtml(svg, boardName);
  writeFileSync(outPath, content);
  console.log(`Saved → ${outPath}`);

  // Open in browser (macOS)
  if (process.platform === "darwin") {
    try {
      execSync(`open "${outPath}"`);
    } catch {
      // Silently ignore if open fails
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
