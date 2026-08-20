"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { urlAssinadaDoLivro } from "@/lib/pdf-url-cache";
import { obterPdfOffline } from "@/lib/offline-db";
import { executarOuEnfileirar, sincronizarFila } from "@/lib/offline-sync";
import { useFilaPendente, useOnline } from "@/lib/use-offline";
import { usePreferencia } from "@/lib/prefs";
import { Botao } from "@/components/ui";
import {
  swatch,
  type Book,
  type Bookmark,
  type Highlight,
  type HighlightColor,
  type Rect,
  type TextSpan,
} from "@/lib/types";

const PdfCanvas = dynamic(() => import("./pdf-canvas"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto aspect-[1/1.4] w-full max-w-3xl animate-pulse rounded-lg bg-surface" />
  ),
});

const PdfText = dynamic(() => import("./pdf-text"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto h-96 w-full max-w-[38rem] animate-pulse rounded-lg bg-surface" />
  ),
});

type Aba = "marcacoes" | "paginas";
type Sheet = null | "painel" | "ir";
type Modo = "pagina" | "texto";

/** Corpo do texto no modo leitura, em rem. */
const FONTE_BASE = 1.05;
const FONTE_MIN = 0.85;
const FONTE_MAX = 2.2;
const CHAVE_MODO = "marginalia:modo";
const CHAVE_FONTE = "marginalia:fonte";

