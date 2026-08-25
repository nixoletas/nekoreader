import type { Rotulos } from "@/lib/pdf-rotulos";

export type Rect = { x: number; y: number; w: number; h: number };

/** Trecho marcado dentro de um bloco de texto remontado (modo Texto). */
export type TextSpan = { bloco: number; start: number; end: number };

export type HighlightMode = "pagina" | "texto";

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

/** Formato do arquivo. No EPUB, "página" quer dizer capítulo. */
export type BookFormat = "pdf" | "epub";

/** O que o envio precisa saber sobre um arquivo antes de guardá-lo na estante. */
export type Inspecao = {
  totalPages: number;
  cover: Blob | null;
  /** O EPUB traz escrito; no PDF vem nulo e sobra o nome do arquivo. */
  title: string | null;
  author: string | null;
};

export type Book = {
  id: string;
  user_id: string;
  title: string;
  format: BookFormat;
  author: string | null;
  storage_path: string;
  cover_path: string | null;
  size_bytes: number | null;
  total_pages: number | null;
  last_page: number;
  /**
   * Onde a leitura parou em cada página: `{ "12": 0.42 }` = 42% da rolagem.
   * Fração, e não pixel, pra mesma posição valer no computador e no celular.
   */
  positions: Record<string, number> | null;
  last_read_at: string | null;
  /**
   * A numeração impressa do livro, descoberta uma vez e válida em todo aparelho.
   * `null` na coluna = ninguém varreu ainda; `rotulos: null` dentro = varreu, e
   * este livro não numera por conta própria.
   */
  page_labels: RotulosSalvos | null;
  created_at: string;
};

/**
 * Como a numeração fica guardada no servidor.
 *
 * O `versao` é o mesmo `VERSAO_ROTULOS` do cache local: quando a dedução
 * melhorar, o que está gravado aqui envelhece junto e é varrido de novo.
 */
export type RotulosSalvos = { versao: number; rotulos: Rotulos | null };

export type Highlight = {
  id: string;
  book_id: string;
  user_id: string;
  page: number;
  text: string | null;
  /** Título dado pela pessoa à marcação — opcional. */
  title: string | null;
  /** Nota escrita pela pessoa sobre o trecho — opcional, texto longo. */
  note: string | null;
  color: HighlightColor;
  mode: HighlightMode;
  /** Usado no modo página — vazio no modo texto. */
  rects: Rect[];
  /** Usado no modo texto — vazio no modo página. */
  spans: TextSpan[];
  created_at: string;
};

/**
 * Marcações da mais recente pra mais antiga.
 *
 * O que a pessoa acabou de marcar é o que ela quer ver primeiro — a ordem da
 * página só importaria se a lista fosse um índice do livro, e ela não é.
 */
export function porMaisRecente(hs: Highlight[]): Highlight[] {
  return [...hs].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export type Bookmark = {
  id: string;
  book_id: string;
  user_id: string;
  page: number;
  label: string | null;
  created_at: string;
};

/**
 * Onde a leitura parou num aparelho específico.
 *
 * `books.last_page` guarda a posição mais recente do livro, venha de onde vier —
 * é o que a estante mostra. Isto aqui é por aparelho, e é o que permite abrir o
 * celular onde o celular parou e ainda assim oferecer "continuar do computador".
 */
export type PosicaoDispositivo = {
  book_id: string;
  user_id: string;
  device_id: string;
  device_name: string;
  page: number;
  /** Fração (0..1) da rolagem dentro da página. */
  fraction: number;
  updated_at: string;
};
