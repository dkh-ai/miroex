# Miro Reader MCP Server — Design Document

> **Date:** 2026-02-16
> **Status:** Approved
> **Goal:** Convert Miro boards into machine-readable format accessible via MCP tools

---

## Problem

Miro boards are visual dumps — hard to parse, navigate, and extract structured knowledge from. Information like decisions, action items, and relationships between concepts is embedded in spatial layout, colors, connectors, and groupings that have no machine-readable representation.

## Solution

A custom MCP server (`miroex`) that connects to Miro REST API v2, extracts all board elements with spatial context, and exposes structured navigation tools to Claude Code. The LLM handles semantic interpretation; the code handles structural extraction and spatial analysis.

## Architecture

```
Claude Code (LLM) — semantic understanding
    ↕ MCP Protocol
MCP Tools Layer — 6 tools for board navigation
    ↕
Spatial Engine — clustering, frame-membership, connection graph
    ↕
Miro API Client — pagination, caching, rate limits
    ↕
Miro REST API v2 — /boards/{id}/items, /boards/{id}/connectors
```

### Key Principle

Code extracts and structures. LLM interprets meaning. No heuristics for "what is a decision" — that's the LLM's job.

## MCP Tools

### 1. `miro_read_board`

Board overview — metadata, frame list, item statistics.

```
Input:  { board_id, force_refresh? }
Output: { name, description, created_at, modified_at,
          stats: { total_items, sticky_notes, shapes, connectors, frames, texts, images },
          frames: [{ id, title, item_count, position_summary }],
          top_level_items_preview }
```

### 2. `miro_get_frame_content`

All items within a specific frame, spatially clustered.

```
Input:  { board_id, frame_id }
Output: { frame: { title, position },
          items: [{ type, content, color, position_in_frame }],
          clusters: [{ items, centroid }],
          internal_connections: [{ from, to, label }] }
```

### 3. `miro_get_clusters`

Spatial clustering of all board elements (not just framed ones).

```
Input:  { board_id, cluster_radius? }
Output: { clusters: [{
            id, centroid, bounding_box,
            items: [{ type, content, color }],
            nearby_clusters: [cluster_id]
          }] }
```

### 4. `miro_get_connections`

Full connector graph with item context.

```
Input:  { board_id }
Output: { connections: [{
            from: { id, type, content_preview },
            to: { id, type, content_preview },
            label?, style: { stroke_color, line_type }
          }] }
```

### 5. `miro_search`

Text search across all item content.

```
Input:  { board_id, query }
Output: { matches: [{
            item: { id, type, content },
            context: { frame?, cluster?, connected_items }
          }] }
```

### 6. `miro_get_board_as_text`

Full board serialized as structured text for LLM consumption.

```
Input:  { board_id, max_tokens? }
Output: string
```

Serialization format:
```
# Board: "Product Strategy Q1"

## Frame: "Goals"
  [sticky/yellow] OKR: Increase retention to 80%
  [sticky/green] OKR: Launch self-serve onboarding

  Connections:
    "Increase retention" → "Launch self-serve" (label: "enables")

## Unframed cluster #1 (top-left area)
  [sticky/pink] TODO: Check with legal
  [text] Meeting notes from Jan 15
```

## Spatial Engine

### Algorithm

1. Extract all items with positions `(x, y, width, height)` via Miro API
2. Build frame-membership from `parent_id` relationships
3. Cluster unframed items using DBSCAN-like approach:
   - Distance metric: Euclidean between item centers
   - `cluster_radius` default: mean item diagonal * 3
   - Items closer than radius → same cluster
4. Determine cluster adjacency: centroid distance < 2 * cluster_radius

### Position Serialization for LLM

Instead of raw coordinates, generate human-readable positions:
- Relative: "top-left", "center", "bottom-right" (relative to frame or board)
- Grouping: "near [other item]"
- Reading order: left-to-right, top-to-bottom within clusters

### Implementation

Pure TypeScript, no external dependencies. DBSCAN on ~100-500 items is trivial.

## Caching

- In-memory cache with TTL (default: 5 minutes)
- First `read_board` call loads all items + connectors, caches them
- Subsequent tools operate on cached data
- `force_refresh: true` parameter to bypass cache

## Tech Stack

| Component | Choice |
|-----------|--------|
| Runtime | Node.js 18+ / TypeScript |
| MCP SDK | `@modelcontextprotocol/sdk` |
| HTTP | Built-in `fetch` |
| Clustering | Pure TypeScript |
| Config | `MIRO_API_TOKEN` env var |

## API Authentication

Miro REST API requires an access token. Options:
1. **Personal access token** — simplest, for personal use
2. **OAuth 2.0** — for shared/team use

For MVP: personal access token via `MIRO_API_TOKEN` env variable.

## Miro API Endpoints Used

- `GET /v2/boards/{board_id}` — board metadata
- `GET /v2/boards/{board_id}/items` — all items (paginated, cursor-based)
- `GET /v2/boards/{board_id}/connectors` — all connectors (paginated)
- `GET /v2/boards/{board_id}/items/{item_id}` — individual item details

## Out of Scope (MVP)

- Writing/updating boards (read-only)
- Image/embed content extraction (text only)
- Historical board versions
- Real-time board monitoring / webhooks
- Integration with NACHOS pipeline (future phase)
