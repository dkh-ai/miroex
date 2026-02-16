import type { MiroItem, MiroConnector } from "./types.js";
import { getBoardBounds, getItemCenter, getItemDiagonal } from "./spatial.js";
import { stripHtml, itemContent } from "./serializer.js";

// Miro named colors → hex
const STICKY_COLORS: Record<string, string> = {
  yellow: "#fff9b1",
  green: "#d5f692",
  orange: "#f5d128",
  "dark orange": "#ff9d48",
  red: "#f24726",
  grey: "#e6e6e6",
  blue: "#a6ccf5",
  lime: "#c9df56",
  cyan: "#67c6c0",
  pink: "#ea94bb",
  white: "#ffffff",
  // Miro API sometimes returns these as-is
  light_yellow: "#fff9b1",
  light_green: "#d5f692",
  light_blue: "#a6ccf5",
  light_pink: "#ea94bb",
};

function resolveColor(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (raw.startsWith("#")) return raw;
  return STICKY_COLORS[raw.toLowerCase()] ?? fallback;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textDiv(
  text: string,
  width: number,
  height: number,
  color = "#333",
  fontSize = 14,
): string {
  const escaped = escapeXml(text);
  return [
    `<div xmlns="http://www.w3.org/1999/xhtml" style="`,
    `width:${width}px;height:${height}px;`,
    `display:flex;align-items:center;justify-content:center;`,
    `text-align:center;word-wrap:break-word;overflow:hidden;`,
    `font-family:Arial,sans-serif;font-size:${fontSize}px;`,
    `color:${color};padding:4px;box-sizing:border-box;`,
    `line-height:1.3;`,
    `">${escaped}</div>`,
  ].join("");
}

// --- Item renderers ---

function renderFrame(item: MiroItem): string {
  const w = item.geometry?.width ?? 300;
  const h = item.geometry?.height ?? 200;
  const cx = item.position!.x;
  const cy = item.position!.y;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const title = itemContent(item);

  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" `;
  svg += `fill="none" stroke="#ccc" stroke-width="2" stroke-dasharray="8 4" rx="4"/>`;
  if (title) {
    svg += `<text x="${x + 8}" y="${y - 8}" font-family="Arial,sans-serif" `;
    svg += `font-size="16" fill="#999">${escapeXml(title)}</text>`;
  }
  return svg;
}

function renderStickyNote(item: MiroItem): string {
  const w = item.geometry?.width ?? 200;
  const h = item.geometry?.height ?? 200;
  const cx = item.position!.x;
  const cy = item.position!.y;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const fill = resolveColor(item.style?.fillColor, "#fff9b1");
  const text = itemContent(item);

  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" `;
  svg += `fill="${fill}" stroke="${darken(fill, 30)}" stroke-width="1"/>`;
  if (text) {
    svg += `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}">`;
    svg += textDiv(text, w, h, "#333", clampFontSize(text, w, h));
    svg += `</foreignObject>`;
  }
  return svg;
}

function renderShape(item: MiroItem): string {
  const w = item.geometry?.width ?? 150;
  const h = item.geometry?.height ?? 150;
  const cx = item.position!.x;
  const cy = item.position!.y;
  const shape = item.data?.shape ?? "rectangle";
  const fill = resolveColor(item.style?.fillColor, "#e8e8e8");
  const border = item.style?.borderColor ?? "#666";
  const text = itemContent(item);

  let svg = "";
  if (shape === "circle" || shape === "ellipse") {
    svg += `<ellipse cx="${cx}" cy="${cy}" rx="${w / 2}" ry="${h / 2}" `;
    svg += `fill="${fill}" stroke="${border}" stroke-width="2"/>`;
  } else if (shape === "rhombus" || shape === "diamond") {
    const points = `${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}`;
    svg += `<polygon points="${points}" fill="${fill}" stroke="${border}" stroke-width="2"/>`;
  } else if (shape === "triangle") {
    const points = `${cx},${cy - h / 2} ${cx + w / 2},${cy + h / 2} ${cx - w / 2},${cy + h / 2}`;
    svg += `<polygon points="${points}" fill="${fill}" stroke="${border}" stroke-width="2"/>`;
  } else {
    // rectangle, round_rectangle, and fallback
    const rx = shape === "round_rectangle" ? 12 : 4;
    const x = cx - w / 2;
    const y = cy - h / 2;
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" `;
    svg += `fill="${fill}" stroke="${border}" stroke-width="2"/>`;
  }

  if (text) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    svg += `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}">`;
    svg += textDiv(text, w, h, "#333", clampFontSize(text, w, h));
    svg += `</foreignObject>`;
  }
  return svg;
}

