export type Rect = { x: number; y: number; w: number; h: number };

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

/** Cor cheia — só para os botõezinhos de escolha. */
export const HIGHLIGHT_SWATCH: Record<HighlightColor, string> = {
  yellow: "#f2c14e",
  green: "#8ab87a",
  blue: "#7aa7c7",
  pink: "#d18aa6",
};

/** Cor aplicada sobre a página: bem translúcida, o texto continua legível. */
export const HIGHLIGHT_FILL: Record<HighlightColor, string> = {
  yellow: "rgba(247, 201, 72, 0.30)",
  green: "rgba(126, 191, 120, 0.26)",
  blue: "rgba(108, 170, 214, 0.26)",
  pink: "rgba(226, 130, 168, 0.24)",
};

export const HIGHLIGHT_LABEL: Record<HighlightColor, string> = {
  yellow: "Âmbar",
  green: "Verde",
  blue: "Azul",
  pink: "Rosa",
};

export function fill(c: string): string {
  return HIGHLIGHT_FILL[c as HighlightColor] ?? HIGHLIGHT_FILL.yellow;
}

export function swatch(c: string): string {
  return HIGHLIGHT_SWATCH[c as HighlightColor] ?? HIGHLIGHT_SWATCH.yellow;
}

export type Book = {
  id: string;
  user_id: string;
  title: string;
  author: string | null;
  storage_path: string;
  cover_path: string | null;
  size_bytes: number | null;
  total_pages: number | null;
  last_page: number;
  last_read_at: string | null;
  created_at: string;
};

export type Highlight = {
  id: string;
  book_id: string;
  user_id: string;
  page: number;
  text: string | null;
  color: HighlightColor;
  rects: Rect[];
  created_at: string;
};

export type Bookmark = {
  id: string;
  book_id: string;
  user_id: string;
  page: number;
  label: string | null;
  created_at: string;
};
