import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MiroClient } from "./miro-client.js";
import { clusterItems, describePosition, sortReadingOrder, getBoardBounds } from "./spatial.js";
import { serializeBoard, itemLabel, itemContent, stripHtml, formatConnections } from "./serializer.js";

const server = new McpServer({
  name: "miroex",
  version: "1.0.0",
});

const miro = new MiroClient();

// --- Tool 1: miro_read_board ---

server.tool(
  "miro_read_board",
  "Board overview: metadata, statistics, frame list, top-level item preview",
  {
    board_id: z.string().describe("Miro board ID"),
    force_refresh: z.boolean().optional().describe("Bypass cache"),
  },
  async ({ board_id, force_refresh }) => {
    const cache = await miro.getBoardData(board_id, force_refresh);
    const { board, items, connectors } = cache;

    const frames = items.filter((i) => i.type === "frame");
    const boardBounds = getBoardBounds(items);

    const stats = {
      total_items: items.length,
      sticky_notes: items.filter((i) => i.type === "sticky_note").length,
      shapes: items.filter((i) => i.type === "shape").length,
      connectors: connectors.length,
      frames: frames.length,
      texts: items.filter((i) => i.type === "text").length,
      images: items.filter((i) => i.type === "image").length,
      cards: items.filter((i) => i.type === "card").length,
    };

    const frameList = frames.map((f) => ({
      id: f.id,
      title: f.data?.title ?? f.id,
      item_count: items.filter((i) => i.parent?.id === f.id).length,
      position: f.position
        ? describePosition(f.position.x, f.position.y, boardBounds)
        : "unknown",
    }));

    const topLevelPreview = items
      .filter((i) => !i.parent && i.type !== "frame")
      .slice(0, 10)
      .map((i) => `${itemLabel(i)} ${itemContent(i)}`.trim());

    const result = {
      name: board.name,
      description: board.description,
      created_at: board.createdAt,
      modified_at: board.modifiedAt,
      stats,
      frames: frameList,
      top_level_items_preview: topLevelPreview,
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// --- Tool 2: miro_get_frame_content ---

server.tool(
  "miro_get_frame_content",
  "All items within a specific frame, spatially clustered with connections",
  {
    board_id: z.string().describe("Miro board ID"),
    frame_id: z.string().describe("Frame item ID"),
  },
  async ({ board_id, frame_id }) => {
    const cache = await miro.getBoardData(board_id);
    const { items, connectors } = cache;

    const frame = items.find((i) => i.id === frame_id && i.type === "frame");
    if (!frame) {
      return { content: [{ type: "text" as const, text: `Frame ${frame_id} not found` }] };
    }

    const children = items.filter((i) => i.parent?.id === frame_id);
    const sorted = sortReadingOrder(children);
    const clusters = clusterItems(children);

    const childIds = new Set(children.map((c) => c.id));
    const itemMap = new Map(items.map((i) => [i.id, i]));

    const internalConnections = connectors
      .filter((c) => {
        const startId = c.startItem?.id;
        const endId = c.endItem?.id;
        return startId && endId && childIds.has(startId) && childIds.has(endId);
      })
      .map((c) => ({
        from: itemMap.get(c.startItem!.id)!,
        to: itemMap.get(c.endItem!.id)!,
        connector: c,
      }));

    const boardBounds = getBoardBounds(items);

    const result = {
      frame: {
        title: frame.data?.title ?? frame.id,
        position: frame.position
          ? describePosition(frame.position.x, frame.position.y, boardBounds)
          : "unknown",
      },
      items: sorted.map((i) => ({
        type: i.type,
        content: itemContent(i),
        color: i.style?.fillColor,
        label: itemLabel(i),
      })),
      clusters: clusters.map((cl) => ({
        id: cl.id,
        item_count: cl.items.length,
        centroid: cl.centroid,
        items: cl.items.map((i) => ({ type: i.type, content: itemContent(i) })),
      })),
      internal_connections: internalConnections.map((conn) => ({
        from: itemContent(conn.from) || itemLabel(conn.from),
        to: itemContent(conn.to) || itemLabel(conn.to),
        label: conn.connector.captions?.[0]?.content
          ? stripHtml(conn.connector.captions[0].content)
          : undefined,
      })),
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// --- Tool 3: miro_get_clusters ---

server.tool(
  "miro_get_clusters",
  "Spatial clustering of all board elements using DBSCAN",
  {
    board_id: z.string().describe("Miro board ID"),
    cluster_radius: z.number().optional().describe("Cluster radius in pixels"),
  },
  async ({ board_id, cluster_radius }) => {
    const cache = await miro.getBoardData(board_id);
    const nonFrameItems = cache.items.filter((i) => i.type !== "frame");
    const clusters = clusterItems(nonFrameItems, cluster_radius);
    const boardBounds = getBoardBounds(cache.items);

    const result = {
      clusters: clusters.map((cl) => ({
        id: cl.id,
        centroid: cl.centroid,
        position: describePosition(cl.centroid.x, cl.centroid.y, boardBounds),
        bounding_box: cl.bounds,
        item_count: cl.items.length,
        items: cl.items.map((i) => ({
          type: i.type,
          content: itemContent(i),
          color: i.style?.fillColor,
          label: itemLabel(i),
        })),
      })),
    };

    return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
  },
);

// --- Tool 4: miro_get_connections ---

server.tool(
  "miro_get_connections",
  "Full connector graph with item context",
  {
    board_id: z.string().describe("Miro board ID"),
  },
  async ({ board_id }) => {
    const cache = await miro.getBoardData(board_id);
    const itemMap = new Map(cache.items.map((i) => [i.id, i]));

    const connections = cache.connectors
      .map((c) => {
        const from = c.startItem?.id ? itemMap.get(c.startItem.id) : undefined;
        const to = c.endItem?.id ? itemMap.get(c.endItem.id) : undefined;
        if (!from || !to) return null;
        return {
          from: {
            id: from.id,
            type: from.type,
            content_preview: itemContent(from),
          },
          to: {
            id: to.id,
            type: to.type,
            content_preview: itemContent(to),
          },
          label: c.captions?.[0]?.content ? stripHtml(c.captions[0].content) : undefined,
          style: {
            stroke_color: c.style?.strokeColor,
            stroke_style: c.style?.strokeStyle,
          },
        };
      })
      .filter(Boolean);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ connections }, null, 2) }],
    };
  },
);

// --- Tool 5: miro_search ---

server.tool(
  "miro_search",
  "Text search across all board item content",
  {
    board_id: z.string().describe("Miro board ID"),
    query: z.string().describe("Search query"),
  },
  async ({ board_id, query }) => {
    const cache = await miro.getBoardData(board_id);
    const { items, connectors } = cache;
    const queryLower = query.toLowerCase();

    const itemMap = new Map(items.map((i) => [i.id, i]));
    const frameIds = new Set(items.filter((i) => i.type === "frame").map((i) => i.id));

    const matches = items
      .filter((item) => {
        const content = itemContent(item).toLowerCase();
        return content.includes(queryLower);
      })
      .map((item) => {
        const frameId = item.parent?.id && frameIds.has(item.parent.id) ? item.parent.id : undefined;
        const frame = frameId ? itemMap.get(frameId) : undefined;

        const connectedItems = connectors
          .filter((c) => c.startItem?.id === item.id || c.endItem?.id === item.id)
          .map((c) => {
            const otherId = c.startItem?.id === item.id ? c.endItem?.id : c.startItem?.id;
            const other = otherId ? itemMap.get(otherId) : undefined;
            return other ? { type: other.type, content: itemContent(other) } : null;
          })
          .filter(Boolean);

        return {
          item: {
            id: item.id,
            type: item.type,
            content: itemContent(item),
            label: itemLabel(item),
          },
          context: {
            frame: frame ? { id: frame.id, title: frame.data?.title ?? frame.id } : undefined,
            connected_items: connectedItems,
          },
        };
      });

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ query, match_count: matches.length, matches }, null, 2) }],
    };
  },
);

// --- Tool 6: miro_get_board_as_text ---

server.tool(
  "miro_get_board_as_text",
  "Full board serialized as structured text for LLM consumption",
  {
    board_id: z.string().describe("Miro board ID"),
    max_tokens: z.number().optional().describe("Approximate token limit for output"),
  },
  async ({ board_id, max_tokens }) => {
    const cache = await miro.getBoardData(board_id);
    const text = serializeBoard(cache, max_tokens);
    return { content: [{ type: "text" as const, text }] };
  },
);

// --- Start server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
