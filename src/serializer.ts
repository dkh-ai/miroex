import type {
  BoardCache,
  MiroItem,
  MiroConnector,
  Cluster,
  BoundingBox,
} from "./types.js";
import {
  clusterItems,
  describePosition,
  sortReadingOrder,
  getBoardBounds,
} from "./spatial.js";

// --- HTML entity decoding & tag stripping ---

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

const ENTITY_PATTERN = new RegExp(
  Object.keys(ENTITY_MAP)
    .map((k) => k.replace(/&/g, "&"))
    .join("|"),
  "gi",
);

export function stripHtml(html: string): string {
  // Remove HTML tags
  let text = html.replace(/<[^>]*>/g, "");
  // Decode common entities
  text = text.replace(ENTITY_PATTERN, (match) => ENTITY_MAP[match.toLowerCase()] ?? match);
  // Decode numeric entities
  text = text.replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
  return text.trim();
}

// --- Color name mapping ---

const COLOR_NAMES: Record<string, string> = {
  "#fff9b1": "yellow",
  "#d5f692": "green",
  "#f5d128": "orange",
  "#ff9d48": "dark orange",
  "#f24726": "red",
  "#e6e6e6": "grey",
  "#a6ccf5": "blue",
  "#c9df56": "lime",
  "#67c6c0": "cyan",
  "#ea94bb": "pink",
  "#ffffff": "white",
};

function colorName(hex: string | undefined): string | undefined {
  if (!hex) return undefined;
  const normalized = hex.toLowerCase();
  return COLOR_NAMES[normalized] ?? normalized;
}

// --- Item formatting ---

export function itemLabel(item: MiroItem): string {
  const typeName = item.type.replace(/_/g, " ");
  const fill = item.style?.fillColor;
  const color = colorName(fill);
  if (color) {
    return `[${typeName}/${color}]`;
  }
  return `[${typeName}]`;
}

export function itemContent(item: MiroItem): string {
  let raw = "";

  if (!item.data) return "";

  switch (item.type) {
    case "sticky_note":
    case "shape":
    case "text":
      raw = item.data.content ? stripHtml(item.data.content) : "";
      break;
    case "frame":
      raw = item.data.title ?? "";
      break;
    case "card":
      if (item.data.title) {
        raw = item.data.title;
      } else if (item.data.fields && item.data.fields.length > 0) {
        raw = item.data.fields.map((f) => f.value).join(", ");
      }
      break;
    default:
      raw = item.data.content ? stripHtml(item.data.content) : item.data.title ?? "";
      break;
  }

  raw = raw.trim();

  if (raw.length > 200) {
    return raw.slice(0, 200) + "...";
  }
  return raw;
}

// --- Connection formatting ---

