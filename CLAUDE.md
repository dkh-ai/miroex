# MiroEx — Technical Context

## Overview

MCP server that converts Miro boards into machine-readable format for Claude Code. Read-only, TypeScript, minimal dependencies. Also includes a visual SVG renderer for viewing boards in the browser.

## Architecture

```
src/index.ts        — MCP server entry, 6 tool registrations
src/miro-client.ts  — Miro REST API v2 client (pagination, caching, coordinate normalization)
src/spatial.ts      — DBSCAN clustering, bounding box, position serialization
src/serializer.ts   — Board → structured text for LLM (stripHtml, itemContent, serializeBoard)
src/svg-renderer.ts — Board → SVG string (visual rendering of all item types + connectors)
src/render.ts       — CLI: render board to interactive HTML or bare SVG
src/_export.ts      — CLI: export raw JSON + serialized text to output/
src/types.ts        — TypeScript interfaces (MiroItem, MiroConnector, BoardCache, BoundingBox, Cluster)
```

**MCP Flow:** Tool call → MiroClient (cached) → Spatial Engine → Serializer → Text response

**Render Flow:** CLI args → MiroClient → `renderBoardToSvg()` → HTML wrapper (pan/zoom JS) → file + `open`

## Key Types

```typescript
MiroItem     — id, type, data?, style?, position?, geometry?, parent?
MiroConnector — id, startItem?, endItem?, captions?, style?
BoardCache   — board (MiroBoard), items[], connectors[], fetchedAt
BoundingBox  — minX, minY, maxX, maxY
```

## Key Design Decisions

1. **LLM interprets semantics** — code only structures data, no heuristics for "what is a decision"
2. **Spatial clustering** — DBSCAN groups nearby items; positions serialized as "top-left", "center" etc.
3. **In-memory cache** — 5min TTL per board, `force_refresh` to bypass
4. **Cursor pagination** — Miro API paged results, `fetchAllPages()` handles it
5. **Coordinate normalization** — `normalizePositions()` converts parent-relative to absolute canvas coordinates before any processing
6. **SVG via foreignObject** — text rendered as HTML div inside `<foreignObject>` for proper word-wrap, centering, and Cyrillic support
7. **Zero new dependencies** — SVG renderer and HTML viewer built with vanilla JS, no external libs

## API Endpoints Used

- `GET /v2/boards/{board_id}` — metadata
- `GET /v2/boards/{board_id}/items?limit=50` — all items (paginated)
- `GET /v2/boards/{board_id}/connectors?limit=50` — connectors (paginated)

Auth: `Bearer` token via `MIRO_API_TOKEN` env var.

## Key Components

### MiroClient (`src/miro-client.ts`)

- `getBoardData(boardId, forceRefresh?)` → `BoardCache` — fetches board + items + connectors, normalizes positions, caches 5min
- `normalizePositions(items)` — converts `relativeTo: "parent_top_left"` to absolute canvas coordinates recursively

### Spatial Engine (`src/spatial.ts`)

- `getItemCenter(item)` → `{x, y} | null`
- `getItemDiagonal(item)` → `number` (default 100)
- `getBoardBounds(items)` → `BoundingBox`
- `clusterItems(items, radius?)` → `Cluster[]` — BFS-based DBSCAN, radius = mean diagonal * 3
- `sortReadingOrder(items)` → sorted copy (top-to-bottom, 50px row tolerance)
- `describePosition(x, y, bounds)` → `"top-left"` etc. (3x3 grid)

### Serializer (`src/serializer.ts`)

- `stripHtml(html)` → plain text (tags + entities + numeric codes)
- `itemContent(item)` → text content by type (max 200 chars)
- `itemLabel(item)` → `[type/color]` label
- `serializeBoard(cache, maxTokens?)` → structured markdown-like text (frames → clusters → cross-frame connections)

### SVG Renderer (`src/svg-renderer.ts`)

- `renderBoardToSvg(items, connectors, boardName?)` → SVG string
- Renders by type: frame (dashed rect), sticky_note (colored rect), shape (rect/ellipse/diamond/triangle), text, card (white + blue accent stripe), image (grey placeholder)
- Connectors: line shortened by 35% of item diagonal from each end, arrow markers, dashed style, midpoint labels
- Layer order: frames → items → connectors
- Rotation: `<g transform="rotate()">` if `geometry.rotation` present
- Miro named colors (yellow, green, etc.) → hex mapping
- Adaptive font size heuristic based on area / char count

### Render CLI (`src/render.ts`)

```
npx tsx src/render.ts <board_id> [-o path] [--svg-only]
```

- HTML mode (default): self-contained file with dark background, mouse pan/zoom, Reset + Download SVG buttons
- SVG mode (`--svg-only`): bare SVG file
- Auto-opens in browser on macOS

### Export CLI (`src/_export.ts`)

```
npx tsx src/_export.ts <board_id>
```

Saves to `output/<board_name>/`: `01-raw-data.json`, `02-serialized.txt`

## Configuration

| Parameter | Source | Description |
|-----------|--------|-------------|
| `MIRO_API_TOKEN` | env / `.env` | Miro API bearer token (required) |

## Adding a New Tool

1. Add `server.tool("name", zodSchema, handler)` in `src/index.ts`
2. Use `miro.getBoardData(boardId)` for cached data access
3. Process with spatial/serializer utilities
4. Return `{ content: [{ type: "text", text: result }] }`

## Adding a New Item Type to SVG Renderer

1. Add render function `renderXxx(item: MiroItem): string` in `svg-renderer.ts`
2. Add case to `renderItem()` switch
3. Item center: `position.x`, `position.y`; rect corner: `x - w/2, y - h/2`
4. Use `textDiv()` + `<foreignObject>` for text content

## Commands

```bash
npm run dev    # Dev mode (tsx, auto-reload)
npm run build  # Compile to dist/
npm start      # Run compiled
npm run render # Visual board rendering (CLI)
npm run cli    # Interactive CLI (board selection, render, export, info)
```

## Registration

```bash
claude mcp add miroex -e MIRO_API_TOKEN=<token> -- npx tsx /Users/khrupov/projects/miroex/src/index.ts
```
