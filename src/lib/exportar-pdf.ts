"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { extrairBlocos } from "@/lib/pdf-text";
import { rotuloDaPagina, type Rotulos } from "@/lib/pdf-rotulos";
import { paraEpub, paraMarkdown, type MetaLivro, type PaginaExportada } from "@/lib/exportar";
import type { Bloco } from "@/lib/pdf-blocos";

export type Formato = "markdown" | "epub";

/** Quantas páginas são remontadas ao mesmo tempo — o mesmo lote do sumário. */
const LOTE = 6;

/**
 * O livro inteiro, remontado, virando arquivo.
 *
 * Passa por todas as páginas com a **mesma** remontagem que a leitura usa: o que
 * sai no arquivo é o que a pessoa viu na tela, inclusive títulos, tabelas e
 * notas. Por isso é caro — é o livro inteiro, uma página por vez — e por isso
 * aceita ser cancelado.
 */
export async function exportarLivro({
  doc,
  rotulos,
  meta,
  formato,
  sinal,
  aoProgredir,
}: {
  doc: PDFDocumentProxy;
  rotulos: Rotulos | null;
  meta: MetaLivro;
  formato: Formato;
  sinal?: AbortSignal;
  aoProgredir?: (fracao: number) => void;
}): Promise<{ nome: string; blob: Blob }> {
  const paginas: PaginaExportada[] = [];

  for (let inicio = 1; inicio <= doc.numPages; inicio += LOTE) {
    if (sinal?.aborted) throw new DOMException("cancelado", "AbortError");

    const fim = Math.min(doc.numPages, inicio + LOTE - 1);
    const lote = await Promise.all(
      Array.from({ length: fim - inicio + 1 }, async (_, i) => {
        const pagina = inicio + i;
        let blocos: Bloco[] = [];
        try {
          blocos = await extrairBlocos(doc, pagina);
        } catch {
          // Página que não remonta (fonte quebrada, arquivo cortado) sai vazia em
          // vez de derrubar a exportação do livro inteiro.
        }
        return { pagina, rotulo: rotuloDaPagina(rotulos, pagina), blocos };
      }),
    );

    paginas.push(...lote);
    aoProgredir?.(fim / doc.numPages);
  }

  const base = nomeDeArquivo(meta.titulo);
  try {
    if (formato === "markdown") {
      const texto = paraMarkdown(paginas, meta);
      return {
        nome: `${base}.md`,
        blob: new Blob([texto], { type: "text/markdown;charset=utf-8" }),
      };
    }

    return { nome: `${base}.epub`, blob: await paraEpub(paginas, meta) };
  } finally {
    // As imagens recortadas viram object URL, e um livro inteiro delas não pode
    // ficar segurando memória depois que o arquivo já saiu.
    for (const p of paginas) {
      for (const b of p.blocos) {
        if (b.tipo === "imagem") URL.revokeObjectURL(b.url);
      }
    }
  }
}

/** Título do livro → nome de arquivo que o sistema aceita. */
function nomeDeArquivo(titulo: string): string {
  const limpo = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acento, já separado pelo NFD
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  // Sem nada aproveitável no título (livro só em japonês, por exemplo), sobra um
  // nome neutro — é nome de arquivo, não texto de tela.
  return limpo || "book";
}

/** Entrega o arquivo pro navegador salvar. */
export function baixar(nome: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revogar na hora corta o download em navegador que ainda está lendo o blob.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
