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
      initialHighlights={(highlights ?? []) as Highlight[]}
      initialBookmarks={(bookmarks ?? []) as Bookmark[]}
    />
  );
}
