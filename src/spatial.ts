import type { MiroItem, Cluster, BoundingBox } from "./types.js";

/**
 * Get center coordinates of an item. Returns null if the item has no position.
 * Miro positions are already center-based.
 */
export function getItemCenter(item: MiroItem): { x: number; y: number } | null {
  if (!item.position) {
    return null;
  }
  return { x: item.position.x, y: item.position.y };
}

/**
 * Compute diagonal length from item geometry.
 * Returns 100 as default when geometry is absent.
 */
export function getItemDiagonal(item: MiroItem): number {
  if (!item.geometry) {
    return 100;
  }
  const width = item.geometry.width ?? 0;
  const height = item.geometry.height ?? 0;
  const diag = Math.sqrt(width * width + height * height);
  return diag > 0 ? diag : 100;
}

/**
 * Compute the bounding box that encloses all items,
 * accounting for their positions and dimensions.
 * Items without positions are skipped.
 */
export function getBoardBounds(items: MiroItem[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    const center = getItemCenter(item);
    if (!center) continue;

    const halfWidth = (item.geometry?.width ?? 0) / 2;
    const halfHeight = (item.geometry?.height ?? 0) / 2;

    const left = center.x - halfWidth;
    const right = center.x + halfWidth;
    const top = center.y - halfHeight;
    const bottom = center.y + halfHeight;

    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;
  }

  // No positioned items found
  if (minX === Infinity) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Convert absolute coordinates to a human-readable position label
 * by dividing the bounding box into a 3x3 grid.
 *
 * Returns one of: "top-left", "top-center", "top-right",
 * "center-left", "center", "center-right",
 * "bottom-left", "bottom-center", "bottom-right"
 */
export function describePosition(
  x: number,
  y: number,
  bounds: BoundingBox,
): string {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  // Degenerate bounds: everything collapses to one point
  if (width === 0 && height === 0) {
    return "center";
  }

  const thirdW = width / 3;
  const thirdH = height / 3;

  let col: "left" | "center" | "right";
  if (x < bounds.minX + thirdW) {
    col = "left";
  } else if (x < bounds.minX + 2 * thirdW) {
    col = "center";
  } else {
    col = "right";
  }

  let row: "top" | "center" | "bottom";
  if (y < bounds.minY + thirdH) {
    row = "top";
  } else if (y < bounds.minY + 2 * thirdH) {
    row = "center";
  } else {
    row = "bottom";
  }

  if (row === "center" && col === "center") {
    return "center";
  }
  if (row === "center") {
    return `center-${col}`;
  }
  if (col === "center") {
    return `${row}-center`;
  }
  return `${row}-${col}`;
}

/**
 * Sort items in reading order: top-to-bottom, left-to-right.
 * Items within 50px vertical distance are treated as the same row
 * and sorted by x coordinate.
 * Items without positions are placed at the end.
 */
export function sortReadingOrder(items: MiroItem[]): MiroItem[] {
  const ROW_TOLERANCE = 50;

  return [...items].sort((a, b) => {
    const centerA = getItemCenter(a);
    const centerB = getItemCenter(b);

    // Items without positions sort to the end
    if (!centerA && !centerB) return 0;
    if (!centerA) return 1;
    if (!centerB) return -1;

    // Within vertical tolerance, treat as same row and sort by x
    if (Math.abs(centerA.y - centerB.y) <= ROW_TOLERANCE) {
      return centerA.x - centerB.x;
    }

    // Otherwise sort by y (top to bottom)
    return centerA.y - centerB.y;
  });
}

/**
 * Euclidean distance between two 2D points.
 */
function euclideanDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute centroid (average center) from a set of positioned items.
 */
function computeCentroid(items: MiroItem[]): { x: number; y: number } {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (const item of items) {
    const center = getItemCenter(item);
    if (center) {
      sumX += center.x;
      sumY += center.y;
      count++;
    }
  }

  if (count === 0) {
    return { x: 0, y: 0 };
  }

  return { x: sumX / count, y: sumY / count };
}

/**
 * DBSCAN-like clustering of board items by spatial proximity.
 *
 * Algorithm:
 * 1. Separate positioned and unpositioned items.
 * 2. Compute effective radius (default: mean diagonal * 3).
 * 3. BFS from each unvisited item to find all neighbors within radius.
 * 4. Each connected component becomes a cluster.
 * 5. Unpositioned items form a separate cluster at the end.
 */
export function clusterItems(
  items: MiroItem[],
  radius?: number,
): Cluster[] {
  const positioned: MiroItem[] = [];
  const unpositioned: MiroItem[] = [];

  for (const item of items) {
    if (getItemCenter(item)) {
      positioned.push(item);
    } else {
      unpositioned.push(item);
    }
  }

  // Compute default radius: mean diagonal of all positioned items * 3
  const effectiveRadius =
    radius ??
    (positioned.length > 0
      ? (positioned.reduce((sum, item) => sum + getItemDiagonal(item), 0) /
          positioned.length) *
        3
      : 300);

  // Pre-compute centers to avoid repeated lookups
  const centers: { x: number; y: number }[] = positioned.map(
    (item) => getItemCenter(item) as { x: number; y: number },
  );

  const visited = new Set<number>();
  const clusters: Cluster[] = [];
  let clusterId = 0;

  for (let i = 0; i < positioned.length; i++) {
    if (visited.has(i)) continue;

    // BFS to discover all items reachable within radius
    const clusterIndices: number[] = [];
    const queue: number[] = [i];
    visited.add(i);

    while (queue.length > 0) {
      const current = queue.shift()!;
      clusterIndices.push(current);

      for (let j = 0; j < positioned.length; j++) {
        if (visited.has(j)) continue;
        if (euclideanDistance(centers[current], centers[j]) <= effectiveRadius) {
          visited.add(j);
          queue.push(j);
        }
      }
    }

    const memberItems = clusterIndices.map((idx) => positioned[idx]);
    clusters.push({
      id: clusterId++,
      items: memberItems,
      centroid: computeCentroid(memberItems),
      bounds: getBoardBounds(memberItems),
    });
  }

  // Unpositioned items go into a special cluster
  if (unpositioned.length > 0) {
    clusters.push({
      id: clusterId,
      items: unpositioned,
      centroid: { x: 0, y: 0 },
      bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    });
  }

  return clusters;
}
