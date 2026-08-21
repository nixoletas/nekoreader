import type { PDFDocumentProxy } from "pdfjs-dist";
import { extrairImagens, type ImagemPagina } from "@/lib/pdf-images";
import {
  remontarColunas,
  saneiaLigaduras,
  type Bloco,
  type BlocoPosicionado,
  type Item,
} from "@/lib/pdf-blocos";

export type { Bloco } from "@/lib/pdf-blocos";

/**
 * Extrai o conteúdo da página: texto remontado em blocos (título/parágrafo/citação)
 * com as imagens recortadas encaixadas na posição em que apareciam.
 *
 * A remontagem em si mora em `pdf-blocos.ts` (módulo puro, testável fora do
 * navegador); aqui fica só a parte que depende do pdf.js e do canvas.
 */
export async function extrairBlocos(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<Bloco[]> {
  const page = await doc.getPage(pageNumber);
  const { width: pw } = page.getViewport({ scale: 1 });
  const [conteudo, imagens] = await Promise.all([
    page.getTextContent(),
    extrairImagens(page),
  ]);

  const itens: Item[] = [];
  for (const it of conteudo.items) {
    if (!("str" in it) || !it.str) continue;
    itens.push({
      texto: saneiaLigaduras(it.str.normalize("NFKC")),
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      alt: Math.abs(it.transform[3]) || it.height || 10,
      fonte: "fontName" in it ? String(it.fontName ?? "") : "",
      espaco: !it.str.trim(),
    });
  }

  const colunas = remontarColunas(itens, pw);
  if (!colunas.length) {
    // página sem texto (digitalizada) — se tiver imagem, ao menos ela aparece
    return imagens.sort((a, b) => b.y + b.h - (a.y + a.h)).map(imagemParaBloco);
  }

  const meio = pw / 2;
  const gruposImagem =
    colunas.length === 2
      ? [
          imagens.filter((im) => im.x + im.w / 2 < meio),
          imagens.filter((im) => im.x + im.w / 2 >= meio),
        ]
      : [imagens];

  const blocos = colunas
    .flatMap((col, i) => mesclarImagens(col, gruposImagem[i] ?? []))
    .map((p) => p.bloco);

  // Número de página solto no meio do caminho não vira parágrafo.
  return blocos.length > 2
    ? blocos.filter((b) => b.tipo === "imagem" || !/^\d{1,4}$/.test(b.texto))
    : blocos;
}

function imagemParaBloco(im: ImagemPagina): Bloco {
  return { tipo: "imagem", url: im.url, largura: im.largura, altura: im.altura };
}

/** Intercala parágrafos e imagens na ordem em que aparecem na página (de cima pra baixo). */
function mesclarImagens(
  paragrafos: BlocoPosicionado[],
  imagens: ImagemPagina[],
): BlocoPosicionado[] {
  if (!imagens.length) return paragrafos;

  const itensImagem: BlocoPosicionado[] = imagens.map((im) => ({
    y: im.y + im.h, // topo do retângulo — eixo do pdf cresce pra cima
    bloco: imagemParaBloco(im),
  }));

  return [...paragrafos, ...itensImagem].sort((a, b) => b.y - a.y);
}