function renderText(item: MiroItem): string {
  const w = item.geometry?.width ?? 200;
  const h = item.geometry?.height ?? 50;
  const cx = item.position!.x;
  const cy = item.position!.y;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const text = itemContent(item);
  const color = item.style?.color ?? "#333";

  if (!text) return "";
  let svg = `<foreignObject x="${x}" y="${y}" width="${w}" height="${h}">`;
  svg += textDiv(text, w, h, color, clampFontSize(text, w, h));
  svg += `</foreignObject>`;
  return svg;
}

function renderCard(item: MiroItem): string {
  const w = item.geometry?.width ?? 320;
  const h = item.geometry?.height ?? 100;
  const cx = item.position!.x;
  const cy = item.position!.y;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const text = itemContent(item);

  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#fff" stroke="#ddd" stroke-width="1"/>`;
  // Accent stripe
  svg += `<rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="#4262ff"/>`;
  if (text) {
    svg += `<foreignObject x="${x + 8}" y="${y}" width="${w - 12}" height="${h}">`;
    svg += textDiv(text, w - 12, h, "#333", clampFontSize(text, w - 12, h));
    svg += `</foreignObject>`;
  }
  return svg;
}

function renderImage(item: MiroItem): string {
  const w = item.geometry?.width ?? 200;
  const h = item.geometry?.height ?? 150;
  const cx = item.position!.x;
  const cy = item.position!.y;
  const x = cx - w / 2;
  const y = cy - h / 2;

  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#f0f0f0" stroke="#ccc" stroke-width="1"/>`;
  svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" `;
  svg += `font-family="Arial,sans-serif" font-size="20" fill="#aaa">IMG</text>`;
  return svg;
}

// --- Connectors ---

function renderConnector(
  connector: MiroConnector,
  itemMap: Map<string, MiroItem>,
): string {
  const startId = connector.startItem?.id;
  const endId = connector.endItem?.id;
  if (!startId || !endId) return "";

  const startItem = itemMap.get(startId);
  const endItem = itemMap.get(endId);
  if (!startItem || !endItem) return "";

  const startCenter = getItemCenter(startItem);
  const endCenter = getItemCenter(endItem);
  if (!startCenter || !endCenter) return "";

  // Shorten line to avoid overlapping items
  const dx = endCenter.x - startCenter.x;
  const dy = endCenter.y - startCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return "";

  const ux = dx / dist;
  const uy = dy / dist;

  const startShrink = getItemDiagonal(startItem) * 0.35;
  const endShrink = getItemDiagonal(endItem) * 0.35;

  const x1 = startCenter.x + ux * startShrink;
  const y1 = startCenter.y + uy * startShrink;
  const x2 = endCenter.x - ux * endShrink;
  const y2 = endCenter.y - uy * endShrink;

  const strokeColor = connector.style?.strokeColor ?? "#666";
  const strokeWidth = connector.style?.strokeWidth ?? "2";
  const isDashed = connector.style?.strokeStyle === "dashed";
  const hasArrow = connector.style?.endStrokeCap === "arrow" ||
    connector.style?.endStrokeCap === "stealth" ||
    // Default to arrow if not specified
    !connector.style?.endStrokeCap;

  const markerId = hasArrow ? `url(#arrowhead-${connector.id})` : "";

  let svg = "";

  if (hasArrow) {
    svg += `<defs><marker id="arrowhead-${connector.id}" markerWidth="10" markerHeight="7" `;
    svg += `refX="10" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" `;
    svg += `fill="${strokeColor}"/></marker></defs>`;
  }

  svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" `;
  svg += `stroke="${strokeColor}" stroke-width="${strokeWidth}"`;
  if (isDashed) svg += ` stroke-dasharray="6 3"`;
  if (hasArrow) svg += ` marker-end="${markerId}"`;
  svg += `/>`;

  // Label at midpoint
  const caption = connector.captions?.[0]?.content;
  if (caption) {
    const label = stripHtml(caption).trim();
    if (label) {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      svg += `<rect x="${mx - label.length * 3.5 - 4}" y="${my - 10}" `;
      svg += `width="${label.length * 7 + 8}" height="20" rx="3" fill="#2c2c2c" fill-opacity="0.8"/>`;
      svg += `<text x="${mx}" y="${my + 4}" text-anchor="middle" `;
      svg += `font-family="Arial,sans-serif" font-size="11" fill="#ccc">${escapeXml(label)}</text>`;
    }
  }

  return svg;
}

