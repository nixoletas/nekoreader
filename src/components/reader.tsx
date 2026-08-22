"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  ArrowLeft,
  Bookmark as BookmarkIcon,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Highlighter,
  Minus,
  Pencil,
  Plus,
  List,
  ScrollText,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { urlAssinadaDoLivro } from "@/lib/pdf-url-cache";
import { obterPdfOffline, obterSnapshotLivro, salvarSnapshotLivro } from "@/lib/offline-db";
import { executarOuEnfileirar, mesclarFilaLocal, sincronizarFila } from "@/lib/offline-sync";
import { useFilaPendente, useOnline } from "@/lib/use-offline";
import { usePreferencia } from "@/lib/prefs";
import { useSumario, type EstadoSumario } from "@/lib/use-sumario";
import { Botao } from "@/components/ui";
import { usePrompt } from "@/components/dialog-provider";
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

const EpubText = dynamic(() => import("./epub-text"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto h-96 w-full max-w-[38rem] animate-pulse rounded-lg bg-surface" />
  ),
});

type Aba = "marcacoes" | "paginas" | "sumario";
type Sheet = null | "painel" | "ir";
type Modo = "pagina" | "texto";

/** Corpo do texto no modo leitura, em rem. */
const FONTE_BASE = 1.05;
const FONTE_MIN = 0.85;
const FONTE_MAX = 2.2;
const CHAVE_MODO = "marginalia:modo";
const CHAVE_FONTE = "marginalia:fonte";

/** Quanto da página já rolou, de 0 a 1. */
function fracaoAtual(): number {
  const limite = document.documentElement.scrollHeight - window.innerHeight;
  if (limite <= 0) return 0;
  return Math.max(0, Math.min(1, window.scrollY / limite));
}

type EstadoLivro = {
  book: Book;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  deDados: boolean;
};

/**
 * Busca o livro (dados + marcações) pelo id da URL, no cliente — não no servidor.
 * É isso que permite o service worker guardar um "casco" genérico da página e
 * reabrir o leitor offline: o HTML em cache não carrega dado nenhum embutido, quem
 * busca é este componente, e ele sabe cair pro retrato salvo quando não há rede.
 */
export default function Reader() {
  const params = useParams<{ id: string }>();
  const bookId = params.id;
  const router = useRouter();
  const [supabase] = useState(createClient);

  const [estado, setEstado] = useState<EstadoLivro | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/login");
      return;
    }

    try {
      const { data: book, error: erroLivro } = await supabase
        .from("books")
        .select("*")
        .eq("id", bookId)
        .single();
      if (erroLivro || !book) throw erroLivro ?? new Error("Livro não encontrado.");

      const [{ data: highlights }, { data: bookmarks }] = await Promise.all([
        supabase
          .from("highlights")
          .select("*")
          .eq("book_id", bookId)
          .order("page", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("bookmarks").select("*").eq("book_id", bookId).order("page", { ascending: true }),
      ]);

      const dados = {
        book: book as Book,
        highlights: (highlights ?? []) as Highlight[],
        bookmarks: (bookmarks ?? []) as Bookmark[],
      };
      void salvarSnapshotLivro({ bookId, ...dados, atualizadoEm: Date.now() });

      const mesclado = await mesclarFilaLocal(bookId, dados.highlights, dados.bookmarks);
      setEstado({ book: dados.book, ...mesclado, deDados: false });
      setErro(null);
    } catch (e) {
      if (navigator.onLine) {
        // Online mas falhou mesmo assim (livro apagado, não é seu, erro de
        // verdade) — não esconde isso atrás de dado velho do cache.
        setErro(e instanceof Error ? e.message : "Não consegui carregar este livro.");
        return;
      }
      // sem rede — cai pro retrato salvo da última vez
      const salvo = await obterSnapshotLivro(bookId);
      if (salvo) {
        const mesclado = await mesclarFilaLocal(bookId, salvo.highlights, salvo.bookmarks);
        setEstado({ book: salvo.book, ...mesclado, deDados: true });
        setErro(null);
      } else {
        setErro(
          "Sem internet e este livro ainda não foi aberto neste aparelho — abra ele uma vez online antes.",
        );
      }
    }
  }, [bookId, supabase, router]);

  useEffect(() => {
    if (!bookId) return;
    void (async () => {
      await carregar();
    })();
  }, [bookId, carregar]);

  if (erro) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-lg font-semibold">Não consegui abrir este livro</p>
        <p className="mt-2 text-sm text-muted">{erro}</p>
        <Link href="/" className="mt-6 inline-block text-accent underline">
          Voltar para a biblioteca
        </Link>
      </div>
    );
  }

  if (!estado) {
    return (
      <div className="mx-auto aspect-[1/1.4] w-full max-w-3xl animate-pulse rounded-lg bg-surface" />
    );
  }

  return (
    <ReaderCarregado
      key={estado.book.id}
      book={estado.book}
      initialHighlights={estado.highlights}
      initialBookmarks={estado.bookmarks}
    />
  );
}

