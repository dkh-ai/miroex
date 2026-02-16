// Raw Miro API types

export interface MiroBoard {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  modifiedAt: string;
}

export interface MiroItem {
  id: string;
  type: string; // "sticky_note", "shape", "text", "image", "frame", "card", etc.
  data?: {
    content?: string; // HTML content
    shape?: string; // for shapes
    title?: string; // for frames
    fields?: Array<{ value: string }>; // for cards
  };
  style?: {
    fillColor?: string;
    fontFamily?: string;
    fontSize?: string;
    textAlign?: string;
    borderColor?: string;
    borderWidth?: string;
    color?: string;
  };
  position?: {
    x: number;
    y: number;
  };
  geometry?: {
    width: number;
    height: number;
    rotation?: number;
  };
  parent?: {
    id: string;
  };
}

export interface MiroConnector {
  id: string;
  startItem?: { id: string };
  endItem?: { id: string };
  captions?: Array<{ content?: string }>;
  style?: {
    strokeColor?: string;
    strokeWidth?: string;
    startStrokeCap?: string;
    endStrokeCap?: string;
    strokeStyle?: string;
  };
}

export interface MiroPaginatedResponse<T> {
  data: T[];
  cursor?: string;
  size: number;
  total?: number;
}

// Internal cache types

export interface BoardCache {
  board: MiroBoard;
  items: MiroItem[];
  connectors: MiroConnector[];
  fetchedAt: number;
}

// Spatial types

export interface Cluster {
  id: number;
  items: MiroItem[];
  centroid: { x: number; y: number };
  bounds: BoundingBox;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
