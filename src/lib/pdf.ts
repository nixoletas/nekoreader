"use client";

import { pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Worker servido pelo próprio app (copiado em prebuild/predev).
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export { pdfjs };

export const PDFJS_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

/**
 * Documento aberto direto pelo pdf.js (o modo texto não usa <Page>).
 * Guarda um por vez: trocar de livro fecha o anterior.
 */
const abertos = new Map<string, Promise<PDFDocumentProxy>>();

export function abrirDoc(url: string): Promise<PDFDocumentProxy> {
  const jaAberto = abertos.get(url);
  if (jaAberto) return jaAberto;

  for (const [chave, doc] of abertos) {
    abertos.delete(chave);
    void doc.then((d) => d.destroy()).catch(() => {});
  }

  const promessa = pdfjs.getDocument({ url, ...PDFJS_OPTIONS }).promise;
  abertos.set(url, promessa);
  promessa.catch(() => abertos.delete(url));
  return promessa;
}

/** Lê nº de páginas e gera capa JPEG da página 1. */
export async function inspecionarPdf(file: File): Promise<{
  totalPages: number;
  cover: Blob | null;
}> {
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const totalPages = doc.numPages;

  let cover: Blob | null = null;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: 480 / base.width });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext("2d");
    if (canvasContext) {
      await page.render({ canvas, canvasContext, viewport }).promise;
      cover = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.75),
      );
    }
  } catch {
    // capa é opcional
  }

  await doc.destroy();
  return { totalPages, cover };
}

export function formatarTamanho(bytes: number | null) {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}
