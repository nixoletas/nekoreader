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

  // Bucket é privado: capas por URL assinada.
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
          <p className="mt-1 truncate text-xs text-muted sm:text-sm">
            {user.email}
          </p>
        </div>
        <form action="/auth/signout" method="post">
          <button className="tap rounded-xl border border-border bg-surface px-4 text-sm font-medium text-muted transition hover:border-accent/50 hover:text-foreground">
            Sair
          </button>
        </form>
      </header>

      <div className="rule mb-7" />

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
                      Math.round(
                        (emLeitura.last_page / emLeitura.total_pages) * 100,
                      ),
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
      <div className="mb-8">
        <Uploader />
      </div>

      {/* ---------- estante ---------- */}
      {lista.length === 0 ? (
        <div className="py-14 text-center">
          <p className="display text-xl">Estante vazia</p>
          <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
            Suba seu primeiro PDF ali em cima. A capa é gerada da primeira
            página.
          </p>
        </div>
      ) : (
        <>
          <h2 className="mb-4 flex items-baseline gap-2">
            <span className="display text-lg">Estante</span>
            <span className="text-sm text-muted">{lista.length} livros</span>
          </h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {lista.map((b) => (
              <BookCard
                key={b.id}
                book={b}
                coverUrl={b.cover_path ? (covers.get(b.cover_path) ?? null) : null}
                highlightCount={contagem.get(b.id) ?? 0}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
