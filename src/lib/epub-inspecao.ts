"use client";

import { abrirEpub, analisadorDoNavegador } from "@/lib/epub";
import type { Inspecao } from "@/lib/types";
import { ERRO, ErroApp } from "@/lib/erros";

const LADO_MAX = 480;

/**
 * Lê o EPUB o suficiente pra ficha da estante: quantos capítulos tem, como se
 * chama, de quem é e qual é a capa.
 *
 * Diferente do PDF, o EPUB já traz título e autor escritos — então o livro entra
 * na estante com o nome de verdade em vez do nome do arquivo.
 */
export async function inspecionarEpub(file: File): Promise<Inspecao> {
  const epub = await abrirEpub(await file.arrayBuffer(), analisadorDoNavegador());
  if (!epub.capitulos.length) {
    throw new ErroApp(ERRO.epubSemCapitulos);
  }

  let cover: Blob | null = null;
  if (epub.capa) {
    try {
      const original = await epub.lerBinario(epub.capa);
      if (original) cover = await reduzirParaJpeg(original);
    } catch {
      // capa é opcional — livro sem ela ganha a capa desenhada pela estante
    }
  }

  return {
    totalPages: epub.capitulos.length,
    cover,
    title: epub.titulo || null,
    author: epub.autor,
  };
}

/** Mesma capa em JPEG pequeno que o PDF gera, pra estante ficar consistente. */
async function reduzirParaJpeg(original: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(original);
  const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
  const largura = Math.max(1, Math.round(bitmap.width * escala));
  const altura = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return null;
  }
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.75),
  );
}
