"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, MonitorSmartphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import BotaoTema from "@/components/botao-tema";
import { limparTudoOffline, obterSnapshotEstante, salvarSnapshotEstante } from "@/lib/offline-db";
import { useOnline } from "@/lib/use-offline";
import { useRotulos } from "@/lib/use-rotulos";
import { rotuloDaPagina } from "@/lib/pdf-rotulos";
import { haQuantoTempo } from "@/lib/format";
import { idDoDispositivo } from "@/lib/dispositivo";
import PreviaPagina from "@/components/previa-pagina";
import type { PosicaoDispositivo } from "@/lib/types";
import BookCard from "@/components/book-card";
import type { Book } from "@/lib/types";

// Usa pdf.js (leitura de página/capa) só no navegador — nunca no servidor, senão
// derruba o prerender estático da estante (pdf.js espera Canvas/DOMMatrix do DOM).
const Uploader = dynamic(() => import("@/components/uploader"), {
  ssr: false,
  loading: () => (
    <div className="h-[9.5rem] animate-pulse rounded-3xl border-2 border-dashed border-border bg-surface" />
  ),
});

// Mesmo motivo (ele carrega o Uploader por dentro), e é o caminho de todo dia:
// quem já tem estante quase nunca abre isto.
const AdicionarLivro = dynamic(() => import("@/components/adicionar-livro"), {
  ssr: false,
  loading: () => <span className="block h-9 w-9" />,
});

/**
 * "página 105 de 431" — na numeração que o livro imprime, não na do arquivo.
 *
 * Componente próprio porque é um hook por livro, e o cartão de continuar lendo
 * pode não existir. Lê só o que o leitor já descobriu e guardou neste aparelho;
 * livro ainda não aberto aqui mostra a página do arquivo, como antes.
 */
function PosicaoDoLivro({ book }: { book: Book }) {
  const rotulos = useRotulos(book.id, null, book.format, book.page_labels);
  const numero = (p: number) => rotuloDaPagina(rotulos, p) ?? String(p);

  return (
    <>
      {book.format === "epub" ? "capítulo" : "página"} {numero(book.last_page)}
      {book.total_pages ? ` de ${numero(book.total_pages)}` : ""}
    </>
  );
}

/**
 * "há 2 horas · no Chrome no Windows" — quando e onde a leitura parou.
 *
 * O aparelho só é dito quando **não** é este: repetir "no Chrome no Windows" pra
 * quem está olhando o Chrome no Windows não informa nada. Já a hora vale sempre,
 * e é o que responde "de quando é esse ponto?" antes de abrir o livro.
 *
 * Sem linha em `reading_positions` (livro lido antes desta versão, ou banco sem
 * a migração) sobra o horário do próprio livro — que é o que a estante já tinha.
 */
function OndeParou({
  posicao,
  quando,
  aparelhoId,
}: {
  posicao: PosicaoDispositivo | null;
  quando: string | null;
  aparelhoId: string | null;
}) {
  const momento = posicao?.updated_at ?? quando;
  if (!momento) return null;

  const outroAparelho =
    posicao && aparelhoId && posicao.device_id !== aparelhoId ? posicao.device_name : null;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-muted">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {haQuantoTempo(momento)}
      {outroAparelho && (
        <>
          <span aria-hidden>·</span>
          <MonitorSmartphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{outroAparelho}</span>
        </>
      )}
    </p>
  );
}

