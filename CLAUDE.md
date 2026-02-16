# MiroEx — Technical Context

## Overview

MCP server that converts Miro boards into machine-readable format for Claude Code. Read-only, TypeScript, minimal dependencies.

## Architecture

```
src/index.ts        — MCP server entry, 6 tool registrations
src/miro-client.ts  — Miro REST API v2 client (pagination, caching)
src/spatial.ts      — DBSCAN clustering, position serialization
src/serializer.ts   — Board → structured text for LLM
src/types.ts        — TypeScript interfaces
```

**Flow:** Tool call → MiroClient (cached) → Spatial Engine → Serializer → Text response

## Key Design Decisions

1. **LLM interprets semantics** — code only structures data, no heuristics for "what is a decision"
2. **Spatial clustering** — DBSCAN groups nearby items; positions serialized as "top-left", "center" etc.
3. **In-memory cache** — 5min TTL per board, `force_refresh` to bypass
4. **Cursor pagination** — Miro API paged results, `fetchAllPages()` handles it

## API Endpoints Used

- `GET /v2/boards/{board_id}` — metadata
- `GET /v2/boards/{board_id}/items?limit=50` — all items (paginated)
- `GET /v2/boards/{board_id}/connectors?limit=50` — connectors (paginated)

Auth: `Bearer` token via `MIRO_API_TOKEN` env var.

## Adding a New Tool

1. Add `server.tool("name", zodSchema, handler)` in `src/index.ts`
2. Use `miro.getBoardData(boardId)` for cached data access
3. Process with spatial/serializer utilities
4. Return `{ content: [{ type: "text", text: result }] }`

## Commands

```bash
npm run dev    # Dev mode (tsx, auto-reload)
npm run build  # Compile to dist/
npm start      # Run compiled
```

## Registration

```bash
claude mcp add miroex -e MIRO_API_TOKEN=<token> -- npx tsx /Users/khrupov/projects/miroex/src/index.ts
```
