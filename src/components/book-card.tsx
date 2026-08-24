"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Check, Download, Highlighter, ImageUp, Loader2, Pencil, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatarTamanho } from "@/lib/format";
import { useOfflineBook } from "@/lib/use-offline-book";
import { trocarCapa } from "@/lib/trocar-capa";
import { useAlert, useConfirm } from "@/components/dialog-provider";
import EditarLivro from "@/components/editar-livro";
import type { Book } from "@/lib/types";

export default function BookCard({
  book,
  coverUrl,
  highlightCount,
  onExcluido,
  onAtualizado,
}: {
  book: Book;
  coverUrl: string | null;
  highlightCount: number;
  onExcluido: () => void;
  onAtualizado: () => void;
}) {
  const [removendo, setRemovendo] = useState(false);
  const [trocandoCapa, setTrocandoCapa] = useState(false);
  const [editando, setEditando] = useState(false);
  const capaRef = useRef<HTMLInputElement>(null);
  const offline = useOfflineBook(book);
  const confirmar = useConfirm();
  const alertar = useAlert();

  const rotulo = book.format === "epub" ? "cap." : "pág.";

  const progresso =
    book.total_pages && book.total_pages > 1
      ? Math.min(100, Math.round((book.last_page / book.total_pages) * 100))
      : 0;

  async function excluir(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await confirmar({
      titulo: `Tirar “${book.title}” da estante?`,
      mensagem: "As marcações vão junto — não dá pra desfazer.",
      textoConfirmar: "Tirar da estante",
      perigo: true,
    });
    if (!ok) return;

    setRemovendo(true);
    const supabase = createClient();
    const paths = [book.storage_path, book.cover_path].filter(Boolean) as string[];
    await supabase.storage.from("books").remove(paths);
    const { error } = await supabase.from("books").delete().eq("id", book.id);
    if (error) {
      await alertar({ titulo: "Não consegui excluir", mensagem: error.message });
      setRemovendo(false);
      return;
    }
    onExcluido();
  }

  async function alternarOffline(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (offline.status === "baixando") return;
    if (offline.status === "disponivel") {
      const ok = await confirmar({
        titulo: `Remover a cópia offline de “${book.title}”?`,
        textoConfirmar: "Remover",
        perigo: true,
      });
      if (!ok) return;
      await offline.remover();
      return;
    }
    void offline.baixar();
  }

  async function escolherCapa(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    capaRef.current?.click();
  }

  async function aplicarCapa(arquivo: File | undefined) {
    if (!arquivo) return;
    setTrocandoCapa(true);
    try {
      await trocarCapa(createClient(), book, arquivo);
      onAtualizado();
    } catch (err) {
      await alertar({
        titulo: "Não consegui trocar a capa",
        mensagem: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTrocandoCapa(false);
      if (capaRef.current) capaRef.current.value = "";
    }
  }

  return (
    <article className="group relative">
      <Link href={`/livro/${book.id}`} className="block">
        {/* capa com lombada */}
        <div className="relative aspect-[3/4] overflow-hidden rounded-r-xl rounded-l-md bg-surface shadow-[var(--shadow)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lg">
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 z-10 w-[7px] bg-gradient-to-r from-black/25 to-transparent"
          />
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(160deg,var(--accent)_0%,var(--gold)_130%)] p-4">
              <span className="display line-clamp-5 text-center text-sm text-white/95">
                {book.title}
              </span>
            </div>
          )}

          {progresso > 0 && (
            <div className="absolute inset-x-0 bottom-0 z-10 h-1.5 bg-black/25">
              <div
                className="h-full bg-[var(--gold)]"
                style={{ width: `${progresso}%` }}
              />
            </div>
          )}

          {highlightCount > 0 && (
            <span className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              {highlightCount} <Highlighter className="h-3 w-3" aria-hidden />
            </span>
          )}
        </div>

        <h3
          className="mt-2.5 line-clamp-2 text-[13px] font-semibold leading-snug sm:text-sm"
          title={book.title}
        >
          {book.title}
        </h3>
        <p className="mt-0.5 text-xs text-muted">
          {/* No EPUB o que avança é capítulo, não folha. */}
          {rotulo}
          {book.total_pages ? ` ${book.last_page} / ${book.total_pages}` : ` ${book.last_page}`}
          {book.size_bytes ? ` · ${formatarTamanho(book.size_bytes)}` : ""}
        </p>
      </Link>

      <input
        ref={capaRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => void aplicarCapa(e.target.files?.[0])}
      />

      <button
        onClick={excluir}
        disabled={removendo}
        aria-label={`Excluir ${book.title}`}
        className="tap absolute right-1 top-1 !min-h-10 !min-w-10 rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition hover:bg-red-600 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-40"
      >
        {removendo ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Trash2 className="h-4 w-4" aria-hidden />
        )}
      </button>

      <button
        onClick={escolherCapa}
        disabled={trocandoCapa}
        aria-label={`Trocar a capa de ${book.title}`}
        title="Trocar a capa"
        className="tap absolute right-1 top-12 !min-h-10 !min-w-10 rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/65 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-40"
      >
        {trocandoCapa ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <ImageUp className="h-4 w-4" aria-hidden />
        )}
      </button>

      <button
        onClick={(e) => {
          // O card inteiro é um link pro livro: sem isto, editar abriria a leitura.
          e.preventDefault();
          e.stopPropagation();
          setEditando(true);
        }}
        aria-label={`Editar título e autor de ${book.title}`}
        title="Editar título e autor"
        className="tap absolute right-1 top-[5.5rem] !min-h-10 !min-w-10 rounded-full bg-black/45 text-white opacity-0 backdrop-blur-sm transition hover:bg-black/65 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>

      {editando && (
        <EditarLivro
          book={book}
          onSalvo={onAtualizado}
          onFechar={() => setEditando(false)}
        />
      )}

      <button
        onClick={alternarOffline}
        disabled={offline.status === "baixando"}
        aria-label={
          offline.status === "disponivel"
            ? `Remover cópia offline de ${book.title}`
            : offline.status === "baixando"
              ? "Baixando para leitura offline"
              : `Disponibilizar ${book.title} offline`
        }
        title={
          offline.status === "disponivel"
            ? "Disponível offline"
            : "Disponibilizar offline"
        }
        className={`tap absolute left-1 top-1 !min-h-10 !min-w-10 rounded-full text-xs font-semibold text-white backdrop-blur-sm transition ${
          offline.status === "disponivel"
            ? "bg-emerald-600/80"
            : offline.status === "baixando"
              ? "bg-black/55"
              : "bg-black/45 opacity-0 hover:bg-black/60 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100"
        }`}
      >
        {offline.status === "disponivel" ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : offline.status === "baixando" ? (
          offline.progresso === null ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            `${offline.progresso}%`
          )
        ) : (
          <Download className="h-4 w-4" aria-hidden />
        )}
      </button>
    </article>
  );
}
