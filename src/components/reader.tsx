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
  Download,
  Eye,
  Highlighter,
  LayoutGrid,
  List,
  Minus,
  MonitorCog,
  Moon,
  Pencil,
  Plus,
  ScrollText,
  Search,
  StickyNote,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { urlAssinadaDoLivro } from "@/lib/pdf-url-cache";
import { obterPdfOffline, obterSnapshotLivro, salvarSnapshotLivro } from "@/lib/offline-db";
import { executarOuEnfileirar, mesclarFilaLocal, sincronizarFila } from "@/lib/offline-sync";
import { useFilaPendente, useOnline } from "@/lib/use-offline";
import { usePreferencia } from "@/lib/prefs";
import { idDoDispositivo, nomeDoDispositivo } from "@/lib/dispositivo";
import { haQuantoTempo } from "@/lib/format";
import { useI18n, useT } from "@/lib/i18n/cliente";
import { textoDoErro } from "@/lib/erros";
import type { Dicionario } from "@/lib/i18n/dicionarios";
import SeletorIdioma from "@/components/seletor-idioma";
import { useSumario, type EstadoSumario } from "@/lib/use-sumario";
import { useBusca, type EstadoBusca } from "@/lib/use-busca";
import { MIN_TERMO } from "@/lib/busca";
import { useRotulos } from "@/lib/use-rotulos";
import { numeracaoPropria, paginaDoRotulo, rotuloDaPagina, type Rotulos } from "@/lib/pdf-rotulos";
import { Botao } from "@/components/ui";
import { useConfirm, usePrompt } from "@/components/dialog-provider";
import BotaoTema from "@/components/botao-tema";
import { useTema, type Tema } from "@/lib/tema";
import {
  porMaisRecente,
  swatch,
  type Book,
  type Bookmark,
  type Highlight,
  type HighlightColor,
  type PosicaoDispositivo,
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

const VisaoPaginas = dynamic(() => import("./visao-paginas"), { ssr: false });

const ConferirPagina = dynamic(() => import("./conferir-pagina"), { ssr: false });

const ExportarLivro = dynamic(() => import("./exportar-livro"), { ssr: false });

const EditarLivro = dynamic(() => import("./editar-livro"), { ssr: false });

const EpubText = dynamic(() => import("./epub-text"), {
  ssr: false,
  loading: () => (
    <div className="mx-auto h-96 w-full max-w-[38rem] animate-pulse rounded-lg bg-surface" />
  ),
});

type Aba = "marcacoes" | "paginas" | "sumario" | "busca";
type Sheet = null | "painel" | "ir";
type Modo = "pagina" | "texto";

/** Corpo do texto no modo leitura, em rem. */
const FONTE_BASE = 1.05;
const FONTE_MIN = 0.85;
const FONTE_MAX = 2.2;
const CHAVE_MODO = "neko:mode";
const CHAVE_FONTE = "neko:font";

/**
 * Página em que este aparelho parou, guardada nele mesmo.
 *
 * `books.last_page` é do livro, não do aparelho: ler no celular mexeria na
 * página que o computador abre. Aqui cada aparelho continua de onde ele parou —
 * e o pulo pro que o outro leu vira uma pergunta, não uma surpresa.
 */
const chavePaginaLocal = (bookId: string) => `neko:page:${bookId}`;

function paginaLocal(bookId: string): number | null {
  try {
    const n = Number(localStorage.getItem(chavePaginaLocal(bookId)));
    return Number.isFinite(n) && n >= 1 ? n : null;
  } catch {
    return null;
  }
}

function guardarPaginaLocal(bookId: string, page: number): void {
  try {
    localStorage.setItem(chavePaginaLocal(bookId), String(page));
  } catch {
    // sem onde guardar (modo restrito): sobra a posição do servidor
  }
}

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
  /** Onde cada aparelho parou neste livro, do mais recente pro mais antigo. */
  posicoes: PosicaoDispositivo[];
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
  const d = useT();
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
      if (erroLivro || !book) throw erroLivro ?? new Error(d.reader.notFound);

      const [{ data: highlights }, { data: bookmarks }, { data: posicoes }] =
        await Promise.all([
          supabase
            .from("highlights")
            .select("*")
            .eq("book_id", bookId)
            .order("created_at", { ascending: false }),
          supabase.from("bookmarks").select("*").eq("book_id", bookId).order("page", { ascending: true }),
          // Tabela nova: em banco que ainda não rodou a migração isto volta com
          // erro, e a leitura segue sem a pergunta de "continuar do outro aparelho".
          supabase
            .from("reading_positions")
            .select("*")
            .eq("book_id", bookId)
            .order("updated_at", { ascending: false }),
        ]);

      const dados = {
        book: book as Book,
        highlights: (highlights ?? []) as Highlight[],
        bookmarks: (bookmarks ?? []) as Bookmark[],
      };
      void salvarSnapshotLivro({ bookId, ...dados, atualizadoEm: Date.now() });

      const mesclado = await mesclarFilaLocal(bookId, dados.highlights, dados.bookmarks);
      setEstado({
        book: dados.book,
        ...mesclado,
        highlights: porMaisRecente(mesclado.highlights),
        posicoes: (posicoes ?? []) as PosicaoDispositivo[],
        deDados: false,
      });
      setErro(null);
    } catch (e) {
      if (navigator.onLine) {
        // Online mas falhou mesmo assim (livro apagado, não é seu, erro de
        // verdade) — não esconde isso atrás de dado velho do cache.
        setErro(e instanceof Error ? e.message : d.reader.loadFailed);
        return;
      }
      // sem rede — cai pro retrato salvo da última vez
      const salvo = await obterSnapshotLivro(bookId);
      if (salvo) {
        const mesclado = await mesclarFilaLocal(bookId, salvo.highlights, salvo.bookmarks);
        // Offline não dá pra saber do outro aparelho — sobra a posição deste.
        setEstado({ book: salvo.book, ...mesclado, posicoes: [], deDados: true });
        setErro(null);
      } else {
        setErro(d.reader.offlineNever);
      }
    }
  }, [bookId, supabase, router, d]);

  useEffect(() => {
    if (!bookId) return;
    void (async () => {
      await carregar();
    })();
  }, [bookId, carregar]);

  if (erro) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-lg font-semibold">{d.reader.openFailed}</p>
        <p className="mt-2 text-sm text-muted">{erro}</p>
        <Link href="/library" className="mt-6 inline-block text-accent underline">
          {d.common.backToLibrary}
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
      posicoesRemotas={estado.posicoes}
    />
  );
}

