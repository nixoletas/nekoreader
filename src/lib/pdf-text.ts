import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { extrairImagens, recortarCaixas, type ImagemPagina } from "@/lib/pdf-images";
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
  const conteudo = await page.getTextContent();

  // Livro digitalizado com camada de texto por cima: a folha escaneada é uma imagem
  // do tamanho da página inteira. Onde já existe texto pra ler, ela sai — senão a
  // página apareceria duas vezes, em foto e em letra. Sem texto nenhum ela fica: é
  // tudo o que a página tem.
  const temTexto = conteudo.items.some((it) => "str" in it && it.str.trim() !== "");
  // Também é o que resolve as fontes de verdade em `commonObjs` (ele percorre a
  // lista de operadores) — sem isso não dá pra saber qual trecho é itálico.
  const imagens = await extrairImagens(page, { ignorarFolha: temTexto });

  const { italicas, matematicas } = classificarFontes(page, conteudo.styles);

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
      // O pdf.js já resolve a família da fonte incorporada; "monospace" aqui é o
      // que separa bloco de código de texto comum.
      mono: conteudo.styles?.[fonte]?.fontFamily === "monospace",
      italico: italicas.has(fonte),
      // Fonte de matemática é o que denuncia fórmula: o gerador do PDF só troca
      // de fonte ali porque ali é equação.
      matematica: matematicas.has(fonte),
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

  await recortarFormulas(page, blocos);

  // Número de página solto no meio do caminho não vira parágrafo.
  return blocos.length > 2
    ? blocos.filter(
        (b) =>
          b.tipo === "imagem" ||
          b.tipo === "tabela" ||
          b.tipo === "sumario" ||
          !/^\d{1,4}$/.test(b.texto),
      )
    : blocos;
}

/**
 * A equação destacada vira um recorte da própria folha.
 *
 * O texto dela já foi remontado (e sai embaralhado — o PDF guarda glifo solto,
 * não fórmula); aqui ele ganha a imagem que vai ser mostrada no lugar. Uma
 * renderização da página serve todas as fórmulas dela.
 */
async function recortarFormulas(page: PDFPageProxy, blocos: Bloco[]): Promise<void> {
  const formulas = blocos.filter((b) => b.tipo === "formula");
  if (!formulas.length) return;

  try {
    const recortes = await recortarCaixas(
      page,
      formulas.map((f) => f.caixa),
    );
    formulas.forEach((f, i) => {
      const r = recortes[i];
      if (!r) return; // sem recorte, sobra o texto — que é o que já estava lá
      f.url = r.url;
      f.largura = r.largura;
      f.altura = r.altura;
    });
  } catch {
    // Falhou o desenho: a fórmula continua aparecendo como texto.
  }
}

/**
 * Quais ids de fonte da página são itálicos, e quais são de matemática.
 *
 * O `styles` do pdf.js só diz a família genérica (serif/sans/monospace); quem
 * sabe do itálico é o nome real da fonte incorporada ("MinionPro-It",
 * "Garamond-Italic", "Helvetica-Oblique"), que fica no `commonObjs`. Ele só está
 * resolvido depois da lista de operadores — por isso a checagem com `has`, que
 * devolve "nenhuma" em vez de estourar se algo mudar nessa ordem.
 *
 * As de matemática são as famílias que os geradores usam só pra fórmula: as
 * Computer Modern de matemática do TeX (CMMI, CMSY, CMEX), as da AMS (MSAM,
 * MSBM), Symbol e as que trazem "math" no nome.
 */
function classificarFontes(
  page: PDFPageProxy,
  styles: Record<string, { fontFamily?: string }> | undefined,
): { italicas: Set<string>; matematicas: Set<string> } {
  const italicas = new Set<string>();
  const matematicas = new Set<string>();

  for (const id of Object.keys(styles ?? {})) {
    try {
      if (!page.commonObjs.has(id)) continue;
      const fonte = page.commonObjs.get(id) as { name?: string } | null;
      const nome = fonte?.name ?? "";
      if (/italic|oblique|[-_]it($|[^a-z])/i.test(nome)) italicas.add(id);
      if (/cmmi|cmsy|cmex|msam|msbm|mtmi|mtsy|math|symbol|euclid/i.test(nome)) {
        matematicas.add(id);
      }
    } catch {
      // fonte não resolvida: segue sem itálico, que é melhor que não abrir a página
    }
  }

  return { italicas, matematicas };
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
