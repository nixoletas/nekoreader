import type { PDFDocumentProxy } from "pdfjs-dist";
import { saneiaLigaduras, type Item } from "@/lib/pdf-blocos";

/** Texto cru de uma página, no formato que a remontagem espera. */
export type PaginaItens = { itens: Item[]; pw: number };

/**
 * Lê o texto de uma página, sem renderizar nada.
 *
 * Versão leve de propósito: não resolve as fontes de verdade (então não sabe o
 * que é itálico) nem recorta imagem. É o que torna viável varrer um livro de 500
 * páginas atrás de título ou de número impresso. O modo texto tem a sua própria
 * extração em `pdf-text.ts`, que paga esse preço porque só lê a página aberta.
 *
 * Devolve `null` — em vez de estourar — em página estranha: uma página quebrada
 * no meio do livro não pode derrubar a varredura inteira.
 */
export async function itensDaPagina(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<PaginaItens | null> {
  try {
    const page = await doc.getPage(pageNumber);
    const { width: pw } = page.getViewport({ scale: 1 });
    const conteudo = await page.getTextContent();

    const itens: Item[] = [];
    for (const it of conteudo.items) {
      if (!("str" in it) || !it.str) continue;
      const fonte = "fontName" in it ? String(it.fontName ?? "") : "";
      itens.push({
        texto: saneiaLigaduras(it.str.normalize("NFKC")),
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        alt: Math.abs(it.transform[3]) || it.height || 10,
        fonte,
        mono: conteudo.styles?.[fonte]?.fontFamily === "monospace",
        italico: false,
        espaco: !it.str.trim(),
      });
    }

    return { itens, pw };
  } catch {
    return null;
  }
}
