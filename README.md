# MiroEx — Miro Board Reader for LLMs

[Русская версия](README.ru.md)

MCP server that turns Miro boards into structured, machine-readable text. Fetches board elements via Miro REST API, clusters them spatially, and provides Claude with a set of tools for navigation and knowledge extraction. Includes a visual SVG renderer, OpenAI-powered board analysis, and an interactive CLI.

## Features

- **6 MCP tools** for board navigation: overview, frames, clusters, connections, search, full serialization
- **Interactive CLI** — board selection from list, rendering, export, analysis, stats
- **Spatial clustering** — groups nearby elements using DBSCAN
- **Text serialization** — board to structured text optimized for LLMs
- **Visual rendering** — SVG/HTML generation with interactive pan/zoom viewer
- **Board analysis** — optional GPT-4o powered analysis and interactive chat (requires OpenAI API key)
- **Caching** — in-memory cache with 5-minute TTL
- **Read-only** — never modifies your boards

## Requirements

- Node.js 18+
- Miro API token (scope: `boards:read`)
- OpenAI API key (optional, for board analysis)

## Setup

```bash
git clone https://github.com/dkh-ai/miroex.git
cd miroex
npm install
cp .env.example .env
```

Edit `.env` and add your Miro API token:

```
MIRO_API_TOKEN=your-token-here
```

### Getting a Miro API token

1. Go to https://miro.com/app/settings/user-profile/apps
2. Create a new app (or use an existing one)
3. Grant scope `boards:read`
4. Copy the access token

## Usage

### Claude Code (MCP server)

Register MiroEx as an MCP server:

```bash
claude mcp add miroex -e MIRO_API_TOKEN=<your-token> -- npx tsx $(pwd)/src/index.ts
```

Verify:

```bash
claude mcp list
```

Now you can ask Claude about your Miro boards:

```
Read miro board <board_id> and extract all decisions
```

```
Show the connection graph on board <board_id>
```

```
Search board <board_id> for everything related to "architecture"
```

### Interactive CLI

```bash
npm run cli
```

Shows a list of your boards, then lets you choose an action:
- **Render (HTML viewer)** — interactive visualization in browser
- **Render (SVG only)** — vector file
- **Export (JSON + text)** — raw data + text serialization + optional LLM analysis
- **Analyze** — GPT-4o analysis with interactive follow-up chat
- **Board info** — element and frame statistics

You can pass a board ID or Miro URL directly:

```bash
npm run cli -- <board_id>
npm run cli -- https://miro.com/app/board/uXjVN.../
```

### CLI utilities

| Command | Description |
|---------|-------------|
| `npm run cli` | Interactive menu |
| `npx tsx src/render.ts <board_id>` | Render board to HTML (opens in browser) |
| `npx tsx src/render.ts <board_id> --svg-only` | Render to SVG file |
| `npx tsx src/_export.ts <board_id>` | Export data (JSON + text + optional analysis) |

## MCP Tools

| Tool | Description |
|------|-------------|
| `miro_read_board` | Board overview: metadata, stats, frame list |
| `miro_get_frame_content` | Frame content with clusters and connections |
| `miro_get_clusters` | Spatial clusters of all elements |
| `miro_get_connections` | Full connector graph with context |
| `miro_search` | Text search across board content |
| `miro_get_board_as_text` | Full board serialized as structured text |

## Configuration

| Variable | Source | Description | Required |
|----------|--------|-------------|----------|
| `MIRO_API_TOKEN` | `.env` or env | Bearer token for Miro API | Yes |
| `OPENAI_API_KEY` | `.env` or env | OpenAI API key for board analysis | No |

## Development

```bash
npm run dev    # MCP server in dev mode (tsx, auto-reload)
npm run build  # Compile TypeScript to dist/
npm start      # Run compiled version
npm run render # Visual rendering (CLI)
npm run cli    # Interactive menu
```

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol — McpServer, StdioServerTransport |
| `@inquirer/prompts` | Interactive CLI prompts (select, input) |
| `openai` | OpenAI API client for board analysis |
| `zod` | Schema validation for MCP tool inputs |
| `dotenv` | Load variables from `.env` |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `MIRO_API_TOKEN is not set` | Check your `.env` file or pass via env: `MIRO_API_TOKEN=xxx npm run cli` |
| MCP server not responding | Verify with `claude mcp list`. Re-add if needed. |
| `boards:read` permission error | Ensure your Miro app has `boards:read` scope |
| Board not found | Check board ID. You can use the full Miro URL instead. |
| Analysis not working | Set `OPENAI_API_KEY` in `.env`. Analysis is optional. |
| `tsx` not found | Run `npm install` to install dev dependencies |
| Build errors | Run `npm run build` and check TypeScript errors |

## License

MIT