function ReaderCarregado({
  book,
  initialHighlights,
  initialBookmarks,
}: {
  book: Book;
  initialHighlights: Highlight[];
  initialBookmarks: Bookmark[];
}) {
  const [supabase] = useState(createClient);
  const perguntar = usePrompt();

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
  // `?p=N` (vindo da página de marcações) manda pra página do trecho; sem ele,
  // abre onde a leitura parou.
  const paginaPedida = Number(useSearchParams().get("p"));
  const [page, setPage] = useState(
    Number.isFinite(paginaPedida) && paginaPedida >= 1
      ? paginaPedida
      : Math.max(1, book.last_page || 1),
  );
  const [zoom, setZoom] = useState(1);
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [aba, setAba] = useState<Aba>("marcacoes");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [salvo, setSalvo] = useState(true);
  // preferências de leitura, lembradas entre livros
  // EPUB não tem folha pra desenhar — o texto remontado é a única leitura possível.
  const eEpub = book.format === "epub";
  const [modoEscolhido, mudarModo] = usePreferencia<Modo>(CHAVE_MODO, "pagina", (v) =>
    v === "texto" || v === "pagina" ? v : null,
  );
  const modo: Modo = eEpub ? "texto" : modoEscolhido;
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

  /**
   * Onde a leitura parou em cada página, em fração da rolagem (0..1).
   *
   * Fração e não pixel: 1200px no computador não é o mesmo lugar no celular, nem
   * com outro zoom ou tamanho de letra. A fração é a mesma em qualquer tela — e
   * também sobrevive à troca entre modo Página e modo Texto, já que "40% da
   * página 12" quer dizer a mesma coisa nos dois.
   */
  const [posicoes] = useState(() => {
    const mapa = new Map<number, number>();
    for (const [k, v] of Object.entries(book.positions ?? {})) {
      const pagina = Number(k);
      const fracao = Number(v);
      if (Number.isFinite(pagina) && Number.isFinite(fracao)) {
        mapa.set(pagina, Math.max(0, Math.min(1, fracao)));
      }
    }
    return mapa;
  });

  const paginaRef = useRef(page);
  useEffect(() => {
    paginaRef.current = page;
  }, [page]);

  // Reabrir o livro cai direto onde a leitura parou (inclusive vindo de outro aparelho).
  const [fracaoInicial] = useState(() => posicoes.get(page) ?? null);
  const aRestaurar = useRef<number | null>(fracaoInicial);
  // Enquanto está reposicionando, os eventos de rolagem não valem: a página ainda
  // está curta e gravariam 0 por cima da posição boa.
  const restaurando = useRef(fracaoInicial !== null);

  // ---------- guardar página + posições ----------
  const salvarRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendente = useRef(false);

  const gravar = useCallback(() => {
    pendente.current = false;
    if (salvarRef.current) {
      clearTimeout(salvarRef.current);
      salvarRef.current = null;
    }
    return executarOuEnfileirar(supabase, `last_page:${book.id}`, {
      tipo: "last_page",
      bookId: book.id,
      page: paginaRef.current,
      lastReadAt: new Date().toISOString(),
      positions: Object.fromEntries(posicoes),
    });
  }, [supabase, book.id, posicoes]);

  const agendarSalvar = useCallback(() => {
    if (salvarRef.current) clearTimeout(salvarRef.current);
    else setSalvo(false); // uma vez por rajada, não a cada evento de rolagem
    pendente.current = true;
    salvarRef.current = setTimeout(() => {
      void gravar().then(() => setSalvo(true));
    }, 900);
  }, [gravar]);

  // Sair da tela (voltar pra estante) ou trocar de app com gravação pendente não pode
  // perder a posição — grava na hora em vez de esperar o tempo do debounce.
  useEffect(() => {
    const aoEsconder = () => {
      if (document.visibilityState === "hidden" && pendente.current) void gravar();
    };
    const aoFechar = () => {
      if (pendente.current) void gravar();
    };
    document.addEventListener("visibilitychange", aoEsconder);
    window.addEventListener("pagehide", aoFechar);
    return () => {
      document.removeEventListener("visibilitychange", aoEsconder);
      window.removeEventListener("pagehide", aoFechar);
      aoFechar();
    };
  }, [gravar]);

  // Rolagem: anota a posição da página atual e agenda a gravação.
  useEffect(() => {
    let quadro = 0;
    const aoRolar = () => {
      if (restaurando.current || quadro) return;
      quadro = requestAnimationFrame(() => {
        quadro = 0;
        posicoes.set(paginaRef.current, fracaoAtual());
        agendarSalvar();
      });
    };
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => {
      window.removeEventListener("scroll", aoRolar);
      if (quadro) cancelAnimationFrame(quadro);
    };
  }, [posicoes, agendarSalvar]);

  const primeiro = useRef(true);
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false;
      return;
    }
    agendarSalvar();
  }, [page, agendarSalvar]);

  const irPara = useCallback(
    (p: number) => {
      const max = numPages || p;
      const alvo = Math.min(Math.max(1, p), max);
      if (alvo === page) return;
      if (!restaurando.current) posicoes.set(page, fracaoAtual());
      aRestaurar.current = posicoes.get(alvo) ?? 0;
      restaurando.current = true;
      setPage(alvo);
    },
    [numPages, page, posicoes],
  );

  /**
   * Devolve o leitor à altura em que ele estava naquela página.
   *
   * Não dá pra rolar de imediato: o conteúdo da página nova ainda está sendo montado
   * (renderização do PDF ou remontagem do texto) e o documento ainda é curto demais —
   * rolar agora pararia no meio do caminho. Então espera a altura parar de mudar por
   * alguns quadros, e desiste depois de ~1,5s pra não ficar tentando à toa.
   */
  useEffect(() => {
    const destino = aRestaurar.current;
    aRestaurar.current = null;
    if (destino === null) {
      restaurando.current = false;
      return;
    }
    // De novo aqui porque a limpeza do efeito anterior baixa a bandeira antes deste
    // rodar — sem isto, a rolagem do meio do caminho gravaria posição errada.
    restaurando.current = true;

    let cancelado = false;
    let tentativas = 0;
    let anterior = -1;
    let estaveis = 0;

    const concluir = (topo: number) => {
      window.scrollTo({ top: topo });
      restaurando.current = false;
    };

    const tentar = () => {
      if (cancelado) return;
      const limite = document.documentElement.scrollHeight - window.innerHeight;
      if (limite > 0 && limite === anterior) estaveis++;
      else {
        estaveis = 0;
        anterior = limite;
      }
      if (estaveis >= 3 || tentativas > 90) {
        concluir(Math.round(destino * Math.max(0, limite)));
        return;
      }
      tentativas++;
      requestAnimationFrame(tentar);
    };

    if (destino <= 0) {
      concluir(0);
    } else {
      tentar();
    }

    return () => {
      cancelado = true;
      restaurando.current = false;
    };
  }, [page]);

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
      title: null,
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

  async function renomearHighlight(id: string) {
    const atual = highlights.find((h) => h.id === id);
    if (!atual) return;
    const resposta = await perguntar({
      titulo: atual.title ? "Renomear marcação" : "Dar um título à marcação",
      mensagem: atual.text ? `“${atual.text.slice(0, 120)}…”` : undefined,
      valor: atual.title ?? "",
      placeholder: "Ex.: definição de metadados",
      textoConfirmar: "Salvar",
    });
    if (resposta === null) return;

    const title = resposta.trim() || null;
    setHighlights((h) => h.map((x) => (x.id === id ? { ...x, title } : x)));
    await executarOuEnfileirar(supabase, `titulo:${id}`, {
      tipo: "highlight_title",
      id,
      title,
    });
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

  // O sumário só é montado quando a aba é aberta — em livro cujos marcadores não
  // sabem a página, montar exige varrer o texto inteiro.
  const sumario = useSumario(book.id, fileUrl, book.format, aba === "sumario");

  const painel = (
    <Painel
      aba={aba}
      setAba={setAba}
      highlights={highlights}
      bookmarks={bookmarks}
      sumario={sumario}
      pagina={page}
      rotuloPagina={eEpub ? "capítulo" : "página"}
      onIr={(p) => {
        irPara(p);
        setSheet(null);
      }}
      onDelHighlight={delHighlight}
      onRenomear={renomearHighlight}
      onDelBookmark={delBookmark}
      livroId={book.id}
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
            className="tap rounded-xl text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
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
              <IconBtn
                onClick={() => irPara(page - 1)}
                disabled={page <= 1}
                label={eEpub ? "Capítulo anterior" : "Página anterior"}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
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
                label={eEpub ? "Próximo capítulo" : "Próxima página"}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </IconBtn>
            </div>

            {!eEpub && <Segmento modo={modo} onModo={mudarModo} />}

            {modo === "pagina" ? (
              <div className="flex items-center rounded-xl border border-border">
                <IconBtn
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                  label="Diminuir zoom"
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </IconBtn>
                <span className="w-12 text-center text-xs text-muted">
                  {Math.round(zoom * 100)}%
                </span>
                <IconBtn
                  onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
                  label="Aumentar zoom"
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </IconBtn>
              </div>
            ) : (
              <div className="flex items-center rounded-xl border border-border">
                <IconBtn
                  onClick={() => mudarFonte(-0.1)}
                  disabled={fonte <= FONTE_MIN}
                  label="Diminuir fonte"
                >
                  <span className="flex items-center text-[13px] font-semibold">
                    A<Minus className="h-3 w-3" aria-hidden />
                  </span>
                </IconBtn>
                <span className="w-12 text-center text-xs text-muted">
                  {Math.round((fonte / FONTE_BASE) * 100)}%
                </span>
                <IconBtn
                  onClick={() => mudarFonte(0.1)}
                  disabled={fonte >= FONTE_MAX}
                  label="Aumentar fonte"
                >
                  <span className="flex items-center text-[13px] font-semibold">
                    A<Plus className="h-3 w-3" aria-hidden />
                  </span>
                </IconBtn>
              </div>
            )}

            <button
              onClick={toggleBookmark}
              aria-label={marcada ? "Página marcada" : "Marcar página"}
              className={`tap flex items-center gap-1.5 rounded-xl border px-4 text-sm font-medium transition ${
                marcada
                  ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)]"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              <BookmarkIcon
                className="h-4 w-4"
                aria-hidden
                fill={marcada ? "currentColor" : "none"}
              />
              {marcada ? "Marcada" : "Marcar"}
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
              {eEpub ? (
                <EpubText
                  fileUrl={fileUrl}
                  pageNumber={page}
                  escala={fonte}
                  highlights={marcacoesTexto}
                  onLoadSuccess={onLoadSuccess}
                  onAddHighlight={addHighlightTexto}
                  onDeleteHighlight={delHighlight}
                  onSwipe={(dir) => irPara(page + dir)}
                />
              ) : modo === "pagina" ? (
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
                {eEpub
                  ? "Deslize o dedo ou use ← → para trocar de capítulo · selecione um trecho para marcar"
                  : modo === "pagina"
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
          label={eEpub ? "Capítulo anterior" : "Anterior"}
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </BarBtn>

        <BarBtn onClick={toggleBookmark} label={marcada ? "Marcada" : "Marcar"}>
          <BookmarkIcon
            className={`h-6 w-6 ${marcada ? "text-[var(--gold)]" : ""}`}
            aria-hidden
            fill={marcada ? "currentColor" : "none"}
          />
        </BarBtn>

        <button
          onClick={() => setSheet("ir")}
          className="tap min-w-[5.5rem] flex-col rounded-xl px-3 !gap-0"
        >
          <span className="text-[15px] font-semibold leading-tight">{page}</span>
          <span className="text-[10px] leading-tight text-muted">
            {eEpub ? "cap. de " : "de "}
            {numPages || "?"}
          </span>
        </button>

        <BarBtn onClick={() => setSheet("painel")} label="Marcações">
          <Highlighter className="h-6 w-6" aria-hidden />
          {highlights.length > 0 && (
            <span className="absolute right-1 top-1 rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">
              {highlights.length}
            </span>
          )}
        </BarBtn>

        <BarBtn
          onClick={() => irPara(page + 1)}
          disabled={!!numPages && page >= numPages}
          label={eEpub ? "Próximo capítulo" : "Próxima"}
        >
          <ChevronRight className="h-6 w-6" aria-hidden />
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
                    {eEpub ? "Ir para o capítulo" : "Ir para a página"}
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
                  <button
                    onClick={() => {
                      setAba("sumario");
                      setSheet("painel");
                    }}
                    className="tap mt-2 w-full justify-start rounded-xl border border-border px-4 text-sm font-medium text-muted transition active:bg-background"
                  >
                    <List className="h-4 w-4 shrink-0" aria-hidden />
                    Escolher pelo sumário
                  </button>
                </div>

                {!eEpub && (
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
                )}

                {modo === "pagina" ? (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted">
                      Tamanho da página · {Math.round(zoom * 100)}%
                    </p>
                    <div className="flex gap-2">
                      <Botao
                        variante="contorno"
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                        className="flex flex-1 items-center justify-center"
                        aria-label="Diminuir"
                      >
                        <Minus className="h-4 w-4" aria-hidden />
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
                        className="flex flex-1 items-center justify-center"
                        aria-label="Aumentar"
                      >
                        <Plus className="h-4 w-4" aria-hidden />
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
                        className="flex flex-1 items-center justify-center gap-0.5 text-sm font-semibold"
                        aria-label="Diminuir fonte"
                      >
                        A<Minus className="h-3.5 w-3.5" aria-hidden />
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
                        className="flex flex-1 items-center justify-center gap-0.5 text-sm font-semibold"
                        aria-label="Aumentar fonte"
                      >
                        A<Plus className="h-3.5 w-3.5" aria-hidden />
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
  sumario,
  pagina,
  rotuloPagina,
  onIr,
  onDelHighlight,
  onRenomear,
  onDelBookmark,
  livroId,
}: {
  aba: Aba;
  setAba: (a: Aba) => void;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  sumario: EstadoSumario;
  pagina: number;
  /** "página" no PDF, "capítulo" no EPUB — o número é o mesmo, o nome não. */
  rotuloPagina: string;
  onIr: (p: number) => void;
  onDelHighlight: (id: string) => void;
  onRenomear: (id: string) => void;
  onDelBookmark: (id: string) => void;
  livroId: string;
}) {
  return (
    <>
      <div className="grid shrink-0 grid-cols-3 gap-1 border-b border-border p-2">
        {(
          [
            ["sumario", "Sumário"],
            ["marcacoes", `Marcações ${highlights.length}`],
            ["paginas", `${rotuloPagina === "capítulo" ? "Capítulos" : "Páginas"} ${bookmarks.length}`],
          ] as [Aba, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setAba(k)}
            className={`tap rounded-xl px-1 text-[13px] font-semibold transition ${
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
        {aba === "sumario" ? (
          <Sumario estado={sumario} pagina={pagina} onIr={onIr} />
        ) : aba === "marcacoes" ? (
          highlights.length === 0 ? (
            <Vazio>
              Nada marcado ainda. Selecione um trecho na página e escolha uma
              cor.
            </Vazio>
          ) : (
            <>
              <Link
                href={`/livro/${livroId}/marcacoes`}
                className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-sm font-medium text-accent transition hover:bg-background"
              >
                <ScrollText className="h-4 w-4 shrink-0" aria-hidden />
                Ler todas em página inteira
              </Link>
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
                      {rotuloPagina} {h.page}
                    </span>
                    {h.title && (
                      <p className="display mt-0.5 text-[13px] leading-snug">
                        {h.title}
                      </p>
                    )}
                    <p className="mt-0.5 line-clamp-4 text-sm leading-snug">
                      {h.text || "(trecho sem texto)"}
                    </p>
                  </button>
                  <div className="flex shrink-0 flex-col">
                    <button
                      onClick={() => onRenomear(h.id)}
                      aria-label={h.title ? "Renomear marcação" : "Dar um título"}
                      title={h.title ? "Renomear marcação" : "Dar um título"}
                      className="tap !min-h-9 !min-w-9 rounded-lg text-muted transition hover:text-accent"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => onDelHighlight(h.id)}
                      aria-label="Apagar marcação"
                      className="tap !min-h-9 !min-w-9 rounded-lg text-muted transition hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </li>
              ))}
              </ul>
            </>
          )
        ) : bookmarks.length === 0 ? (
          <Vazio>
            Nenhum{rotuloPagina === "capítulo" ? " capítulo guardado" : "a página guardada"}.
            Use o marcador pra voltar aqui depois.
          </Vazio>
        ) : (
          <ul className="divide-y divide-border">
            {bookmarks.map((b) => (
              <li key={b.id} className="flex items-center gap-2 px-3">
                <button
                  onClick={() => onIr(b.page)}
                  className="tap flex-1 items-center justify-start gap-1.5 text-[15px] font-medium"
                >
                  <BookmarkIcon
                    className="h-4 w-4 shrink-0 text-[var(--gold)]"
                    aria-hidden
                    fill="currentColor"
                  />
                  {rotuloPagina === "capítulo" ? "Capítulo" : "Página"} {b.page}
                </button>
                <button
                  onClick={() => onDelBookmark(b.id)}
                  aria-label="Remover marcador"
                  className="tap !min-h-9 !min-w-9 rounded-lg text-muted transition hover:text-red-500"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Sumário do livro no painel lateral.
 *
 * Item sem página não some da lista: ele ainda mostra como o livro está
 * organizado. Só não é clicável — melhor uma linha apagada e honesta que um
 * botão que joga a pessoa em página errada.
 */
function Sumario({
  estado,
  pagina,
  onIr,
}: {
  estado: EstadoSumario;
  pagina: number;
  onIr: (p: number) => void;
}) {
  const { itens, progresso, carregando, erro } = estado;

  if (erro) {
    return <Vazio>Não consegui ler o sumário deste livro. {erro}</Vazio>;
  }

  if (carregando || !itens) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted">
        <p>
          {progresso === null
            ? "Lendo o sumário..."
            : `Procurando os capítulos no texto... ${Math.round(progresso * 100)}%`}
        </p>
        <div className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.round((progresso ?? 0.06) * 100)}%` }}
          />
        </div>
        {progresso !== null && (
          <p className="mt-3 text-xs">
            Os marcadores deste PDF não dizem em que página cada capítulo começa,
            então estou procurando pelos títulos. Isso acontece só desta vez.
          </p>
        )}
      </div>
    );
  }

  if (!itens.length) {
    return <Vazio>Este livro não traz sumário — nem nos marcadores, nem nos títulos do texto.</Vazio>;
  }

  // Capítulo atual = o último que começa em página já passada.
  let atual = -1;
  itens.forEach((i, idx) => {
    if (i.pagina !== null && i.pagina <= pagina) atual = idx;
  });

  return (
    <ul className="py-1">
      {itens.map((item, i) => {
        const recuo = ["pl-3", "pl-7", "pl-11"][item.nivel - 1] ?? "pl-11";
        if (item.pagina === null) {
          return (
            <li
              key={`${i}-${item.titulo}`}
              className={`${recuo} py-2 pr-3 text-sm leading-snug text-muted/60`}
              title="Não deu pra descobrir em que página começa"
            >
              {item.titulo}
            </li>
          );
        }
        return (
          <li key={`${i}-${item.titulo}`}>
            <button
              onClick={() => onIr(item.pagina as number)}
              className={`${recuo} flex w-full items-baseline gap-2 py-2 pr-3 text-left transition hover:bg-background ${
                i === atual ? "bg-accent/8 text-accent" : ""
              }`}
              aria-current={i === atual ? "true" : undefined}
            >
              <span
                className={`min-w-0 flex-1 text-sm leading-snug ${
                  item.nivel === 1 ? "font-semibold" : ""
                }`}
              >
                {item.titulo}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted">
                {item.pagina}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
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
          ["pagina", "Página", BookOpen],
          ["texto", "Texto", AlignLeft],
        ] as [Modo, string, typeof BookOpen][]
      ).map(([k, label, Icone]) => (
        <button
          key={k}
          onClick={() => onModo(k)}
          aria-pressed={modo === k}
          className={`tap flex !min-h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
            modo === k
              ? "bg-accent/12 text-accent"
              : "text-muted hover:text-foreground"
          }`}
        >
          <Icone className="h-4 w-4" aria-hidden />
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
      className="tap flex !min-h-10 !min-w-10 items-center justify-center rounded-lg text-muted transition hover:bg-background hover:text-foreground disabled:opacity-30"
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
