"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatarTamanho } from "@/lib/pdf";
import type { Book } from "@/lib/types";

export default function BookCard({
  book,
  coverUrl,
  highlightCount,
}: {
  book: Book;
  coverUrl: string | null;
  highlightCount: number;
}) {
  const router = useRouter();
  const [removendo, setRemovendo] = useState(false);

  const progresso =
    book.total_pages && book.total_pages > 1
      ? Math.min(100, Math.round((book.last_page / book.total_pages) * 100))
      : 0;

  async function excluir(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Tirar “${book.title}” da estante? As marcações vão junto.`))
      return;

    setRemovendo(true);
    const supabase = createClient();
    const paths = [book.storage_path, book.cover_path].filter(Boolean) as string[];
    await supabase.storage.from("books").remove(paths);
    const { error } = await supabase.from("books").delete().eq("id", book.id);
    if (error) {
      alert(error.message);
      setRemovendo(false);
      return;
    }
    router.refresh();
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
            <span className="absolute left-2 top-2 z-10 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
              {highlightCount} ✎
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
          {book.total_pages
            ? `pág. ${book.last_page} / ${book.total_pages}`
            : `pág. ${book.last_page}`}
          {book.size_bytes ? ` · ${formatarTamanho(book.size_bytes)}` : ""}
        </p>
      </Link>

      <button
        onClick={excluir}
        disabled={removendo}
        aria-label={`Excluir ${book.title}`}
        className="tap absolute right-1 top-1 !min-h-10 !min-w-10 rounded-full bg-black/45 text-sm text-white opacity-0 backdrop-blur-sm transition hover:bg-red-600 focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-100 disabled:opacity-40"
      >
        {removendo ? "…" : "🗑"}
      </button>
    </article>
  );
}