export default function Reader({
  book,
  initialHighlights,
  initialBookmarks,
}: {
  book: Book;
  initialHighlights: Highlight[];
  initialBookmarks: Bookmark[];
}) {
  const [supabase] = useState(createClient);

  // Arquivo do livro: se já foi baixado pra leitura offline, lê o blob local (funciona
  // sem internet e evita gastar rede à toa); senão pede a URL assinada de sempre.
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [erroArquivo, setErroArquivo] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    let urlLocal: string | null = null;

    (async () => {
      try {
        const offline = await obterPdfOffline(book.id);
        if (!vivo) return;
        if (offline) {
          urlLocal = URL.createObjectURL(offline.blob);
          setFileUrl(urlLocal);
          return;
        }
        const url = await urlAssinadaDoLivro(supabase, book.storage_path);
        if (vivo) setFileUrl(url);
      } catch (e) {
        if (vivo)
          setErroArquivo(e instanceof Error ? e.message : "URL não gerada.");
      }
    })();

    return () => {
      vivo = false;
      if (urlLocal) URL.revokeObjectURL(urlLocal);
    };
  }, [supabase, book.id, book.storage_path]);

  // Sincroniza a fila local (progresso, marcações) sempre que a conexão estiver de pé.
  const online = useOnline();
  const pendencias = useFilaPendente();
  useEffect(() => {
    if (!online) return;
    void sincronizarFila(supabase);
  }, [online, supabase]);

  const [numPages, setNumPages] = useState(book.total_pages ?? 0);
  const [page, setPage] = useState(Math.max(1, book.last_page || 1));
  const [zoom, setZoom] = useState(1);
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [aba, setAba] = useState<Aba>("marcacoes");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [salvo, setSalvo] = useState(true);
  // preferências de leitura, lembradas entre livros
  const [modo, mudarModo] = usePreferencia<Modo>(CHAVE_MODO, "pagina", (v) =>
    v === "texto" || v === "pagina" ? v : null,
  );
  const [fonte, setFonte] = usePreferencia(CHAVE_FONTE, FONTE_BASE, (v) => {
    const n = Number(v);
    return n >= FONTE_MIN && n <= FONTE_MAX ? n : null;
  });

  const marcada = bookmarks.some((b) => b.page === page);
  const daPagina = highlights.filter((h) => h.page === page);
  const marcacoesPagina = daPagina.filter((h) => h.mode === "pagina");
  const marcacoesTexto = daPagina.filter((h) => h.mode === "texto");

  function mudarFonte(delta: number) {
    const nova = Math.min(FONTE_MAX, Math.max(FONTE_MIN, fonte + delta));
    setFonte(Math.round(nova * 100) / 100);
  }

  // ---------- lembrar a página ----------
  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    setSalvo(false);
    const t = setTimeout(async () => {
      await executarOuEnfileirar(supabase, `last_page:${book.id}`, {
        tipo: "last_page",
        bookId: book.id,
        page,
        lastReadAt: new Date().toISOString(),
      });
      setSalvo(true);
    }, 700);
    return () => clearTimeout(t);
  }, [page, book.id, supabase]);

  const irPara = useCallback(
    (p: number) => {
      const max = numPages || p;
      const alvo = Math.min(Math.max(1, p), max);
      setPage(alvo);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [numPages],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") irPara(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") irPara(page - 1);
      if (e.key === "Escape") setSheet(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, irPara]);

  const onLoadSuccess = useCallback(
    async (total: number) => {
      setNumPages(total);
      setPage((p) => Math.min(p, total));
      if (book.total_pages !== total) {
        await supabase
          .from("books")
          .update({ total_pages: total })
          .eq("id", book.id);
      }
    },
    [book.id, book.total_pages, supabase],
  );

  async function addHighlight(
    color: HighlightColor,
    text: string,
    sel: { mode: "pagina"; rects: Rect[] } | { mode: "texto"; spans: TextSpan[] },
  ) {
    const registro: Highlight = {
      id: crypto.randomUUID(),
      book_id: book.id,
      user_id: book.user_id,
      page,
      text: text.slice(0, 2000),
      color,
      mode: sel.mode,
      rects: sel.mode === "pagina" ? sel.rects : [],
      spans: sel.mode === "texto" ? sel.spans : [],
      created_at: new Date().toISOString(),
    };
    setHighlights((h) => [...h, registro]);
    await executarOuEnfileirar(supabase, `add:${registro.id}`, {
      tipo: "highlight_add",
      row: registro,
    });
  }

  async function addHighlightPagina(
    rects: Rect[],
    text: string,
    color: HighlightColor,
  ) {
    await addHighlight(color, text, { mode: "pagina", rects });
  }

  async function addHighlightTexto(
    spans: TextSpan[],
    text: string,
    color: HighlightColor,
  ) {
    await addHighlight(color, text, { mode: "texto", spans });
  }

  async function delHighlight(id: string) {
    setHighlights((h) => h.filter((x) => x.id !== id));
    await executarOuEnfileirar(supabase, `del:${id}`, { tipo: "highlight_del", id });
  }

  async function delBookmark(id: string) {
    setBookmarks((b) => b.filter((x) => x.id !== id));
    await executarOuEnfileirar(supabase, `bmdel:${id}`, { tipo: "bookmark_del", id });
  }

  async function toggleBookmark() {
    const existente = bookmarks.find((b) => b.page === page);
    if (existente) return delBookmark(existente.id);

    const registro: Bookmark = {
      id: crypto.randomUUID(),
      book_id: book.id,
      user_id: book.user_id,
      page,
      label: null,
      created_at: new Date().toISOString(),
    };
    setBookmarks((b) => [...b, registro].sort((x, y) => x.page - y.page));
    await executarOuEnfileirar(supabase, `bmadd:${registro.id}`, {
      tipo: "bookmark_add",
      row: registro,
    });
  }

  const painel = (
    <Painel
      aba={aba}
      setAba={setAba}
      highlights={highlights}
      bookmarks={bookmarks}
      onIr={(p) => {
        irPara(p);
        setSheet(null);
      }}
      onDelHighlight={delHighlight}
      onDelBookmark={delBookmark}
    />
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {/* ================= barra superior ================= */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="flex items-center gap-1 px-2 py-1.5 sm:px-3">
          <Link
            href="/"
            aria-label="Voltar para a estante"
            className="tap rounded-xl text-lg text-muted transition hover:text-foreground"
          >
            ←
          </Link>

          <h1
            className="display mr-auto min-w-0 flex-1 truncate text-[15px] sm:text-base"
            title={book.title}
          >
            {book.title}
          </h1>

          {!online ? (
            <span
              title={
                pendencias > 0
                  ? `Sem internet · ${pendencias} pendente${pendencias > 1 ? "s" : ""} pra sincronizar`
                  : "Sem internet — lendo offline"
              }
              className="mr-1 shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-medium text-muted"
            >
              offline{pendencias > 0 ? ` · ${pendencias}` : ""}
            </span>
          ) : (
            <span
              aria-label={
                pendencias > 0 ? `${pendencias} pendente(s) de sincronizar` : salvo ? "salvo" : "salvando"
              }
              title={
                pendencias > 0
                  ? `Sincronizando ${pendencias} pendência${pendencias > 1 ? "s" : ""}...`
                  : salvo
                    ? "Tudo salvo"
                    : "Salvando..."
              }
              className={`mr-1 h-2 w-2 shrink-0 rounded-full transition ${
                salvo && pendencias === 0
                  ? "bg-emerald-500/70"
                  : "bg-[var(--gold)] animate-pulse"
              }`}
            />
          )}

          {/* controles completos só no desktop */}
          <div className="hidden items-center gap-1 lg:flex">
            <div className="flex items-center rounded-xl border border-border">
              <IconBtn onClick={() => irPara(page - 1)} disabled={page <= 1}>
                ‹
              </IconBtn>
              <input
                type="number"
                value={page}
                min={1}
                max={numPages || undefined}
                onChange={(e) => irPara(Number(e.target.value) || 1)}
                className="w-14 bg-transparent text-center text-sm outline-none"
              />
              <span className="pr-2 text-sm text-muted">/ {numPages || "?"}</span>
              <IconBtn
                onClick={() => irPara(page + 1)}
                disabled={!!numPages && page >= numPages}
              >
                ›
              </IconBtn>
            </div>

            <Segmento modo={modo} onModo={mudarModo} />

            {modo === "pagina" ? (
              <div className="flex items-center rounded-xl border border-border">
                <IconBtn onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>
                  −
                </IconBtn>
                <span className="w-12 text-center text-xs text-muted">
                  {Math.round(zoom * 100)}%
                </span>
                <IconBtn onClick={() => setZoom((z) => Math.min(3, z + 0.15))}>
                  +
                </IconBtn>
              </div>
            ) : (
              <div className="flex items-center rounded-xl border border-border">
                <IconBtn
                  onClick={() => mudarFonte(-0.1)}
                  disabled={fonte <= FONTE_MIN}
                >
                  <span className="text-[13px] font-semibold">A−</span>
                </IconBtn>
                <span className="w-12 text-center text-xs text-muted">
                  {Math.round((fonte / FONTE_BASE) * 100)}%
                </span>
                <IconBtn
                  onClick={() => mudarFonte(0.1)}
                  disabled={fonte >= FONTE_MAX}
                >
                  <span className="text-[17px] font-semibold">A+</span>
                </IconBtn>
              </div>
            )}

            <button
              onClick={toggleBookmark}
              className={`tap rounded-xl border px-4 text-sm font-medium transition ${
                marcada
                  ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)]"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {marcada ? "★ Marcada" : "☆ Marcar"}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-start">
        {/* ================= página ================= */}
        <main className="min-w-0 flex-1 px-2 pb-32 pt-4 sm:px-6 sm:pb-10 sm:pt-6">
          {erroArquivo ? (
            <div className="mx-auto max-w-lg px-4 py-24 text-center">
              <p className="text-lg font-semibold">Não consegui abrir o arquivo</p>
              <p className="mt-2 text-sm text-muted">{erroArquivo}</p>
              <Link href="/" className="mt-6 inline-block text-accent underline">
                Voltar para a biblioteca
              </Link>
            </div>
          ) : !fileUrl ? (
            <div className="mx-auto aspect-[1/1.4] w-full max-w-3xl animate-pulse rounded-lg bg-surface" />
          ) : (
            <>
              {modo === "pagina" ? (
                <PdfCanvas
                  fileUrl={fileUrl}
                  pageNumber={page}
                  zoom={zoom}
                  highlights={marcacoesPagina}
                  onLoadSuccess={onLoadSuccess}
                  onAddHighlight={addHighlightPagina}
                  onDeleteHighlight={delHighlight}
                  onSwipe={(dir) => irPara(page + dir)}
                />
              ) : (
                <PdfText
                  fileUrl={fileUrl}
                  pageNumber={page}
                  escala={fonte}
                  highlights={marcacoesTexto}
                  onLoadSuccess={onLoadSuccess}
                  onAddHighlight={addHighlightTexto}
                  onDeleteHighlight={delHighlight}
                  onSwipe={(dir) => irPara(page + dir)}
                  onModoPagina={() => mudarModo("pagina")}
                />
              )}
              <p className="mt-5 text-center text-xs text-muted">
                {modo === "pagina"
                  ? "Selecione um trecho para marcar · deslize o dedo ou use ← → para virar a página"
                  : "Texto remontado do PDF, com as imagens encaixadas — selecione um trecho para marcar"}
              </p>
            </>
          )}
        </main>

        {/* ================= painel (desktop) ================= */}
        <aside className="sticky top-[53px] hidden h-[calc(100dvh-53px)] w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-surface lg:flex">
          {painel}
        </aside>
      </div>

      {/* ================= barra inferior (mobile) ================= */}
      <nav className="safe-b fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 border-t border-border bg-surface/95 px-2 pt-1 backdrop-blur-md lg:hidden">
        <BarBtn
          onClick={() => irPara(page - 1)}
          disabled={page <= 1}
          label="Anterior"
        >
          ‹
        </BarBtn>

        <BarBtn onClick={toggleBookmark} label={marcada ? "Marcada" : "Marcar"}>
          <span className={marcada ? "text-[var(--gold)]" : ""}>
            {marcada ? "★" : "☆"}
          </span>
        </BarBtn>

        <button
          onClick={() => setSheet("ir")}
          className="tap min-w-[5.5rem] flex-col rounded-xl px-3 !gap-0"
        >
          <span className="text-[15px] font-semibold leading-tight">{page}</span>
          <span className="text-[10px] leading-tight text-muted">
            de {numPages || "?"}
          </span>
        </button>

        <BarBtn onClick={() => setSheet("painel")} label="Marcações">
          ✎
          {highlights.length > 0 && (
            <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
              {highlights.length}
            </span>
          )}
        </BarBtn>

        <BarBtn
          onClick={() => irPara(page + 1)}
          disabled={!!numPages && page >= numPages}
          label="Próxima"
        >
          ›
        </BarBtn>
      </nav>

      {/* ================= folhas (mobile) ================= */}
      {sheet && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal>
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setSheet(null)}
          />
          <div className="sobe absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-3xl border-t border-border bg-surface shadow-2xl">
            <div className="flex justify-center py-2.5">
              <span className="h-1.5 w-10 rounded-full bg-border" />
            </div>

            {sheet === "painel" ? (
              <div className="flex max-h-[calc(82dvh-2.5rem)] flex-col">
                {painel}
              </div>
            ) : (
              <div className="safe-b space-y-6 px-5 pb-5">
                <div>
                  <p className="mb-2 text-sm font-medium text-muted">
                    Ir para a página
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      defaultValue={page}
                      min={1}
                      max={numPages || undefined}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 1) irPara(v);
                      }}
                      className="h-12 w-28 rounded-xl border border-border bg-background px-4 text-center text-base outline-none focus:border-accent"
                    />
                    <span className="text-sm text-muted">
                      de {numPages || "?"}
                    </span>
                    <Botao
                      variante="contorno"
                      onClick={() => setSheet(null)}
                      className="ml-auto"
                    >
                      Pronto
                    </Botao>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-muted">
                    Como ler
                  </p>
                  <Segmento
                    modo={modo}
                    onModo={mudarModo}
                    className="w-full [&_button]:!min-h-12"
                  />
                </div>

                {modo === "pagina" ? (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted">
                      Tamanho da página · {Math.round(zoom * 100)}%
                    </p>
                    <div className="flex gap-2">
                      <Botao
                        variante="contorno"
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                        className="flex-1 text-xl"
                      >
                        −
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => setZoom(1)}
                        className="flex-1"
                      >
                        Ajustar
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
                        className="flex-1 text-xl"
                      >
                        +
                      </Botao>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted">
                      Tamanho da letra · {Math.round((fonte / FONTE_BASE) * 100)}
                      %
                    </p>
                    <div className="flex gap-2">
                      <Botao
                        variante="contorno"
                        onClick={() => mudarFonte(-0.1)}
                        disabled={fonte <= FONTE_MIN}
                        className="flex-1 text-base"
                      >
                        A−
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => mudarFonte(FONTE_BASE - fonte)}
                        className="flex-1"
                      >
                        Padrão
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => mudarFonte(0.1)}
                        disabled={fonte >= FONTE_MAX}
                        className="flex-1 text-2xl"
                      >
                        A+
                      </Botao>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Painel({
  aba,
  setAba,
  highlights,
  bookmarks,
  onIr,
  onDelHighlight,
  onDelBookmark,
}: {
  aba: Aba;
  setAba: (a: Aba) => void;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  onIr: (p: number) => void;
  onDelHighlight: (id: string) => void;
  onDelBookmark: (id: string) => void;
}) {
  return (
    <>
      <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-border p-2">
        {(
          [
            ["marcacoes", `Marcações ${highlights.length}`],
            ["paginas", `Páginas ${bookmarks.length}`],
          ] as [Aba, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`tap rounded-xl text-sm font-semibold transition ${
              aba === k
                ? "bg-accent/10 text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="safe-b flex-1 overflow-y-auto">
        {aba === "marcacoes" ? (
          highlights.length === 0 ? (
            <Vazio>
              Nada marcado ainda. Selecione um trecho na página e escolha uma
              cor.
            </Vazio>
          ) : (
            <ul className="divide-y divide-border">
              {highlights.map((h) => (
                <li key={h.id} className="flex gap-2 p-3 active:bg-background">
                  <span
                    className="mt-1.5 h-full w-1 shrink-0 rounded-full"
                    style={{ background: swatch(h.color) }}
                  />
                  <button
                    onClick={() => onIr(h.page)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="text-[11px] uppercase tracking-wider text-muted">
                      página {h.page}
                    </span>
                    <p className="mt-0.5 line-clamp-4 text-sm leading-snug">
                      {h.text || "(trecho sem texto)"}
                    </p>
                  </button>
                  <button
                    onClick={() => onDelHighlight(h.id)}
                    aria-label="Apagar marcação"
                    className="tap !min-h-9 !min-w-9 shrink-0 self-start rounded-lg text-muted transition hover:text-red-500"
                  >
                    🗑
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : bookmarks.length === 0 ? (
          <Vazio>
            Nenhuma página guardada. Use o ☆ para marcar onde você quer voltar.
          </Vazio>
        ) : (
          <ul className="divide-y divide-border">
            {bookmarks.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3">
                <button
                  onClick={() => onIr(b.page)}
                  className="tap flex-1 justify-start text-[15px] font-medium"
                >
                  <span className="text-[var(--gold)]">★</span> Página {b.page}
                </button>
                <button
                  onClick={() => onDelBookmark(b.id)}
                  aria-label="Remover marcador"
                  className="tap !min-h-9 !min-w-9 rounded-lg text-muted transition hover:text-red-500"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Segmento({
  modo,
  onModo,
  className = "",
}: {
  modo: Modo;
  onModo: (m: Modo) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Modo de leitura"
      className={`flex items-center gap-0.5 rounded-xl border border-border p-0.5 ${className}`}
    >
      {(
        [
          ["pagina", "▤ Página"],
          ["texto", "¶ Texto"],
        ] as [Modo, string][]
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => onModo(k)}
          aria-pressed={modo === k}
          className={`tap !min-h-10 min-w-0 flex-1 rounded-lg px-3 text-sm font-medium transition ${
            modo === k
              ? "bg-accent/12 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-6 py-10 text-center text-sm leading-relaxed text-muted">
      {children}
    </p>
  );
}

function IconBtn({
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
      className="tap !min-h-10 !min-w-10 rounded-lg text-lg leading-none text-muted transition hover:bg-background hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function BarBtn({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="tap relative flex-1 flex-col rounded-xl !gap-0 text-2xl leading-none text-foreground transition active:bg-background disabled:opacity-25"
    >
      {children}
    </button>
  );
}