// --- Helpers ---

function darken(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function clampFontSize(text: string, width: number, height: number): number {
  const area = width * height;
  const charCount = text.length;
  // Rough heuristic: larger area or fewer chars → bigger font
  const ideal = Math.sqrt(area / Math.max(charCount, 1)) * 0.9;
  return Math.min(Math.max(Math.round(ideal), 10), 24);
}

function renderItem(item: MiroItem): string {
  if (!item.position) return "";

  let svg = "";
  switch (item.type) {
    case "frame":
      svg = renderFrame(item);
      break;
    case "sticky_note":
      svg = renderStickyNote(item);
      break;
    case "shape":
      svg = renderShape(item);
      break;
    case "text":
      svg = renderText(item);
      break;
    case "card":
      svg = renderCard(item);
      break;
    case "image":
      svg = renderImage(item);
      break;
    default:
      // Fallback: render as rect with content
      svg = renderShape({ ...item, data: { ...item.data, shape: "rectangle" } });
      break;
  }

  if (!svg) return "";

  // Apply rotation if present
  const rotation = item.geometry?.rotation;
  if (rotation) {
    const cx = item.position.x;
    const cy = item.position.y;
    return `<g transform="rotate(${rotation}, ${cx}, ${cy})">${svg}</g>`;
  }

  return svg;
}

// --- Main export ---

export function renderBoardToSvg(
  items: MiroItem[],
  connectors: MiroConnector[],
  boardName?: string,
): string {
  const bounds = getBoardBounds(items);
  const padding = 100;
  const vbX = bounds.minX - padding;
  const vbY = bounds.minY - padding;
  const vbW = bounds.maxX - bounds.minX + padding * 2;
  const vbH = bounds.maxY - bounds.minY + padding * 2;

  const itemMap = new Map<string, MiroItem>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Layer order: frames first, then non-frames, then connectors
  const frames = items.filter((i) => i.type === "frame");
  const nonFrames = items.filter((i) => i.type !== "frame");

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}">`,
  );

  if (boardName) {
    parts.push(`<title>${escapeXml(boardName)}</title>`);
  }

  // Background
  parts.push(
    `<rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#fafafa"/>`,
  );

  // Frames layer
  for (const item of frames) {
    parts.push(renderItem(item));
  }

  // Items layer
  for (const item of nonFrames) {
    parts.push(renderItem(item));
  }

  // Connectors layer
  for (const connector of connectors) {
    parts.push(renderConnector(connector, itemMap));
  }

  parts.push(`</svg>`);

  return parts.filter(Boolean).join("\n");
}
