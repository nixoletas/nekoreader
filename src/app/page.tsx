import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Uploader from "@/components/uploader";
import BookCard from "@/components/book-card";
import type { Book } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BibliotecaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: books } = await supabase
    .from("books")
    .select("*")
    .order("last_read_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  const lista = (books ?? []) as Book[];

  // Capas em URLs assinadas (bucket é privado).
  const coverPaths = lista.map((b) => b.cover_path).filter(Boolean) as string[];
  const covers = new Map<string, string>();
  if (coverPaths.length) {
    const { data } = await supabase.storage
      .from("books")
      .createSignedUrls(coverPaths, 60 * 60);
    data?.forEach((d) => {
      if (d.path && d.signedUrl) covers.set(d.path, d.signedUrl);
    });
  }

  const { data: hl } = await supabase.from("highlights").select("book_id");
  const contagem = new Map<string, number>();
  hl?.forEach((h: { book_id: string }) =>
    contagem.set(h.book_id, (contagem.get(h.book_id) ?? 0) + 1),
  );

  const emLeitura = lista.find((b) => b.last_read_at && b.last_page > 1);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Minha biblioteca
          </h1>
          <p className="text-sm text-muted">{user.email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted transition hover:text-foreground">
            Sair
          </button>
        </form>
      </header>

      {emLeitura && (
        <Link
          href={`/livro/${emLeitura.id}`}
          className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-accent/30 bg-accent/5 px-5 py-4 transition hover:bg-accent/10"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-accent">
              Continuar lendo
            </p>
            <p className="truncate font-semibold">{emLeitura.title}</p>
            <p className="text-sm text-muted">
              página {emLeitura.last_page}
              {emLeitura.total_pages ? ` de ${emLeitura.total_pages}` : ""}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white">
            Abrir
          </span>
        </Link>
      )}

      <div className="mb-8">
        <Uploader />
      </div>

      {lista.length === 0 ? (
        <p className="py-16 text-center text-muted">
          Nenhum livro ainda. Suba um PDF aí em cima.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {lista.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              coverUrl={b.cover_path ? (covers.get(b.cover_path) ?? null) : null}
              highlightCount={contagem.get(b.id) ?? 0}
            />
          ))}
        </div>
      )}
    </main>
  );
}
