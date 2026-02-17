import type {
  MiroBoard,
  MiroItem,
  MiroConnector,
  MiroPaginatedResponse,
  BoardCache,
} from "./types.js";

const BASE_URL = "https://api.miro.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Convert all parent-relative positions to absolute (canvas) coordinates.
 *
 * Miro API returns two coordinate systems:
 *   - relativeTo: "canvas_center"    → absolute (frames, free items)
 *   - relativeTo: "parent_top_left"  → relative to parent frame
 *
 * For parent_top_left items:
 *   absolute = parent_center - parent_size/2 + child_position
 *
 * Handles nested parents recursively.
 * Mutates items in place.
 */
function normalizePositions(items: MiroItem[]): void {
  const itemMap = new Map<string, MiroItem>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  // Cache resolved absolute positions to avoid recomputation
  const resolved = new Set<string>();

  function resolveItem(item: MiroItem): void {
    if (resolved.has(item.id)) return;
    if (!item.position) {
      resolved.add(item.id);
      return;
    }

    if (item.position.relativeTo !== "parent_top_left" || !item.parent?.id) {
      // Already absolute (canvas_center) or no parent
      resolved.add(item.id);
      return;
    }

    const parent = itemMap.get(item.parent.id);
    if (!parent || !parent.position) {
      resolved.add(item.id);
      return;
    }

    // Ensure parent is resolved first
    resolveItem(parent);

    const parentCenterX = parent.position.x;
    const parentCenterY = parent.position.y;
    const parentHalfW = (parent.geometry?.width ?? 0) / 2;
    const parentHalfH = (parent.geometry?.height ?? 0) / 2;

    // parent top-left in absolute coordinates
    const parentTopLeftX = parentCenterX - parentHalfW;
    const parentTopLeftY = parentCenterY - parentHalfH;

    item.position.x = parentTopLeftX + item.position.x;
    item.position.y = parentTopLeftY + item.position.y;
    item.position.relativeTo = "canvas_center";

    resolved.add(item.id);
  }

  for (const item of items) {
    resolveItem(item);
  }
}

export class MiroClient {
  private token: string;
  private cache: Map<string, BoardCache> = new Map();

  constructor() {
    const token = process.env.MIRO_API_TOKEN;
    if (!token) {
      throw new Error(
        "MIRO_API_TOKEN environment variable is required"
      );
    }
    this.token = token;
  }

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Miro API error ${response.status}: ${body}`
      );
    }

    return response.json() as Promise<T>;
  }

  async fetchAllPages<T>(url: string): Promise<T[]> {
    const allItems: T[] = [];
    let cursor: string | undefined;

    do {
      const separator = url.includes("?") ? "&" : "?";
      const pageUrl = cursor
        ? `${url}${separator}cursor=${encodeURIComponent(cursor)}`
        : url;

      const response =
        await this.request<MiroPaginatedResponse<T>>(pageUrl);

      allItems.push(...response.data);
      cursor = response.cursor;
    } while (cursor);

    return allItems;
  }

  async getBoardInfo(boardId: string): Promise<MiroBoard> {
    return this.request<MiroBoard>(
      `${BASE_URL}/v2/boards/${boardId}`
    );
  }

  async listBoards(): Promise<MiroBoard[]> {
    return this.fetchAllPages<MiroBoard>(
      `${BASE_URL}/v2/boards?sort=last_modified&limit=50`
    );
  }

  async getBoardData(
    boardId: string,
    forceRefresh = false
  ): Promise<BoardCache> {
    const cached = this.cache.get(boardId);

    if (
      !forceRefresh &&
      cached &&
      Date.now() - cached.fetchedAt < CACHE_TTL_MS
    ) {
      return cached;
    }

    const [board, items, connectors] = await Promise.all([
      this.getBoardInfo(boardId),
      this.fetchAllPages<MiroItem>(
        `${BASE_URL}/v2/boards/${boardId}/items?limit=50`
      ),
      this.fetchAllPages<MiroConnector>(
        `${BASE_URL}/v2/boards/${boardId}/connectors?limit=50`
      ),
    ]);

    normalizePositions(items);

    const boardCache: BoardCache = {
      board,
      items,
      connectors,
      fetchedAt: Date.now(),
    };

    this.cache.set(boardId, boardCache);
    return boardCache;
  }
}
