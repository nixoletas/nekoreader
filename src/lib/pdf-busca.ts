import type { PDFDocumentProxy } from "pdfjs-dist";
import { remontarColunas, type Bloco } from "@/lib/pdf-blocos";
import { itensDaPagina } from "@/lib/pdf-itens";
import { textoDosBlocos } from "@/lib/busca";
import { obterOcrDoLivro } from "@/lib/offline-db";

/**
 * Ler o livro inteiro, uma vez, pra a busca ter onde procurar.
 *
 * O texto de cada página sai da mesma remontagem que o modo texto usa — é ela
 * que junta linha em parágrafo e desfaz a hifenização, e é por isso que procurar
 * "continuação" acha o que o arquivo guarda como "conti-" e "nuação" em linhas
 * diferentes. Sem remontar, a busca só acharia palavra que não foi cortada.
 *
 * A extração é a leve de `pdf-itens` (não resolve itálico nem recorta imagem),
 * a mesma que a varredura de títulos usa: é o que torna viável ler um livro de
 * 700 páginas sem travar a aba.
 */

/** Quantas páginas por vez — o suficiente pra ocupar o worker sem prender a aba. */
const LOTE = 8;

export type Varredura = {
  /** `paginas[0]` é a página 1 do arquivo. Página sem texto vem como "". */
  paginas: string[];
  /**
   * A varredura chegou ao fim? `false` = foi cancelada no meio (a pessoa fechou
   * a aba da busca, trocou de livro). O que veio até ali serve pra procurar
   * agora, mas **não** vale guardar: guardado, o livro ficaria com metade do
   * texto pra sempre e a busca mentiria sem dar sinal.
   */
  completo: boolean;
};

export async function varrerTextoPdf(
  doc: PDFDocumentProxy,
  bookId: string,
  { aoProgredir, sinal }: { aoProgredir?: (fracao: number) => void; sinal?: AbortSignal } = {},
): Promise<Varredura> {
  // Página digitalizada não tem camada de texto — mas se alguém já passou o OCR
  // nela no modo texto, o resultado está guardado aqui e entra na busca de graça.
  const ocr: Map<number, Bloco[]> = await obterOcrDoLivro(bookId).catch(
    () => new Map<number, Bloco[]>(),
  );

  const paginas: string[] = [];
  for (let inicio = 1; inicio <= doc.numPages; inicio += LOTE) {
    if (sinal?.aborted) return { paginas, completo: false };

    const fim = Math.min(doc.numPages, inicio + LOTE - 1);
    const lote = await Promise.all(
      Array.from({ length: fim - inicio + 1 }, (_, i) =>
        textoDaPagina(doc, inicio + i, ocr),
      ),
    );
    paginas.push(...lote);
    aoProgredir?.(fim / doc.numPages);
  }

  return { paginas, completo: true };
}

async function textoDaPagina(
  doc: PDFDocumentProxy,
  pageNumber: number,
  ocr: Map<number, Bloco[]>,
): Promise<string> {
  const doOcr = ocr.get(pageNumber);
  if (doOcr) return textoDosBlocos(doOcr);

  // Página estranha volta vazia em vez de estourar: uma página quebrada no meio
  // do livro não pode derrubar a leitura das outras 699.
  const lido = await itensDaPagina(doc, pageNumber);
  if (!lido) return "";

  const blocos = remontarColunas(lido.itens, lido.pw)
    .flat()
    .map((p) => p.bloco);
  return textoDosBlocos(blocos);
}
