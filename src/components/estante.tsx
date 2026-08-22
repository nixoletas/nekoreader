"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { limparTudoOffline, obterSnapshotEstante, salvarSnapshotEstante } from "@/lib/offline-db";
import { useOnline } from "@/lib/use-offline";
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

export default function Estante() {
  const router = useRouter();
  const [supabase] = useState(createClient);
  const online = useOnline();

  const [email, setEmail] = useState<string | null>(null);
  const [books, setBooks] = useState<Book[] | null>(null);
  const [covers, setCovers] = useState<Map<string, string>>(new Map());
  const [contagem, setContagem] = useState<Map<string, number>>(new Map());
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
              <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-lg rounded-l-sm bg-background shadow-md sm:h-32 sm:w-24">
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 z-10 w-[5px] bg-gradient-to-r from-black/25 to-transparent"
                />
                {capaEmLeitura ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={capaEmLeitura} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-[linear-gradient(160deg,var(--accent),var(--gold))]" />
                )}
              </div>

              <div className="flex min-w-0 flex-1 flex-col justify-center">
                <p className="text-[11px] uppercase tracking-[0.18em] text-accent">
                  Continuar lendo
                </p>
                <p className="display mt-1 line-clamp-2 text-lg leading-tight sm:text-xl">
                  {emLeitura.title}
                </p>
                <p className="mt-1 text-sm text-muted">
                  página {emLeitura.last_page}
                  {emLeitura.total_pages ? ` de ${emLeitura.total_pages}` : ""}
                </p>

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

          {/* ---------- upload ---------- */}
          {online && (
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
              <h2 className="mb-4 flex items-baseline gap-2">
                <span className="display text-lg">Estante</span>
                <span className="text-sm text-muted">{books.length} livros</span>
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