function ReaderCarregado({
  book,
  initialHighlights,
  initialBookmarks,
  posicoesRemotas,
}: {
  book: Book;
  initialHighlights: Highlight[];
  initialBookmarks: Bookmark[];
  posicoesRemotas: PosicaoDispositivo[];
}) {
  const [supabase] = useState(createClient);
  const { d, t, p: pl, locale } = useI18n();
  const perguntar = usePrompt();
  const confirmar = useConfirm();
  // O nome sai no idioma em vigor ("Chrome on Windows"), e é gravado assim: quem
  // trocar de idioma depois vê o nome antigo até ler de novo neste aparelho —
  // preço aceitável por não ter que guardar o nome em seis línguas.
  const [aparelho] = useState(() => ({
    id: idDoDispositivo(),
    nome: nomeDoDispositivo(d),
  }));

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
          setErroArquivo(textoDoErro(d, e));
      }
    })();

    return () => {
      vivo = false;
      if (urlLocal) URL.revokeObjectURL(urlLocal);
    };
  }, [supabase, book.id, book.storage_path, d]);

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
  const veioDeLink = Number.isFinite(paginaPedida) && paginaPedida >= 1;
  const [page, setPage] = useState(
    veioDeLink
      ? paginaPedida
      : // Este aparelho primeiro: `last_page` é do livro e pode ser de outro.
        Math.max(1, paginaLocal(book.id) ?? book.last_page ?? 1),
  );
  // A numeração impressa do livro — a que ignora capa, rosto e sumário e começa
  // o "1" lá pela página 17 do arquivo. Chega depois da primeira renderização
  // (é uma varredura); até lá `rotulo` devolve a página física, como antes.
  const rotulos = useRotulos(book.id, fileUrl, book.format, book.page_labels);
  const rotulo = useCallback(
    (p: number) => rotuloDaPagina(rotulos, p) ?? String(p),
    [rotulos],
  );

  const [zoom, setZoom] = useState(1);
  const [highlights, setHighlights] = useState<Highlight[]>(initialHighlights);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(initialBookmarks);
  const [aba, setAba] = useState<Aba>("marcacoes");
  const [sheet, setSheet] = useState<Sheet>(null);
  /** Grade com todas as páginas (tipo Kindle) por cima da leitura. */
  const [vendoPaginas, setVendoPaginas] = useState(false);
  /** A folha original por cima do texto remontado, pra conferir a remontagem. */
  const [conferindo, setConferindo] = useState(false);
  /** Levar o livro pra fora do app (Markdown, EPUB). */
  const [exportando, setExportando] = useState(false);
  /** Título e autor, editáveis daqui — o `book` da carga inicial não muda sozinho. */
  const [nomes, setNomes] = useState({ title: book.title, author: book.author });
  const [editando, setEditando] = useState(false);
  const [salvo, setSalvo] = useState(true);
  // preferências de leitura, lembradas entre livros
  // EPUB não tem folha pra desenhar — o texto remontado é a única leitura possível.
  const eEpub = book.format === "epub";
  /** O livro conta diferente do arquivo — é o que decide mostrar as duas contas. */
  const temRotulos = !eEpub && numeracaoPropria(rotulos);
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
    const agora = new Date().toISOString();
    const pagina = paginaRef.current;
    guardarPaginaLocal(book.id, pagina);
    return Promise.all([
      executarOuEnfileirar(supabase, `last_page:${book.id}`, {
        tipo: "last_page",
        bookId: book.id,
        page: pagina,
        lastReadAt: agora,
        positions: Object.fromEntries(posicoes),
      }),
      // Uma linha por aparelho — é o que a pergunta "continuar do celular?" lê.
      executarOuEnfileirar(supabase, `posicao:${book.id}`, {
        tipo: "posicao",
        bookId: book.id,
        userId: book.user_id,
        deviceId: aparelho.id,
        deviceName: aparelho.nome,
        page: pagina,
        fraction: posicoes.get(pagina) ?? 0,
        updatedAt: agora,
      }),
    ]).then(() => undefined);
  }, [supabase, book.id, book.user_id, posicoes, aparelho]);

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

  /**
   * "Você parou na página 87 no iPhone — continuar de lá?"
   *
   * Só pergunta quando o outro aparelho leu **depois** da última vez aqui: sem
   * essa checagem, o computador ficaria oferecendo pra voltar a uma página que a
   * pessoa já passou no celular semanas atrás. E nunca pergunta quando a página
   * veio de um link (`?p=`) — ali o destino já foi escolhido.
   */
  const jaPerguntou = useRef(false);
  useEffect(() => {
    if (jaPerguntou.current || veioDeLink) return;
    const quando = (p: PosicaoDispositivo) => Date.parse(p.updated_at) || 0;
    const minha = posicoesRemotas.find((p) => p.device_id === aparelho.id);
    // A lista vem do mais recente pro mais antigo: vale a leitura mais nova de
    // outro aparelho, não qualquer uma que por acaso esteja em página diferente.
    const outra = posicoesRemotas.find((p) => p.device_id !== aparelho.id);
    if (!outra || outra.page === paginaRef.current) return;
    if (minha && quando(minha) >= quando(outra)) return;

    jaPerguntou.current = true;
    void (async () => {
      // Os números da pergunta são os do livro: é assim que a pessoa sabe onde
      // parou ("página 87"), não pela contagem do arquivo.
      const la = rotulo(outra.page);
      const aqui = rotulo(paginaRef.current);
      // Página e capítulo têm frases próprias no dicionário em vez de um "nome"
      // encaixado numa só: em português a preposição muda com o gênero ("na
      // página", "no capítulo"), e em alemão o caso muda junto.
      const sim = await confirmar({
        titulo: t(d.reader.handoff.title, { device: outra.device_name }),
        mensagem: t(eEpub ? d.reader.handoff.messageChapter : d.reader.handoff.messagePage, {
          there: la,
          here: aqui,
          when: haQuantoTempo(outra.updated_at, d, locale),
        }),
        textoConfirmar: t(eEpub ? d.reader.handoff.goChapter : d.reader.handoff.goPage, {
          there: la,
        }),
        textoCancelar: d.reader.handoff.stay,
      });
      if (!sim) return;
      posicoes.set(outra.page, Math.max(0, Math.min(1, outra.fraction ?? 0)));
      irPara(outra.page);
    })();
  }, [posicoesRemotas, aparelho.id, veioDeLink, confirmar, posicoes, irPara, eEpub, rotulo, d, t, locale]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA") return;
      if (e.key === "ArrowRight" || e.key === "PageDown") irPara(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") irPara(page - 1);
      if (e.key === "Escape") setSheet(null);
      // "/" é o atalho de procurar em toda parte — e a guarda acima já garante
      // que digitar uma barra dentro de um campo continua digitando uma barra.
      if (e.key === "/") {
        e.preventDefault();
        setAba("busca");
        setSheet("painel");
      }
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
      note: null,
      color,
      mode: sel.mode,
      rects: sel.mode === "pagina" ? sel.rects : [],
      spans: sel.mode === "texto" ? sel.spans : [],
      created_at: new Date().toISOString(),
    };
    setHighlights((h) => [registro, ...h]);
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
      titulo: atual.title ? d.highlight.titleEdit : d.highlight.titleAdd,
      mensagem: atual.text ? `“${atual.text.slice(0, 120)}…”` : undefined,
      valor: atual.title ?? "",
      placeholder: d.highlight.titlePlaceholder,
      textoConfirmar: d.common.save,
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

  /** Nota de leitura sobre o trecho — o que a pessoa pensou dele, não o que ele diz. */
  async function anotarHighlight(id: string) {
    const atual = highlights.find((h) => h.id === id);
    if (!atual) return;
    const resposta = await perguntar({
      titulo: atual.note ? d.highlight.noteEdit : d.highlight.noteAdd,
      mensagem: atual.text ? `“${atual.text.slice(0, 120)}…”` : undefined,
      valor: atual.note ?? "",
      placeholder: d.highlight.notePlaceholder,
      multilinha: true,
      textoConfirmar: d.common.save,
    });
    if (resposta === null) return;

    const note = resposta.trim() || null;
    setHighlights((h) => h.map((x) => (x.id === id ? { ...x, note } : x)));
    await executarOuEnfileirar(supabase, `nota:${id}`, {
      tipo: "highlight_note",
      id,
      note,
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

  // O termo mora aqui, e não no painel, porque o painel existe duas vezes na
  // árvore (barra lateral no computador, folha no celular): guardado lá dentro,
  // cada um teria o seu, e o que foi digitado sumiria ao virar o celular.
  const [termoBusca, setTermoBusca] = useState("");
  const busca = useBusca(book.id, fileUrl, book.format, aba === "busca", termoBusca);


  const painel = (
    <Painel
      aba={aba}
      setAba={setAba}
      highlights={highlights}
      bookmarks={bookmarks}
      sumario={sumario}
      busca={busca}
      termoBusca={termoBusca}
      setTermoBusca={setTermoBusca}
      pagina={page}
      eEpub={eEpub}
      numero={rotulo}
      onIr={(p) => {
        irPara(p);
        setSheet(null);
      }}
      onDelHighlight={delHighlight}
      onRenomear={renomearHighlight}
      onAnotar={anotarHighlight}
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
            href="/library"
            aria-label={d.common.backToLibrary}
            className="tap rounded-xl text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>

          <h1 className="display mr-auto min-w-0 flex-1 truncate text-[15px] sm:text-base">
            <button
              onClick={() => setEditando(true)}
              title={t(d.reader.editTitleHint, { title: nomes.title })}
              className="block w-full truncate text-left transition hover:text-accent"
            >
              {nomes.title}
            </button>
          </h1>

          {!online ? (
            <span
              title={
                pendencias > 0
                  ? pl(d.reader.sync.offlinePending, pendencias)
                  : d.reader.sync.offline
              }
              className="mr-1 shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-medium text-muted"
            >
              {d.common.offline}
              {pendencias > 0 ? ` · ${pendencias}` : ""}
            </span>
          ) : (
            <span
              aria-label={
                pendencias > 0
                  ? pl(d.reader.sync.pendingAria, pendencias)
                  : salvo
                    ? d.reader.sync.savedAria
                    : d.reader.sync.savingAria
              }
              title={
                pendencias > 0
                  ? pl(d.reader.sync.syncing, pendencias)
                  : salvo
                    ? d.reader.sync.saved
                    : d.common.saving
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
                label={eEpub ? d.reader.prevChapter : d.reader.prevPage}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </IconBtn>
              <CampoPagina
                page={page}
                numPages={numPages}
                rotulos={rotulos}
                onIr={irPara}
                className="w-14 bg-transparent text-center text-sm outline-none"
              />
              <span
                className="pr-2 text-sm text-muted"
                title={
                  temRotulos ? t(d.reader.fileNumbering, { page, total: numPages }) : undefined
                }
              >
                / {temRotulos ? rotulo(numPages) : numPages || "?"}
              </span>
              <IconBtn
                onClick={() => irPara(page + 1)}
                disabled={!!numPages && page >= numPages}
                label={eEpub ? d.reader.nextChapter : d.reader.nextPage}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </IconBtn>
            </div>

            <IconBtn
              onClick={() => setVendoPaginas(true)}
              label={eEpub ? d.reader.allChapters : d.reader.allPages}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden />
            </IconBtn>

            <SeletorIdioma compacto />

            <BotaoTema />

            {!eEpub && modo === "texto" && (
              <IconBtn
                onClick={() => setConferindo(true)}
                label={d.reader.checkOriginal}
              >
                <Eye className="h-4 w-4" aria-hidden />
              </IconBtn>
            )}

            {!eEpub && (
              <IconBtn onClick={() => setExportando(true)} label={d.reader.exportBook}>
                <Download className="h-4 w-4" aria-hidden />
              </IconBtn>
            )}

            {!eEpub && <Segmento modo={modo} onModo={mudarModo} d={d} />}

            {modo === "pagina" ? (
              <div className="flex items-center rounded-xl border border-border">
                <IconBtn
                  onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                  label={d.common.zoomOut}
                >
                  <Minus className="h-4 w-4" aria-hidden />
                </IconBtn>
                <span className="w-12 text-center text-xs text-muted">
                  {Math.round(zoom * 100)}%
                </span>
                <IconBtn
                  onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
                  label={d.common.zoomIn}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                </IconBtn>
              </div>
            ) : (
              <div className="flex items-center rounded-xl border border-border">
                <IconBtn
                  onClick={() => mudarFonte(-0.1)}
                  disabled={fonte <= FONTE_MIN}
                  label={d.common.smallerText}
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
                  label={d.common.biggerText}
                >
                  <span className="flex items-center text-[13px] font-semibold">
                    A<Plus className="h-3 w-3" aria-hidden />
                  </span>
                </IconBtn>
              </div>
            )}

            <button
              onClick={toggleBookmark}
              aria-label={marcada ? d.reader.bookmarkedAria : d.reader.bookmarkAria}
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
              {marcada ? d.reader.bookmarked : d.reader.bookmark}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-start">
        {/* ================= página ================= */}
        {/* Tocar na folga em volta da leitura abre a grade de páginas — é o
            gesto do Kindle. O toque no texto continua sendo seleção: quem marca
            trecho não pode ter a grade abrindo no meio do caminho. */}
        <main
          onClick={(e) => {
            if (e.target !== e.currentTarget) return;
            if (!window.getSelection()?.isCollapsed) return;
            setVendoPaginas(true);
          }}
          className="min-w-0 flex-1 px-2 pb-32 pt-4 sm:px-6 sm:pb-10 sm:pt-6"
        >
          {erroArquivo ? (
            <div className="mx-auto max-w-lg px-4 py-24 text-center">
              <p className="text-lg font-semibold">{d.reader.fileFailed}</p>
              <p className="mt-2 text-sm text-muted">{erroArquivo}</p>
              <Link href="/library" className="mt-6 inline-block text-accent underline">
                {d.common.backToLibrary}
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
                  bookId={book.id}
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
                  ? d.reader.hintEpub
                  : modo === "pagina"
                    ? d.reader.hintPage
                    : d.reader.hintText}
              </p>
            </>
          )}
        </main>

        {/* ================= painel (desktop) ================= */}
        <aside className="sticky top-[53px] hidden h-[calc(100dvh-53px)] w-80 shrink-0 flex-col overflow-hidden border-l border-border bg-surface lg:flex xl:w-[22rem]">
          {painel}
        </aside>
      </div>

      {/* ================= barra inferior (mobile) ================= */}
      <nav className="safe-b fixed inset-x-0 bottom-0 z-30 flex items-center justify-around gap-1 border-t border-border bg-surface/95 px-2 pt-1 backdrop-blur-md lg:hidden">
        <BarBtn
          onClick={() => irPara(page - 1)}
          disabled={page <= 1}
          label={eEpub ? d.reader.prevChapter : d.reader.prevShort}
        >
          <ChevronLeft className="h-6 w-6" aria-hidden />
        </BarBtn>

        <BarBtn onClick={toggleBookmark} label={marcada ? d.reader.bookmarked : d.reader.bookmark}>
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
          <span className="text-[15px] font-semibold leading-tight">{rotulo(page)}</span>
          <span className="text-[10px] leading-tight text-muted">
            {eEpub ? `${d.card.chapterShort} ` : ""}
            {d.reader.of} {temRotulos ? rotulo(numPages) : numPages || "?"}
          </span>
        </button>

        <BarBtn onClick={() => setSheet("painel")} label={d.reader.notes}>
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
          label={eEpub ? d.reader.nextChapter : d.reader.nextShort}
        >
          <ChevronRight className="h-6 w-6" aria-hidden />
        </BarBtn>
      </nav>

      {editando && (
        <EditarLivro
          book={book}
          onSalvo={setNomes}
          onFechar={() => setEditando(false)}
        />
      )}

      {exportando && fileUrl && !eEpub && (
        <ExportarLivro
          fileUrl={fileUrl}
          titulo={nomes.title}
          autor={nomes.author}
          rotulos={rotulos}
          onFechar={() => setExportando(false)}
        />
      )}

      {conferindo && fileUrl && !eEpub && (
        <ConferirPagina
          fileUrl={fileUrl}
          pagina={page}
          numero={rotulo(page)}
          onFechar={() => setConferindo(false)}
        />
      )}

      {vendoPaginas && (
        <VisaoPaginas
          fileUrl={fileUrl}
          numPages={numPages}
          pagina={page}
          rotulos={rotulos}
          eEpub={eEpub}
          onIr={(p) => {
            irPara(p);
            setVendoPaginas(false);
          }}
          onFechar={() => setVendoPaginas(false)}
        />
      )}

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
                    {eEpub ? d.reader.goToChapter : d.reader.goToPage}
                  </p>
                  <div className="flex items-center gap-2">
                    <CampoPagina
                      page={page}
                      numPages={numPages}
                      rotulos={rotulos}
                      onIr={irPara}
                      className="h-12 w-28 rounded-xl border border-border bg-background px-4 text-center text-base outline-none focus:border-accent"
                    />
                    <span className="text-sm text-muted">
                      {d.reader.of} {temRotulos ? rotulo(numPages) : numPages || "?"}
                      {temRotulos && (
                        <span className="block text-[11px]">
                          {t(d.reader.bookNumbering, { page, total: numPages })}
                        </span>
                      )}
                    </span>
                    <Botao
                      variante="contorno"
                      onClick={() => setSheet(null)}
                      className="ml-auto"
                    >
                      {d.common.done}
                    </Botao>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => {
                        setSheet(null);
                        setVendoPaginas(true);
                      }}
                      className="tap justify-start rounded-xl border border-border px-3 text-sm font-medium text-muted transition active:bg-background"
                    >
                      <LayoutGrid className="h-4 w-4 shrink-0" aria-hidden />
                      {eEpub ? d.reader.seeChapters : d.reader.seePages}
                    </button>
                    <button
                      onClick={() => {
                        setAba("sumario");
                        setSheet("painel");
                      }}
                      className="tap justify-start rounded-xl border border-border px-3 text-sm font-medium text-muted transition active:bg-background"
                    >
                      <List className="h-4 w-4 shrink-0" aria-hidden />
                      {d.reader.toc}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-muted">{d.theme.label}</p>
                  <SeletorTema d={d} />
                </div>

                {!eEpub && (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted">
                      {d.reader.howToRead}
                    </p>
                    <Segmento
                      modo={modo}
                      onModo={mudarModo}
                      d={d}
                      className="w-full [&_button]:!min-h-12"
                    />
                    {modo === "texto" && (
                      <Botao
                        variante="contorno"
                        onClick={() => {
                          setConferindo(true);
                          setSheet(null);
                        }}
                        className="mt-2 w-full"
                      >
                        <Eye className="h-4 w-4" aria-hidden />
                        {d.reader.checkOriginal}
                      </Botao>
                    )}
                    <Botao
                      variante="contorno"
                      onClick={() => {
                        setExportando(true);
                        setSheet(null);
                      }}
                      className="mt-2 w-full"
                    >
                      <Download className="h-4 w-4" aria-hidden />
                      {d.reader.exportBook}
                    </Botao>
                  </div>
                )}

                {modo === "pagina" ? (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted">
                      {t(d.reader.pageSize, { pct: Math.round(zoom * 100) })}
                    </p>
                    <div className="flex gap-2">
                      <Botao
                        variante="contorno"
                        onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                        className="flex flex-1 items-center justify-center"
                        aria-label={d.common.zoomOut}
                      >
                        <Minus className="h-4 w-4" aria-hidden />
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => setZoom(1)}
                        className="flex-1"
                      >
                        {d.common.fit}
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
                        className="flex flex-1 items-center justify-center"
                        aria-label={d.common.zoomIn}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                      </Botao>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-sm font-medium text-muted">
                      {t(d.reader.textSize, {
                        pct: Math.round((fonte / FONTE_BASE) * 100),
                      })}
                    </p>
                    <div className="flex gap-2">
                      <Botao
                        variante="contorno"
                        onClick={() => mudarFonte(-0.1)}
                        disabled={fonte <= FONTE_MIN}
                        className="flex flex-1 items-center justify-center gap-0.5 text-sm font-semibold"
                        aria-label={d.common.smallerText}
                      >
                        A<Minus className="h-3.5 w-3.5" aria-hidden />
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => mudarFonte(FONTE_BASE - fonte)}
                        className="flex-1"
                      >
                        {d.common.default}
                      </Botao>
                      <Botao
                        variante="contorno"
                        onClick={() => mudarFonte(0.1)}
                        disabled={fonte >= FONTE_MAX}
                        className="flex flex-1 items-center justify-center gap-0.5 text-sm font-semibold"
                        aria-label={d.common.biggerText}
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
  busca,
  termoBusca,
  setTermoBusca,
  pagina,
  eEpub,
  numero,
  onIr,
  onDelHighlight,
  onRenomear,
  onAnotar,
  onDelBookmark,
  livroId,
}: {
  aba: Aba;
  setAba: (a: Aba) => void;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  sumario: EstadoSumario;
  busca: EstadoBusca;
  termoBusca: string;
  setTermoBusca: (t: string) => void;
  pagina: number;
  /** No EPUB o que avança é capítulo: muda o nome de tudo, não o número. */
  eEpub: boolean;
  /** Página do arquivo → número como o livro imprime ("17" → "3", "5" → "v"). */
  numero: (p: number) => string;
  onIr: (p: number) => void;
  onDelHighlight: (id: string) => void;
  onRenomear: (id: string) => void;
  onAnotar: (id: string) => void;
  onDelBookmark: (id: string) => void;
  livroId: string;
}) {
  const { d, t } = useI18n();
  const unidade = eEpub ? d.unit.chapter : d.unit.page;

  return (
    <>
      {/* A busca é só o ícone: com quatro rótulos escritos, "Marcações 12" e
          "Capítulos 3" não cabem lado a lado num celular de 320px. */}
      <div className="grid shrink-0 grid-cols-[auto_1fr_1fr_1fr] gap-1 border-b border-border p-2">
        <button
          onClick={() => setAba("busca")}
          aria-label={d.panel.tabSearch}
          title={d.panel.tabSearch}
          className={`tap rounded-xl px-2.5 transition ${
            aba === "busca" ? "bg-accent/10 text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          <Search className="mx-auto h-4 w-4" aria-hidden />
        </button>
        {(
          [
            ["sumario", d.panel.tabContents],
            ["marcacoes", t(d.panel.tabNotes, { n: highlights.length })],
            [
              "paginas",
              t(eEpub ? d.panel.tabChapters : d.panel.tabPages, { n: bookmarks.length }),
            ],
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
        {aba === "busca" ? (
          <Busca
            estado={busca}
            termo={termoBusca}
            setTermo={setTermoBusca}
            eEpub={eEpub}
            numero={numero}
            onIr={onIr}
          />
        ) : aba === "sumario" ? (
          <Sumario estado={sumario} pagina={pagina} numero={numero} onIr={onIr} />
        ) : aba === "marcacoes" ? (
          highlights.length === 0 ? (
            <Vazio>{d.panel.emptyNotes}</Vazio>
          ) : (
            <>
              <Link
                href={`/book/${livroId}/notes`}
                className="flex items-center gap-2 border-b border-border px-3 py-2.5 text-sm font-medium text-accent transition hover:bg-background"
              >
                <ScrollText className="h-4 w-4 shrink-0" aria-hidden />
                {d.panel.readAll}
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
                      {unidade} {numero(h.page)}
                    </span>
                    {h.title && (
                      <p className="display mt-0.5 text-[13px] leading-snug">
                        {h.title}
                      </p>
                    )}
                    <p className="mt-0.5 line-clamp-4 text-sm leading-snug">
                      {h.text || d.highlight.noText}
                    </p>
                    {h.note && (
                      <p className="mt-1.5 flex gap-1.5 border-l-2 border-accent/40 pl-2 text-[13px] leading-snug text-muted">
                        <StickyNote className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                        <span className="line-clamp-3 whitespace-pre-line">{h.note}</span>
                      </p>
                    )}
                  </button>
                  <div className="flex shrink-0 flex-col">
                    <button
                      onClick={() => onAnotar(h.id)}
                      aria-label={h.note ? d.highlight.noteEdit : d.highlight.noteAdd}
                      title={h.note ? d.highlight.noteEdit : d.highlight.noteAdd}
                      className={`tap !min-h-9 !min-w-9 rounded-lg transition hover:text-accent ${
                        h.note ? "text-accent" : "text-muted"
                      }`}
                    >
                      <StickyNote className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => onRenomear(h.id)}
                      aria-label={h.title ? d.highlight.titleEdit : d.highlight.titleShort}
                      title={h.title ? d.highlight.titleEdit : d.highlight.titleShort}
                      className="tap !min-h-9 !min-w-9 rounded-lg text-muted transition hover:text-accent"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => onDelHighlight(h.id)}
                      aria-label={d.highlight.deleteAria}
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
            {eEpub ? d.panel.emptyBookmarksChapters : d.panel.emptyBookmarksPages}
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
                  {eEpub ? d.unit.chapterCap : d.unit.pageCap} {numero(b.page)}
                </button>
                <button
                  onClick={() => onDelBookmark(b.id)}
                  aria-label={d.panel.removeBookmark}
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
  numero,
  onIr,
}: {
  estado: EstadoSumario;
  pagina: number;
  /** Página do arquivo → número como o livro imprime. */
  numero: (p: number) => string;
  onIr: (p: number) => void;
}) {
  const { d, t } = useI18n();
  const { itens, progresso, carregando, erro } = estado;

  if (erro) {
    return (
      <Vazio>
        {d.toc.failed} {erro}
      </Vazio>
    );
  }

  if (carregando || !itens) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted">
        <p>
          {progresso === null
            ? d.toc.reading
            : t(d.toc.scanning, { pct: Math.round(progresso * 100) })}
        </p>
        <div className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full bg-border">
          <div
            className="h-full bg-accent transition-[width] duration-300"
            style={{ width: `${Math.round((progresso ?? 0.06) * 100)}%` }}
          />
        </div>
        {progresso !== null && (
          <p className="mt-3 text-xs">{d.toc.scanNote}</p>
        )}
      </div>
    );
  }

  if (!itens.length) {
    return <Vazio>{d.toc.none}</Vazio>;
  }

  // Capítulo atual = o último que começa em página já passada.
  let atual = -1;
  itens.forEach((i, idx) => {
    if (i.pagina !== null && i.pagina <= pagina) atual = idx;
  });

  return (
    <ul className="py-1.5">
      {itens.map((item, i) => {
        const nivel = Math.min(3, Math.max(1, item.nivel));
        const ehAtual = i === atual;
        const semPagina = item.pagina === null;
        // Recuo em em, não em classe fixa: na coluna estreita do painel um
        // `pl-11` sobrava pouco pra frase e o título quebrava em escada.
        const recuo = { paddingLeft: `${0.75 + (nivel - 1) * 0.85}rem` };

        // Mesma grade nos três casos — título que quebra em várias linhas de um
        // lado, número numa coluna própria do outro. É isso que mantém os números
        // alinhados e impede o título comprido de empurrar a página pra fora.
        const linha = (
          <>
            <span
              className={`min-w-0 break-words leading-snug ${
                nivel === 1
                  ? "text-[13.5px] font-semibold"
                  : nivel === 2
                    ? "text-[13px]"
                    : "text-[12.5px] text-muted"
              } ${semPagina ? "text-muted/60" : ""}`}
            >
              {item.titulo}
            </span>
            <span
              className={`pt-px text-right text-[11px] tabular-nums ${
                ehAtual ? "text-accent" : "text-muted/70"
              }`}
              aria-hidden={semPagina}
            >
              {item.pagina === null ? "·" : numero(item.pagina)}
            </span>
          </>
        );

        const grade =
          "grid grid-cols-[minmax(0,1fr)_1.75rem] items-start gap-2 py-2 pr-3 text-left";

        return (
          <li key={`${i}-${item.titulo}`} className={nivel === 1 && i > 0 ? "mt-1" : ""}>
            {semPagina ? (
              <div
                style={recuo}
                className={`${grade} cursor-default`}
                title={d.toc.noPage}
              >
                {linha}
              </div>
            ) : (
              <button
                onClick={() => onIr(item.pagina as number)}
                style={recuo}
                aria-current={ehAtual ? "true" : undefined}
                className={`${grade} w-full transition hover:bg-background ${
                  ehAtual
                    ? "bg-accent/10 text-accent shadow-[inset_2px_0_0_var(--accent)]"
                    : ""
                }`}
              >
                {linha}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Segmento({
  modo,
  onModo,
  d,
  className = "",
}: {
  modo: Modo;
  onModo: (m: Modo) => void;
  d: Dicionario;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={d.reader.modeGroup}
      className={`flex items-center gap-0.5 rounded-xl border border-border p-0.5 ${className}`}
    >
      {(
        [
          ["pagina", d.reader.modePage, BookOpen],
          ["texto", d.reader.modeText, AlignLeft],
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

/** Escolha do tema na folha do celular, no mesmo formato do "Como ler". */
function SeletorTema({ d }: { d: Dicionario }) {
  const { tema, definir } = useTema();

  return (
    <div
      role="group"
      aria-label={d.theme.label}
      className="flex w-full items-center gap-0.5 rounded-xl border border-border p-0.5"
    >
      {(
        [
          ["sistema", d.theme.system, MonitorCog],
          ["claro", d.theme.light, Sun],
          ["escuro", d.theme.dark, Moon],
        ] as [Tema, string, typeof Sun][]
      ).map(([k, label, Icone]) => (
        <button
          key={k}
          onClick={() => definir(k)}
          aria-pressed={tema === k}
          className={`tap flex !min-h-12 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium transition ${
            tema === k ? "bg-accent/12 text-accent" : "text-muted hover:text-foreground"
          }`}
        >
          <Icone className="h-4 w-4 shrink-0" aria-hidden />
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * O campo "ir para a página", falando a numeração do livro.
 *
 * Quem digita "87" quer a página 87 **do livro** — a que está impressa no pé da
 * folha e é a que a citação, o índice e o colega de estudo usam. Só quando esse
 * número não existe no livro (ou o livro não tem numeração própria) é que ele
 * cai pra página do arquivo, que é a conta antiga.
 *
 * É campo de texto, e não `number`, porque a abertura do livro é numerada em
 * romano: "xix" precisa poder ser digitado.
 */
function CampoPagina({
  page,
  numPages,
  rotulos,
  onIr,
  className,
}: {
  page: number;
  numPages: number;
  rotulos: Rotulos | null;
  onIr: (p: number) => void;
  className?: string;
}) {
  const { d, t } = useI18n();
  const impresso = rotuloDaPagina(rotulos, page) ?? String(page);
  // Enquanto a pessoa digita, o campo é dela; fora disso ele espelha a página
  // aberta (que muda ao virar a folha, ao rolar, ao vir do sumário).
  const [rascunho, setRascunho] = useState<string | null>(null);

  function aplicar(texto: string) {
    const doLivro = paginaDoRotulo(rotulos, texto);
    if (doLivro) return onIr(doLivro);
    const fisica = Number(texto);
    if (Number.isFinite(fisica) && fisica >= 1) onIr(Math.min(fisica, numPages || fisica));
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={rascunho ?? impresso}
      onChange={(e) => {
        setRascunho(e.target.value);
        aplicar(e.target.value);
      }}
      onBlur={() => setRascunho(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          aplicar((e.target as HTMLInputElement).value);
          setRascunho(null);
        }
      }}
      aria-label={d.reader.goToPage}
      title={
        rotulos && impresso !== String(page)
          ? t(d.reader.pageInBook, { label: impresso, page })
          : undefined
      }
      className={className}
    />
  );
}

/**
 * Procurar dentro do livro.
 *
 * O campo fica sempre visível, mesmo enquanto o livro é lido pela primeira vez:
 * dá pra digitar o termo enquanto a barra de progresso corre, e a lista aparece
 * assim que a leitura acaba. Esconder o campo faria a espera parecer um erro.
 *
 * A ocorrência é mostrada como o livro escreveu — com acento e maiúscula —,
 * ainda que tenha sido achada pela forma sem acento. É o que deixa a pessoa
 * reconhecer a frase de que se lembra.
 */
function Busca({
  estado,
  termo,
  setTermo,
  eEpub,
  numero,
  onIr,
}: {
  estado: EstadoBusca;
  termo: string;
  setTermo: (t: string) => void;
  eEpub: boolean;
  /** Página do arquivo → número como o livro imprime. */
  numero: (p: number) => string;
  onIr: (p: number) => void;
}) {
  const { d, t, p } = useI18n();
  const { achados, cortado, progresso, carregando, semTexto, erro } = estado;
  const limpo = termo.trim();
  const unidade = eEpub ? d.unit.chapterCap : d.unit.pageCap;

  const corpo = () => {
    if (erro) {
      return (
        <Vazio>
          {d.search.failed} {erro}
        </Vazio>
      );
    }

    if (carregando) {
      return (
        <div className="px-4 py-10 text-center text-sm text-muted">
          <p>
            {progresso === null
              ? d.search.reading
              : t(d.search.scanning, { pct: Math.round(progresso * 100) })}
          </p>
          <div className="mx-auto mt-3 h-1 w-40 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-accent transition-[width] duration-300"
              style={{ width: `${Math.round((progresso ?? 0.06) * 100)}%` }}
            />
          </div>
          {progresso !== null && <p className="mt-3 text-xs">{d.search.scanNote}</p>}
        </div>
      );
    }

    if (semTexto) return <Vazio>{d.search.noText}</Vazio>;
    if (!limpo) return <Vazio>{d.search.hint}</Vazio>;
    if (limpo.length < MIN_TERMO) return <Vazio>{d.search.tooShort}</Vazio>;
    if (!achados) return <Vazio>{d.search.hint}</Vazio>;
    if (!achados.length) return <Vazio>{t(d.search.none, { term: limpo })}</Vazio>;

    return (
      <>
        <p className="px-3 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {p(d.search.count, achados.length)}
          {cortado ? ` · ${t(d.search.more, { n: achados.length })}` : ""}
        </p>
        <ul className="divide-y divide-border">
          {achados.map((a, i) => (
            <li key={`${a.pagina}-${i}`}>
              <button
                onClick={() => onIr(a.pagina)}
                className="block w-full px-3 py-2.5 text-left transition active:bg-background"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">
                  {unidade} {numero(a.pagina)}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug">
                  {a.antes}
                  <mark className="rounded bg-[var(--gold)]/45 px-0.5 text-foreground">
                    {a.casado}
                  </mark>
                  {a.depois}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </>
    );
  };

  return (
    <>
      {/* Gruda no topo: com trezentas ocorrências, rolar a lista não pode
          levar embora o campo em que se digita. */}
      <div className="sticky top-0 z-10 border-b border-border bg-surface p-2">
        <label className="relative block">
          <span className="sr-only">{d.search.placeholder}</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder={d.search.placeholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-base outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/12"
          />
        </label>
      </div>
      <div className="flex-1">{corpo()}</div>
    </>
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
