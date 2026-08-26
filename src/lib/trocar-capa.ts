"use client";

import type { createClient } from "@/lib/supabase/client";
import type { Book } from "@/lib/types";

import { ERRO, ErroApp } from "@/lib/erros";

type Supabase = ReturnType<typeof createClient>;

const LADO_MAX = 900;
const TAMANHO_MAX = 12 * 1024 * 1024;

/**
 * Troca a capa do livro por uma imagem escolhida pela pessoa.
 *
 * Sobe com um nome novo em vez de sobrescrever o antigo: a estante usa URL
 * assinada, e o navegador (ou o CDN) pode ficar servindo a imagem velha por horas
 * se o caminho não mudar. Com nome novo, a capa aparece na hora — e a antiga é
 * apagada em seguida pra não acumular lixo no Storage.
 */
export async function trocarCapa(
  supabase: Supabase,
  book: Pick<Book, "id" | "user_id" | "cover_path">,
  arquivo: File,
): Promise<string> {
  if (!arquivo.type.startsWith("image/")) {
    throw new ErroApp(ERRO.capaNaoImagem);
  }
  if (arquivo.size > TAMANHO_MAX) {
    throw new ErroApp(ERRO.capaGrande, "12 MB");
  }

  const jpeg = await reduzirParaJpeg(arquivo);
  const caminho = `${book.user_id}/${book.id}-capa-${Date.now()}.jpg`;

  const up = await supabase.storage
    .from("books")
    .upload(caminho, jpeg, { contentType: "image/jpeg" });
  if (up.error) throw up.error;

  const { error } = await supabase
    .from("books")
    .update({ cover_path: caminho })
    .eq("id", book.id);
  if (error) {
    // não deixa arquivo órfão se o banco recusou
    await supabase.storage.from("books").remove([caminho]);
    throw error;
  }

  // A capa antiga só sai depois que a nova já está registrada — se falhar aqui,
  // fica um arquivo sobrando, o que é bem melhor que um livro sem capa.
  if (book.cover_path && book.cover_path !== caminho) {
    await supabase.storage.from("books").remove([book.cover_path]);
  }

  return caminho;
}

/** Reduz e converte pra JPEG — capa não precisa de mais que isso. */
async function reduzirParaJpeg(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new ErroApp(ERRO.capaFalhou);
  }
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob) throw new ErroApp(ERRO.capaFalhou);
  return blob;
}
