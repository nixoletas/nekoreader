import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Reader from "@/components/reader";
import type { Book, Bookmark, Highlight } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function LivroPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: book } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .single();
  if (!book) notFound();

  const { data: signed, error: signedError } = await supabase.storage
    .from("books")
    .createSignedUrl((book as Book).storage_path, 60 * 60 * 6);

  if (signedError || !signed?.signedUrl) {
    return (
      <main className="mx-auto max-w-lg px-4 py-24 text-center">
        <p className="text-lg font-semibold">Não consegui abrir o arquivo</p>
        <p className="mt-2 text-sm text-muted">
          {signedError?.message ?? "URL não gerada."}
        </p>
        <Link href="/" className="mt-6 inline-block text-accent underline">
          Voltar para a biblioteca
        </Link>
      </main>
    );
  }

  const [{ data: highlights }, { data: bookmarks }] = await Promise.all([
    supabase
      .from("highlights")
      .select("*")
      .eq("book_id", id)
      .order("page", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("bookmarks")
      .select("*")
      .eq("book_id", id)
      .order("page", { ascending: true }),
  ]);

  return (
    <Reader
      book={book as Book}
      fileUrl={signed.signedUrl}
      initialHighlights={(highlights ?? []) as Highlight[]}
      initialBookmarks={(bookmarks ?? []) as Bookmark[]}
    />
  );
}
