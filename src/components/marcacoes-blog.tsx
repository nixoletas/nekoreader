"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Highlighter, Pencil, StickyNote, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { obterSnapshotLivro } from "@/lib/offline-db";
import { executarOuEnfileirar, mesclarFilaLocal } from "@/lib/offline-sync";
import { usePrompt } from "@/components/dialog-provider";
import BotaoTema from "@/components/botao-tema";
import {
  HIGHLIGHT_LABEL,
  porMaisRecente,
  swatch,
  type Book,
  type Highlight,
} from "@/lib/types";

/**
 * As marcações do livro em página inteira, pra ler de enfiada — o painel do leitor
 * é uma coluna estreita boa pra pular pra um trecho, mas ruim pra reler tudo.
 */
export default function MarcacoesBlog() {
  const params = useParams<{ id: string }>();
  const bookId = params.id;
  const router = useRouter();
  const [supabase] = useState(createClient);
  const perguntar = usePrompt();

  const [book, setBook] = useState<Book | null>(null);
  const [highlights, setHighlights] = useState<Highlight[] | null>(null);
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
      const { data: livro, error: erroLivro } = await supabase
        .from("books")
        .select("*")
        .eq("id", bookId)
        .single();
      if (erroLivro || !livro) throw erroLivro ?? new Error("Livro não encontrado.");

      const { data: marcacoes } = await supabase
        .from("highlights")
        .select("*")
        .eq("book_id", bookId)
        .order("page", { ascending: true })
        .order("created_at", { ascending: true });

      const mesclado = await mesclarFilaLocal(
        bookId,
        (marcacoes ?? []) as Highlight[],
        [],
      );
      setBook(livro as Book);
      setHighlights(porMaisRecente(mesclado.highlights));
      setErro(null);
    } catch (e) {
      if (navigator.onLine) {
        setErro(e instanceof Error ? e.message : "Não consegui carregar as marcações.");
        return;
      }
      const salvo = await obterSnapshotLivro(bookId);
      if (salvo) {
        const mesclado = await mesclarFilaLocal(bookId, salvo.highlights, []);
        setBook(salvo.book);
        setHighlights(porMaisRecente(mesclado.highlights));
        setErro(null);
      } else {
        setErro("Sem internet e este livro ainda não foi aberto neste aparelho.");
      }
    }
  }, [bookId, supabase, router]);

  useEffect(() => {
    if (!bookId) return;
    void (async () => {
      await carregar();
    })();
  }, [bookId, carregar]);

  async function renomear(id: string) {
    const atual = highlights?.find((h) => h.id === id);
    if (!atual) return;
    const resposta = await perguntar({
      titulo: atual.title ? "Renomear marcação" : "Dar um título à marcação",
      valor: atual.title ?? "",
      placeholder: "Ex.: definição de metadados",
      textoConfirmar: "Salvar",
    });
    if (resposta === null) return;
    const title = resposta.trim() || null;
    setHighlights((hs) => hs?.map((h) => (h.id === id ? { ...h, title } : h)) ?? null);
    await executarOuEnfileirar(supabase, `titulo:${id}`, {
      tipo: "highlight_title",
      id,
      title,
    });
  }

  async function anotar(id: string) {
    const atual = highlights?.find((h) => h.id === id);
    if (!atual) return;
    const resposta = await perguntar({
      titulo: atual.note ? "Editar nota" : "Escrever uma nota",
      valor: atual.note ?? "",
      placeholder: "O que este trecho te fez pensar?",
      multilinha: true,
      textoConfirmar: "Salvar",
    });
    if (resposta === null) return;
    const note = resposta.trim() || null;
    setHighlights((hs) => hs?.map((h) => (h.id === id ? { ...h, note } : h)) ?? null);
    await executarOuEnfileirar(supabase, `nota:${id}`, {
      tipo: "highlight_note",
      id,
      note,
    });
  }

  async function apagar(id: string) {
    setHighlights((hs) => hs?.filter((h) => h.id !== id) ?? null);
    await executarOuEnfileirar(supabase, `del:${id}`, { tipo: "highlight_del", id });
  }

  if (erro) {
    return (
      <div className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-lg font-semibold">Não consegui abrir</p>
        <p className="mt-2 text-sm text-muted">{erro}</p>
        <Link href="/" className="mt-6 inline-block text-accent underline">
          Voltar para a biblioteca
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[46rem] items-center gap-2 px-4 py-2">
          <Link
            href={`/livro/${bookId}`}
            aria-label="Voltar para a leitura"
            className="tap rounded-xl text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
          <span className="min-w-0 flex-1 truncate text-sm text-muted">
            {book?.title ?? "…"}
          </span>
          <BotaoTema />
        </div>
      </header>

      <main className="mx-auto max-w-[46rem] px-5 pb-24 pt-8 sm:px-8">
        <h1 className="display text-3xl leading-tight sm:text-4xl">Marcações</h1>
        {book && (
          <p className="mt-2 text-sm text-muted">
            {book.title}
            {book.author ? ` · ${book.author}` : ""}
            {highlights ? ` · ${highlights.length} trecho${highlights.length === 1 ? "" : "s"}` : ""}
          </p>
        )}

        <div className="rule my-8" />

        {!highlights ? (
          <div className="animate-pulse space-y-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 rounded bg-surface" />
                <div className="h-5 w-2/3 rounded bg-surface" />
                <div className="h-4 w-full rounded bg-surface" />
                <div className="h-4 w-5/6 rounded bg-surface" />
              </div>
            ))}
          </div>
        ) : highlights.length === 0 ? (
          <div className="py-16 text-center">
            <Highlighter className="mx-auto h-8 w-8 text-muted" aria-hidden />
            <p className="display mt-4 text-xl">Nenhuma marcação ainda</p>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
              Selecione um trecho na leitura e escolha uma cor — ele aparece aqui.
            </p>
            <Link
              href={`/livro/${bookId}`}
              className="mt-6 inline-block text-accent underline"
            >
              Voltar para a leitura
            </Link>
          </div>
        ) : (
          <div className="space-y-10">
            {highlights.map((h) => (
              <article key={h.id} className="group">
                <div className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: swatch(h.color) }}
                    aria-label={HIGHLIGHT_LABEL[h.color]}
                  />
                  <Link
                    href={`/livro/${bookId}?p=${h.page}`}
                    className="text-[11px] uppercase tracking-[0.14em] text-muted transition hover:text-accent"
                  >
                    {book?.format === "epub" ? "capítulo" : "página"} {h.page}
                  </Link>
                  <span className="ml-auto flex opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 max-md:opacity-100">
                    <button
                      onClick={() => anotar(h.id)}
                      aria-label={h.note ? "Editar nota" : "Escrever uma nota"}
                      title={h.note ? "Editar nota" : "Escrever uma nota"}
                      className={`tap !min-h-9 !min-w-9 rounded-lg transition hover:text-accent ${
                        h.note ? "text-accent" : "text-muted"
                      }`}
                    >
                      <StickyNote className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => renomear(h.id)}
                      aria-label={h.title ? "Renomear marcação" : "Dar um título"}
                      className="tap !min-h-9 !min-w-9 rounded-lg text-muted transition hover:text-accent"
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      onClick={() => apagar(h.id)}
                      aria-label="Apagar marcação"
                      className="tap !min-h-9 !min-w-9 rounded-lg text-muted transition hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </span>
                </div>

                {h.title && (
                  <h2 className="display mt-1.5 text-xl leading-snug sm:text-2xl">
                    {h.title}
                  </h2>
                )}

                <blockquote className="trecho mt-2">
                  {h.text || "(trecho sem texto)"}
                </blockquote>

                {/* A nota é a voz de quem leu — fica do lado de fora da citação,
                    com a cara de bilhete escrito na margem. */}
                {h.note && (
                  <p className="nota-margem mt-3 whitespace-pre-line">{h.note}</p>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}


