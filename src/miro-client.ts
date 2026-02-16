import type {
  MiroBoard,
  MiroItem,
  MiroConnector,
  MiroPaginatedResponse,
  BoardCache,
} from "./types.js";

const BASE_URL = "https://api.miro.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