export default function Estante() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const online = useOnline();

  const [email, setEmail] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [covers, setCovers] = useState<Map<string, string>>(new Map());
  const [contagem, setContagem] = useState<Map<string, number>>(new Map());
  /** Onde cada livro parou, no aparelho que leu por último. */
  const [posicoes, setPosicoes] = useState<Map<string, PosicaoDispositivo>>(new Map());
  /**
   * Este aparelho — pra calar o nome dele em vez de repeti-lo pra quem já está
   * olhando ele. Ler o localStorage direto no estado é seguro aqui: o cartão que
   * usa isso só existe depois que a estante carrega, ou seja, nunca na primeira
   * renderização (que é a que o servidor também faz).
   */
  const [aparelhoId] = useState(() => idDoDispositivo());
  const [deDados, setDeDados] = useState(false); // true = mostrando retrato salvo (offline)
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace("/login");
      return;
    }
    setEmail(session.user.email ?? null);

    try {
      const { data: livrosDb, error } = await supabase
        .from("books")
        .select("*")
        .order("last_read_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;

      const lista = (livrosDb ?? []) as Book[];
      setBooks(lista);
      setDeDados(false);
      setErro(null);
      void salvarSnapshotEstante(lista);

      const coverPaths = lista.map((b) => b.cover_path).filter(Boolean) as string[];
      if (coverPaths.length) {
        const { data } = await supabase.storage.from("books").createSignedUrls(coverPaths, 60 * 60);
        const mapa = new Map<string, string>();
        data?.forEach((d) => {
          if (d.path && d.signedUrl) mapa.set(d.path, d.signedUrl);
        });
        setCovers(mapa);
      } else {
        setCovers(new Map());
      }

      // Tabela nova: em banco que ainda não rodou a migração isto volta com erro,
      // e o cartão segue sem o "onde e quando você parou".
      const { data: pos } = await supabase
        .from("reading_positions")
        .select("*")
        .order("updated_at", { ascending: false });
      const mapaPosicoes = new Map<string, PosicaoDispositivo>();
      (pos as PosicaoDispositivo[] | null)?.forEach((p) => {
        // A lista vem da mais recente pra mais antiga: a primeira de cada livro
        // é o aparelho que leu por último.
        if (!mapaPosicoes.has(p.book_id)) mapaPosicoes.set(p.book_id, p);
      });
      setPosicoes(mapaPosicoes);

      const { data: hl } = await supabase.from("highlights").select("book_id");
      const mapaContagem = new Map<string, number>();
      (hl as { book_id: string }[] | null)?.forEach((h) =>
        mapaContagem.set(h.book_id, (mapaContagem.get(h.book_id) ?? 0) + 1),
      );
      setContagem(mapaContagem);
    } catch (e) {
      if (navigator.onLine) {
        // Online mas falhou mesmo assim — não é a hora de mostrar dado velho
        // escondido atrás de "offline": é um erro de verdade, mostra ele.
        setErro(e instanceof Error ? e.message : "Não consegui carregar a estante.");
        return;
      }
      // sem rede — cai pro retrato salvo da última vez
      const salvo = await obterSnapshotEstante();
      if (salvo) {
        setBooks(salvo);
        setDeDados(true);
        setErro(null);
      } else {
        setErro("Sem internet e nenhuma estante salva neste aparelho ainda.");
      }
    }
  }, [supabase, router]);

  const primeiraCarga = useRef(true);
  useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  // Reconectou: busca de novo pra sair do retrato salvo e pegar o que mudou.
  useEffect(() => {
    if (primeiraCarga.current) {
      primeiraCarga.current = false;
      return;
    }
    if (!online) return;
    void (async () => {
      await carregar();
    })();
  }, [online, carregar]);

  const emLeitura = books?.find((b) => b.last_read_at && b.last_page > 1);
  const capaEmLeitura = emLeitura?.cover_path
    ? (covers.get(emLeitura.cover_path) ?? null)
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6 sm:pt-8">
      {/* ---------- cabeçalho ---------- */}
      <header className="mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display text-2xl leading-none sm:text-3xl">
            Marginália
          </h1>
          <p className="mt-1 flex items-center gap-2 truncate text-xs text-muted sm:text-sm">
            {email}
            {deDados && (
              <span className="shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-medium">
                offline
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
        <BotaoTema />
        <form
          action="/auth/signout"
          method="post"
          onSubmit={(e) => {
            // Apaga o que ficou salvo neste navegador antes de sair — o IndexedDB é
            // por aparelho, não por conta, então isso evita a próxima pessoa que
            // entrar aqui ver a estante/livros baixados desta conta.
            e.preventDefault();
            const form = e.currentTarget;
            void limparTudoOffline().finally(() => form.submit());
          }}
        >
          <button className="tap rounded-xl border border-border bg-surface px-4 text-sm font-medium text-muted transition hover:border-accent/50 hover:text-foreground">
            Sair
          </button>
        </form>
        </div>
      </header>

      <div className="rule mb-7" />

      {erro ? (
        <div className="py-14 text-center">
          <p className="display text-xl">Sem conexão</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">{erro}</p>
        </div>
      ) : !books ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[3/4] rounded-r-xl rounded-l-md bg-surface" />
              <div className="mt-2.5 h-3.5 w-4/5 rounded bg-surface" />
              <div className="mt-1.5 h-3 w-1/2 rounded bg-surface" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ---------- continuar lendo ---------- */}
          {emLeitura && (
            <Link
              href={`/livro/${emLeitura.id}`}
              className="sobe mb-8 flex items-stretch gap-4 overflow-hidden rounded-3xl border border-border bg-surface p-3 shadow-[var(--shadow)] transition active:scale-[0.99] sm:p-4"
            >
              {/* A prévia é da **página onde parou**, não a capa: é ela que faz
                  reconhecer o ponto da leitura antes de abrir o livro. */}
              <div className="relative h-32 w-24 shrink-0 overflow-hidden rounded-lg rounded-l-sm bg-background shadow-md sm:h-40 sm:w-[7.5rem]">
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 z-10 w-[5px] bg-gradient-to-r from-black/25 to-transparent"
                />
                <PreviaPagina book={emLeitura} capaUrl={capaEmLeitura} />
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent">
                  Continuar lendo
                </p>
                <p className="display mt-1 line-clamp-2 text-lg leading-tight sm:text-xl">
                  {emLeitura.title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  <PosicaoDoLivro book={emLeitura} />
                  {!!emLeitura.total_pages && (
                    <span className="tabular-nums">
                      {" · "}
                      {Math.min(
                        100,
                        Math.round((emLeitura.last_page / emLeitura.total_pages) * 100),
                      )}
                      %
                    </span>
                  )}
                </p>

                <OndeParou
                  posicao={posicoes.get(emLeitura.id) ?? null}
                  quando={emLeitura.last_read_at}
                  aparelhoId={aparelhoId}
                />

                {!!emLeitura.total_pages && (
                  <div className="mt-2.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round((emLeitura.last_page / emLeitura.total_pages) * 100),
                        )}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="hidden items-center pr-2 sm:flex">
                <span className="tap rounded-xl bg-accent px-5 text-sm font-semibold text-white">
                  Abrir
                </span>
              </div>
            </Link>
          )}

          {/* ---------- upload ----------
              Só com a estante vazia a caixa grande aparece: ali subir um livro é
              a única coisa que existe pra fazer. Com livros na estante ela vira o
              "+" discreto lá embaixo, ao lado do título. */}
          {online && books.length === 0 && (
            <div className="mb-8">
              <Uploader onUploaded={carregar} />
            </div>
          )}

          {/* ---------- estante ---------- */}
          {books.length === 0 ? (
            <div className="py-14 text-center">
              <p className="display text-xl">Estante vazia</p>
              <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
                Suba seu primeiro livro ali em cima — PDF ou EPUB. A capa vem do
                próprio arquivo.
              </p>
            </div>
          ) : (
            <>
              <h2 className="mb-4 flex items-center gap-2">
                <span className="display text-lg">Estante</span>
                <span className="text-sm text-muted">
                  {books.length} {books.length === 1 ? "livro" : "livros"}
                </span>
                {online && (
                  <span className="ml-auto">
                    <AdicionarLivro onEnviado={carregar} />
                  </span>
                )}
              </h2>
              <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {books.map((b) => (
                  <BookCard
                    key={b.id}
                    book={b}
                    coverUrl={b.cover_path ? (covers.get(b.cover_path) ?? null) : null}
                    highlightCount={contagem.get(b.id) ?? 0}
                    onExcluido={carregar}
                    onAtualizado={carregar}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
