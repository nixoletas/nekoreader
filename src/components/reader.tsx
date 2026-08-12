"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  HIGHLIGHT_COLORS,
  type Book,
  type Bookmark,
  type Highlight,
  type HighlightColor,
  type Rect,
} from "@/lib/types";

const PdfCanvas = dynamic(() => import("./pdf-canvas"), {
  ssr: false,
  loading: () => (
    <div className="py-24 text-center text-sm text-muted">Carregando...</div>
  ),
});

type Aba = "marcacoes" | "paginas";

export default function Reader({
  book,
  fileUrl,
  initialHighlights,
  initialBookmarks,
}: {
  book: Book;
  fileUrl: string;
  initialHighlights: Highlight[];
  initialBookmarks: Bookmark[];
}) {
  const [supabase] = useState(createClient);

  const [numPages, setNumPages] = useState(book.total_pages ?? 0);
  const [page, setPage] = useState(Math.max(1, book.last_page || 1));
  const [zoom, setZoom] = useState(1);
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [aba, setAba] = useState<Aba>("marcacoes");
  const [sidebar, setSidebar] = useState(true);
  const [salvo, setSalvo] = useState(true);

  const marcada = bookmarks.some((b) => b.page === page);
  const daPagina = highlights.filter((h) => h.page === page);

  // ---- lembrar a página ----
  const primeiroRender = useRef(true);
  useEffect(() => {
    if (primeiroRender.current) {
      primeiroRender.current = false;
      return;
    }
    setSalvo(false);
    const t = setTimeout(async () => {
      await supabase
        .from("books")
        .update({ last_page: page, last_read_at: new Date().toISOString() })
        .eq("id", book.id);
      setSalvo(true);
    }, 700);
    return () => clearTimeout(t);
  }, [page, book.id, supabase]);

  const irPara = useCallback(
    (p: number) => {
      const max = numPages || p;
      setPage(Math.min(Math.max(1, p), max));
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [numPages],
  );

  // ---- teclado ----
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") irPara(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") irPara(page - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, irPara]);

  async function onLoadSuccess(total: number) {
    setNumPages(total);
    if (book.total_pages !== total) {
      await supabase.from("books").update({ total_pages: total }).eq("id", book.id);
    }
    if (page > total) setPage(total);
  }

  async function addHighlight(
    rects: Rect[],
    text: string,
    color: HighlightColor,
  ) {
    const { data, error } = await supabase
      .from("highlights")
      .insert({
        book_id: book.id,
        user_id: book.user_id,
        page,
        text: text.slice(0, 2000),
        color,
        rects,
      })
      .select()
      .single();
    if (error) {
      alert(`Não salvou a marcação: ${error.message}`);
      return;
    }
    setHighlights((h) => [...h, data as Highlight]);
  }

  async function delHighlight(id: string) {
    setHighlights((h) => h.filter((x) => x.id !== id));
    const { error } = await supabase.from("highlights").delete().eq("id", id);
    if (error) alert(error.message);
  }

  async function toggleBookmark() {
    const existente = bookmarks.find((b) => b.page === page);
    if (existente) {
      setBookmarks((b) => b.filter((x) => x.id !== existente.id));
      await supabase.from("bookmarks").delete().eq("id", existente.id);
      return;
    }
    const { data, error } = await supabase
      .from("bookmarks")
      .insert({ book_id: book.id, user_id: book.user_id, page })
      .select()
      .single();
    if (error) {
      alert(error.message);
      return;
    }
    setBookmarks((b) => [...b, data as Bookmark].sort((x, y) => x.page - y.page));
  }

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ---------- barra superior ---------- */}
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-surface/95 px-3 py-2 backdrop-blur">
        <Link
          href="/"
          className="rounded-lg px-2 py-1.5 text-sm font-medium text-muted hover:text-foreground"
          title="Voltar para a biblioteca"
        >
          ← Biblioteca
        </Link>

        <h1
          className="mr-auto max-w-[38ch] truncate text-sm font-semibold"
          title={book.title}
        >
          {book.title}
        </h1>

        <div className="flex items-center gap-1 rounded-lg border border-border px-1 py-0.5">
          <Botao onClick={() => irPara(page - 1)} disabled={page <= 1}>
            ‹
          </Botao>
          <input
            type="number"
            value={page}
            min={1}
            max={numPages || undefined}
            onChange={(e) => irPara(Number(e.target.value) || 1)}
            className="w-14 bg-transparent text-center text-sm outline-none"
          />
          <span className="pr-1 text-sm text-muted">
            / {numPages || "?"}
          </span>
          <Botao
            onClick={() => irPara(page + 1)}
            disabled={!!numPages && page >= numPages}
          >
            ›
          </Botao>
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-border px-1 py-0.5">
          <Botao onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>
            −
          </Botao>
          <span className="w-12 text-center text-xs text-muted">
            {Math.round(zoom * 100)}%
          </span>
          <Botao onClick={() => setZoom((z) => Math.min(3, z + 0.15))}>+</Botao>
        </div>

        <button
          onClick={toggleBookmark}
          title={marcada ? "Remover marcador da página" : "Marcar esta página"}
          className={`rounded-lg border px-2.5 py-1.5 text-sm transition ${
            marcada
              ? "border-amber-400 bg-amber-400/15 text-amber-600 dark:text-amber-300"
              : "border-border text-muted hover:text-foreground"
          }`}
        >
          {marcada ? "★ Marcada" : "☆ Marcar página"}
        </button>

        <button
          onClick={() => setSidebar((s) => !s)}
          className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-muted hover:text-foreground"
        >
          {sidebar ? "Ocultar painel" : "Painel"}
        </button>

        <span className="w-16 text-right text-xs text-muted">
          {salvo ? "salvo" : "salvando..."}
        </span>
      </header>

      <div className="flex flex-1 items-start">
        {/* ---------- leitor ---------- */}
        <main className="min-w-0 flex-1 px-2 py-6 sm:px-6">
          <PdfCanvas
            fileUrl={fileUrl}
            pageNumber={page}
            zoom={zoom}
            highlights={daPagina}
            onLoadSuccess={onLoadSuccess}
            onAddHighlight={addHighlight}
            onDeleteHighlight={delHighlight}
          />
          <p className="mt-4 text-center text-xs text-muted">
            Selecione um trecho para marcar. Setas ← → mudam de página.
          </p>
        </main>

        {/* ---------- painel lateral ---------- */}
        {sidebar && (
          <aside className="sticky top-[57px] hidden h-[calc(100dvh-57px)] w-80 shrink-0 overflow-y-auto border-l border-border bg-surface lg:block">
            <div className="grid grid-cols-2 gap-1 border-b border-border p-2">
              {(
                [
                  ["marcacoes", `Marcações (${highlights.length})`],
                  ["paginas", `Páginas (${bookmarks.length})`],
                ] as [Aba, string][]
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setAba(k)}
                  className={`rounded-md px-2 py-1.5 text-sm font-medium transition ${
                    aba === k
                      ? "bg-accent/10 text-accent"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {aba === "marcacoes" ? (
              <ul className="divide-y divide-border">
                {highlights.length === 0 && (
                  <li className="p-4 text-sm text-muted">
                    Nenhuma marcação ainda.
                  </li>
                )}
                {highlights.map((h) => (
                  <li key={h.id} className="group p-3 hover:bg-background">
                    <button
                      onClick={() => irPara(h.page)}
                      className="block w-full text-left"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            background:
                              HIGHLIGHT_COLORS[h.color] ??
                              HIGHLIGHT_COLORS.yellow,
                          }}
                        />
                        <span className="text-xs text-muted">
                          página {h.page}
                        </span>
                      </div>
                      <p className="line-clamp-4 text-sm">
                        {h.text || "(sem texto)"}
                      </p>
                    </button>
                    <button
                      onClick={() => void delHighlight(h.id)}
                      className="mt-1 text-xs text-muted opacity-0 transition hover:text-red-500 group-hover:opacity-100"
                    >
                      excluir
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-border">
                {bookmarks.length === 0 && (
                  <li className="p-4 text-sm text-muted">
                    Nenhuma página marcada.
                  </li>
                )}
                {bookmarks.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between p-3 hover:bg-background"
                  >
                    <button
                      onClick={() => irPara(b.page)}
                      className="text-sm font-medium"
                    >
                      ★ Página {b.page}
                    </button>
                    <button
                      onClick={async () => {
                        setBookmarks((x) => x.filter((y) => y.id !== b.id));
                        await supabase.from("bookmarks").delete().eq("id", b.id);
                      }}
                      className="text-xs text-muted hover:text-red-500"
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function Botao({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-base leading-none text-muted transition hover:bg-background hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}
