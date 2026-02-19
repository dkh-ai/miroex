# MiroEx MCP Server — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a custom MCP server that converts Miro boards into machine-readable format with spatial clustering, accessible from Claude Code.

**Architecture:** TypeScript MCP server using `@modelcontextprotocol/sdk` with stdio transport. Fetches board data via Miro REST API v2, clusters items spatially using DBSCAN, and serves 6 tools for board navigation. In-memory cache with TTL.

**Tech Stack:** Node.js 18+, TypeScript, `@modelcontextprotocol/sdk`, `zod`, built-in `fetch`

**Design doc:** `docs/plans/2026-02-16-miro-reader-mcp-design.md`

**Project location:** `./`

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts` (minimal entry point)
- Create: `.gitignore`

**Steps:**
1. Create `package.json` with name `miroex`, type `module`, scripts (build/dev/start), deps (`@modelcontextprotocol/sdk`, `zod`), devDeps (`@types/node`, `typescript`, `tsx`)
2. Create `tsconfig.json` targeting ES2022, Node16 modules, strict
3. Create minimal `src/index.ts` with McpServer + StdioServerTransport
4. `npm install && npm run build` — verify `dist/index.js` created
5. Commit: "Initial scaffold: TypeScript MCP server"

---

### Task 2: Miro API client with pagination and caching

**Files:**
- Create: `src/types.ts` (MiroItem, MiroConnector, MiroBoardInfo, BoardCache interfaces)
- Create: `src/miro-client.ts` (MiroClient class)

**Key details:**
- `MiroClient` wraps Miro REST API v2 with Bearer token auth
- `fetchAllPages<T>()` handles cursor-based pagination
- `getBoardData()` fetches board info + all items + all connectors in parallel
- In-memory cache with 5-minute TTL per board
- `forceRefresh` parameter to bypass cache

Commit: "Add Miro API client with pagination and caching"

---

### Task 3: Spatial engine (clustering + position serialization)

**Files:**
- Create: `src/spatial.ts`

**Key algorithms:**
- `clusterItems(items, radius?)`: DBSCAN-like — BFS from each unvisited item, group neighbors within radius
- `sortReadingOrder(items)`: Sort top-to-bottom, left-to-right (within 50px row tolerance)
- `describePosition(x, y, bounds)`: Convert coordinates to "top-left", "center", "bottom-right" etc.
- `getBoardBounds(items)`: Compute bounding box of all items

Default cluster radius: `meanDiagonal(items) * 3`

Commit: "Add spatial engine: DBSCAN clustering and position serialization"

---

### Task 4: Text serializer (board → structured text)

**Files:**
- Create: `src/serializer.ts`

**Key functions:**
- `serializeBoard(cache, maxTokens?)`: Main serializer
- `stripHtml(html)`: Remove HTML tags from Miro content
- `itemLabel(item)`: Format as `[type/color]`
- `itemContent(item)`: Extract text, truncate to 200 chars
- `formatConnections(items, connectors)`: Render connection arrows

**Output format:**
```
# Board: "Name"
## Frame: "Title"
  [sticky note/yellow] Text content
  Connections:
    "From" → "To" (label: "enables")
## Unframed cluster #1 (top-left area)
  [shape] Content
## Cross-frame connections
  ...
```

Commit: "Add text serializer: board to structured text for LLM"

---

### Task 5: MCP tools — register all 6 tools

**Files:**
- Modify: `src/index.ts`

**6 tools:**
1. `miro_read_board { board_id, force_refresh? }` — stats, frames, preview
2. `miro_get_frame_content { board_id, frame_id }` — frame items + clusters + connections
3. `miro_get_clusters { board_id, cluster_radius? }` — spatial clusters of all items
4. `miro_get_connections { board_id }` — connector graph with content previews
5. `miro_search { board_id, query }` — text search with context
6. `miro_get_board_as_text { board_id, max_tokens? }` — full serialization

Each tool: validate with zod → fetch via MiroClient (cached) → process → return JSON text content.

Commit: "Register all 6 MCP tools for board navigation"

---

### Task 6: Register MCP server in Claude Code

1. Get Miro API token from https://miro.com/app/settings/user-profile/apps (scope: `boards:read`)
2. Register: `claude mcp add miroex -e MIRO_API_TOKEN=<token> -- npx tsx $(pwd)/src/index.ts`
3. Verify: `claude mcp list` shows miroex as Connected
4. Test with real board

---

### Task 7: Documentation (README.md + CLAUDE.md)

Already created as part of project setup.

---

### Task 8: End-to-end test with real Miro board

Test all 6 tools against a real board. Fix issues.

---

## Task Dependencies

```
Task 1 (scaffold)
  ├── Task 2 (API client)  ─┐
  ├── Task 3 (spatial)      ├── Task 5 (MCP tools) → Task 6 (register) → Task 8 (E2E test)
  └── Task 4 (serializer)  ─┘
Task 7 (docs) — independent
```

Tasks 2, 3, 4 can run in parallel after Task 1.