interface Connection {
  from: MiroItem;
  to: MiroItem;
  connector: MiroConnector;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

function connectorCaption(connector: MiroConnector): string | undefined {
  if (!connector.captions || connector.captions.length === 0) return undefined;
  const firstCaption = connector.captions[0].content;
  return firstCaption ? stripHtml(firstCaption).trim() || undefined : undefined;
}

export function formatConnections(connections: Connection[]): string {
  return connections
    .map((conn) => {
      const fromText = truncate(itemContent(conn.from) || itemLabel(conn.from), 50);
      const toText = truncate(itemContent(conn.to) || itemLabel(conn.to), 50);
      const caption = connectorCaption(conn.connector);
      const label = caption ? ` (label: "${caption}")` : "";
      return `"${fromText}" → "${toText}"${label}`;
    })
    .join("\n");
}

// --- Board serialization ---

function buildItemMap(items: MiroItem[]): Map<string, MiroItem> {
  const map = new Map<string, MiroItem>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

function resolveConnections(
  connectors: MiroConnector[],
  itemMap: Map<string, MiroItem>,
): Connection[] {
  const resolved: Connection[] = [];
  for (const connector of connectors) {
    const fromId = connector.startItem?.id;
    const toId = connector.endItem?.id;
    if (!fromId || !toId) continue;
    const fromItem = itemMap.get(fromId);
    const toItem = itemMap.get(toId);
    if (!fromItem || !toItem) continue;
    resolved.push({ from: fromItem, to: toItem, connector });
  }
  return resolved;
}

function getItemFrame(item: MiroItem, frameIds: Set<string>): string | undefined {
  if (!item.parent?.id) return undefined;
  return frameIds.has(item.parent.id) ? item.parent.id : undefined;
}

function formatItemLine(item: MiroItem, indent: string): string {
  const label = itemLabel(item);
  const content = itemContent(item);
  if (content) {
    return `${indent}${label} ${content}`;
  }
  return `${indent}${label}`;
}

export function serializeBoard(cache: BoardCache, maxTokens?: number): string {
  const { board, items, connectors } = cache;
  const lines: string[] = [];

  // Header
  lines.push(`# Board: "${board.name}"`);
  if (board.description) {
    lines.push(board.description);
  }
  lines.push("");

  const itemMap = buildItemMap(items);
  const allConnections = resolveConnections(connectors, itemMap);

  // Identify frames
  const frames = items.filter((item) => item.type === "frame");
  const frameIds = new Set(frames.map((f) => f.id));

  // Non-frame items only
  const nonFrameItems = items.filter((item) => item.type !== "frame");

  // Group items by parent frame
  const framedItems = new Map<string, MiroItem[]>();
  const unframedItems: MiroItem[] = [];

  for (const item of nonFrameItems) {
    const frameId = getItemFrame(item, frameIds);
    if (frameId) {
      const group = framedItems.get(frameId);
      if (group) {
        group.push(item);
      } else {
        framedItems.set(frameId, [item]);
      }
    } else {
      unframedItems.push(item);
    }
  }

  // Compute board bounds for position descriptions
  const boardBounds = getBoardBounds(items);

  // Render each frame
  for (const frame of frames) {
    const title = itemContent(frame) || frame.id;
    const framePosition = frame.position
      ? describePosition(frame.position.x, frame.position.y, boardBounds)
      : undefined;

    lines.push(`## Frame: "${title}"`);
    if (framePosition) {
      lines.push(`Position: ${framePosition}`);
    }

    const children = framedItems.get(frame.id) ?? [];
    const sorted = sortReadingOrder(children);
    for (const child of sorted) {
      lines.push(formatItemLine(child, "  "));
    }

    // Internal connections: both endpoints in this frame
    const childIds = new Set(children.map((c) => c.id));
    const internalConns = allConnections.filter(
      (conn) => childIds.has(conn.from.id) && childIds.has(conn.to.id),
    );
    if (internalConns.length > 0) {
      lines.push("");
      lines.push("  Connections:");
      for (const conn of internalConns) {
        const fromText = truncate(itemContent(conn.from) || itemLabel(conn.from), 50);
        const toText = truncate(itemContent(conn.to) || itemLabel(conn.to), 50);
        const caption = connectorCaption(conn.connector);
        const label = caption ? ` (label: "${caption}")` : "";
        lines.push(`    "${fromText}" → "${toText}"${label}`);
      }
    }

    lines.push("");
  }

  // Render unframed items as clusters
  if (unframedItems.length > 0) {
    const clusters = clusterItems(unframedItems);

    for (const cluster of clusters) {
      const clusterPosition = describePosition(
        cluster.centroid.x,
        cluster.centroid.y,
        boardBounds,
      );
      lines.push(`## Unframed cluster #${cluster.id} (${clusterPosition})`);

      const sorted = sortReadingOrder(cluster.items);
      for (const item of sorted) {
        lines.push(formatItemLine(item, "  "));
      }

      // Connections within this cluster
      const clusterItemIds = new Set(cluster.items.map((i) => i.id));
      const clusterConns = allConnections.filter(
        (conn) => clusterItemIds.has(conn.from.id) && clusterItemIds.has(conn.to.id),
      );
      if (clusterConns.length > 0) {
        lines.push("");
        lines.push("  Connections:");
        for (const conn of clusterConns) {
          const fromText = truncate(itemContent(conn.from) || itemLabel(conn.from), 50);
          const toText = truncate(itemContent(conn.to) || itemLabel(conn.to), 50);
          const caption = connectorCaption(conn.connector);
          const label = caption ? ` (label: "${caption}")` : "";
          lines.push(`    "${fromText}" → "${toText}"${label}`);
        }
      }

      lines.push("");
    }
  }

  // Cross-frame connections: endpoints in different frames (or one framed, one unframed)
  const crossFrameConns = allConnections.filter((conn) => {
    const fromFrame = getItemFrame(conn.from, frameIds);
    const toFrame = getItemFrame(conn.to, frameIds);
    // Cross-frame: different frames, or one is framed and other is not
    if (fromFrame && toFrame && fromFrame !== toFrame) return true;
    if (fromFrame && !toFrame) return true;
    if (!fromFrame && toFrame) return true;
    return false;
  });

  if (crossFrameConns.length > 0) {
    lines.push("## Cross-frame connections");

    for (const conn of crossFrameConns) {
      const fromFrame = getItemFrame(conn.from, frameIds);
      const toFrame = getItemFrame(conn.to, frameIds);

      const fromFrameItem = fromFrame ? itemMap.get(fromFrame) : undefined;
      const fromPrefix = fromFrame
        ? `${(fromFrameItem ? itemContent(fromFrameItem) : "") || fromFrame}/`
        : "";
      const toFrameItem = toFrame ? itemMap.get(toFrame) : undefined;
      const toPrefix = toFrame
        ? `${(toFrameItem ? itemContent(toFrameItem) : "") || toFrame}/`
        : "";

      const fromText = truncate(
        fromPrefix + (itemContent(conn.from) || itemLabel(conn.from)),
        50,
      );
      const toText = truncate(
        toPrefix + (itemContent(conn.to) || itemLabel(conn.to)),
        50,
      );

      const caption = connectorCaption(conn.connector);
      const label = caption ? ` (label: "${caption}")` : "";
      lines.push(`  "${fromText}" → "${toText}"${label}`);
    }

    lines.push("");
  }

  let output = lines.join("\n");

  // Token-based truncation: estimate 1 token ~ 4 characters
  if (maxTokens !== undefined) {
    const maxChars = maxTokens * 4;
    if (output.length > maxChars) {
      output = output.slice(0, maxChars) + "\n\n[truncated]";
    }
  }

  return output;
}
