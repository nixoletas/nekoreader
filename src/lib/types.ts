export type Rect = { x: number; y: number; w: number; h: number };

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: "#fde047",
  green: "#86efac",
  blue: "#93c5fd",
  pink: "#f9a8d4",
};

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
