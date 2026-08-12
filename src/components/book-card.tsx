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
    book.total_pages && book.total_pages > 0
      ? Math.min(100, Math.round((book.last_page / book.total_pages) * 100))
      : 0;

  async function excluir() {
    if (!confirm(`Excluir "${book.title}"? As marcações vão junto.`)) return;
    setRemovendo(true);
    const supabase = createClient();
    const paths = [book.storage_path, book.cover_path].filter(
      Boolean,
    ) as string[];
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
    <div className="group relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm transition hover:shadow-md">
      <Link href={`/livro/${book.id}`} className="block">
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-background">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/20 to-accent/5 p-4 text-center text-sm font-medium text-muted">
              {book.title.slice(0, 40)}
            </div>
          )}
          {progresso > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
              <div
                className="h-full bg-accent"
                style={{ width: `${progresso}%` }}
              />
            </div>
          )}
        </div>

        <div className="p-3">
          <h3 className="line-clamp-2 text-sm font-semibold" title={book.title}>
            {book.title}
          </h3>
          <p className="mt-1 text-xs text-muted">
            {book.total_pages
              ? `pág. ${book.last_page} de ${book.total_pages}`
              : `pág. ${book.last_page}`}
            {highlightCount > 0 && ` · ${highlightCount} marcações`}
          </p>
          <p className="text-xs text-muted">{formatarTamanho(book.size_bytes)}</p>
        </div>
      </Link>

      <button
        onClick={excluir}
        disabled={removendo}
        title="Excluir"
        className="absolute right-2 top-2 rounded-lg bg-black/55 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100 hover:bg-red-600 disabled:opacity-50"
      >
        {removendo ? "..." : "Excluir"}
      </button>
    </div>
  );
}
