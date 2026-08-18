import type { PDFDocumentProxy } from "pdfjs-dist";
import { extrairImagens, type ImagemPagina } from "@/lib/pdf-images";

/** Um pedaço de conteúdo já remontado, pronto para virar <p>, <h2> ou <img>. */
export type Bloco =
  | { tipo: "titulo" | "paragrafo"; texto: string }
  | { tipo: "imagem"; url: string; largura: number; altura: number };

/** Bloco de texto com a posição vertical (pt) que ele ocupava na página — só pra encaixar as imagens. */
type BlocoPosicionado = { y: number; bloco: Bloco };

type Item = {
  texto: string;
  x: number;
  y: number;
  w: number;
  alt: number;
  /** Item que só carrega espaço — separa palavras, não conta como conteúdo. */
  espaco: boolean;
};
type Linha = { texto: string; x: number; dir: number; y: number; alt: number };

/**
 * Extrai o texto da página e remonta em parágrafos.
 *
 * O PDF não guarda parágrafos — guarda pedaços de texto com coordenadas. Aqui a
 * gente agrupa por linha, junta as linhas em parágrafos e desfaz a hifenização.
 * Heurística: acerta livro corrido, erra tabela e fórmula.
 */
export async function extrairBlocos(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<Bloco[]> {
  const page = await doc.getPage(pageNumber);
  const { width: pw, height: ph } = page.getViewport({ scale: 1 });
  const [conteudo, imagens] = await Promise.all([
    page.getTextContent(),
    extrairImagens(page),
  ]);

  const itens: Item[] = [];
  for (const it of conteudo.items) {
    if (!("str" in it) || !it.str) continue;
    itens.push({
      texto: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      alt: Math.abs(it.transform[3]) || it.height || 10,
      espaco: !it.str.trim(),
    });
  }
  if (!itens.some((i) => !i.espaco)) {
    // página sem texto (digitalizada) — se tiver imagem, ao menos ela aparece
    return imagens
      .sort((a, b) => b.y + b.h - (a.y + a.h))
      .map(imagemParaBloco);
  }

  const corpo =
    mediana(itens.filter((i) => !i.espaco).map((i) => i.alt)) || 10;

  const colunasTexto = separarColunas(itens, pw);
  const duas = colunasTexto.length === 2;
  const meio = pw / 2;
  const gruposImagem = duas
    ? [
        imagens.filter((im) => im.x + im.w / 2 < meio),
        imagens.filter((im) => im.x + im.w / 2 >= meio),
      ]
    : [imagens];

  const posicionados = colunasTexto.flatMap((col, i) => {
    const linhas = semCabecalho(agruparLinhas(col, corpo), ph);
    const paragrafos = juntarParagrafos(linhas, corpo);
    return mesclarImagens(paragrafos, gruposImagem[i] ?? []);
  });

  const blocos = posicionados.map((p) => p.bloco);

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

/* ---------------------------------------------------------------- */

function mediana(ns: number[]): number {
  if (!ns.length) return 0;
  const ord = [...ns].sort((a, b) => a - b);
  return ord[Math.floor(ord.length / 2)];
}

/** Duas colunas só quando quase nada cruza o miolo da página. */
function separarColunas(itens: Item[], pw: number): Item[][] {
  const meio = pw / 2;
  const banda = pw * 0.06;
  const cruzam = itens.filter(
    (i) => i.x < meio + banda && i.x + i.w > meio - banda,
  ).length;

  const esquerda: Item[] = [];
  const direita: Item[] = [];
  for (const i of itens) (i.x + i.w / 2 < meio ? esquerda : direita).push(i);

  const minimo = itens.length * 0.25;
  const duas =
    cruzam <= itens.length * 0.04 &&
    esquerda.length >= minimo &&
    direita.length >= minimo;

  return duas ? [esquerda, direita] : [itens];
}

/** Itens na mesma altura (mesma baseline) viram uma linha de texto. */
function agruparLinhas(itens: Item[], corpo: number): Linha[] {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);

  const grupos: Item[][] = [];
  for (const it of ordenados) {
    const atual = grupos[grupos.length - 1];
    if (atual && Math.abs(atual[0].y - it.y) <= corpo * 0.5) atual.push(it);
    else grupos.push([it]);
  }

  return grupos
    .map((g) => {
      const emOrdem = [...g].sort((a, b) => a.x - b.x);
      let texto = "";
      let anterior: Item | null = null;

      for (const it of emOrdem) {
        const separado =
          anterior && it.x - (anterior.x + anterior.w) > it.alt * 0.15;
        if ((it.espaco || separado) && texto && !/\s$/.test(texto)) texto += " ";
        if (!it.espaco) texto += it.texto;
        anterior = it;
      }

      const cheios = g.filter((i) => !i.espaco);
      return {
        texto: texto.replace(/\s+/g, " ").trim(),
        x: Math.min(...cheios.map((i) => i.x)),
        dir: Math.max(...cheios.map((i) => i.x + i.w)),
        y: g[0].y,
        alt: mediana(cheios.map((i) => i.alt)),
      };
    })
    .filter((l) => l.texto);
}

/** Tira número de página e título corrido preso na borda de cima/baixo. */
function semCabecalho(linhas: Linha[], ph: number): Linha[] {
  if (linhas.length < 3) return linhas;
  const largura = Math.max(...linhas.map((l) => l.dir - l.x), 1);

  return linhas.filter((l) => {
    const naBorda = l.y > ph * 0.92 || l.y < ph * 0.08;
    if (!naBorda) return true;
    const curta = l.dir - l.x < largura * 0.35;
    const soNumero = /^[\divxlcdm]+$/i.test(l.texto.replace(/[\s.\-—|]/g, ""));
    // "38 | Capítulo 2" ou "Capítulo 2 | 38"
    const numerada = /^\d{1,4}\s*[|·–—]/.test(l.texto) ||
      /[|·–—]\s*\d{1,4}$/.test(l.texto);
    return !curta && !soNumero && !numerada;
  });
}

/** Linhas → parágrafos. Quebra por espaçamento, recuo, ponto final ou corpo. */
function juntarParagrafos(linhas: Linha[], corpo: number): BlocoPosicionado[] {
  if (!linhas.length) return [];
  const esquerda = mediana(linhas.map((l) => l.x));
  const largura = mediana(linhas.map((l) => l.dir - l.x));

  const blocos: BlocoPosicionado[] = [];
  let atual: Linha[] = [];
  const fechar = () => {
    if (atual.length) blocos.push({ y: atual[0].y, bloco: montar(atual, corpo) });
    atual = [];
  };

  linhas.forEach((l, i) => {
    const ant = linhas[i - 1];
    if (ant) {
      const vao = ant.y - l.y;
      const salto = vao > Math.max(ant.alt, l.alt) * 1.7;
      const recuo = l.x > esquerda + corpo * 0.9;
      const encerrou =
        ant.dir - ant.x < largura * 0.82 && /[.!?:;"”')\]]$/.test(ant.texto);
      const outroCorpo = Math.abs(l.alt - ant.alt) > corpo * 0.25;
      if (salto || recuo || encerrou || outroCorpo) fechar();
    }
    atual.push(l);
  });
  fechar();

  return blocos;
}

/** Hífen no fim da linha: comum (-), tipográfico (‐ ‑) ou opcional (­). */
const HIFEN_FINAL = /[A-Za-zÀ-ÿ]([-‐‑­])$/;

function montar(linhas: Linha[], corpo: number): Bloco {
  let texto = "";
  for (const l of linhas) {
    if (!texto) {
      texto = l.texto;
      continue;
    }

    const hifen = HIFEN_FINAL.exec(texto);
    if (hifen && /^[a-zà-ÿ]/.test(l.texto)) {
      // Hífen tipográfico é sempre quebra: "Lan‐ guages" → "Languages".
      // Com hífen comum, só junta sem apagar se a palavra já é composta
      // ("one-to-" + "many"), senão era hifenização: "conti-" + "nuação".
      const ultima = texto.slice(texto.lastIndexOf(" ") + 1);
      const composta = hifen[1] === "-" && ultima.split("-").length > 2;
      texto = composta ? texto + l.texto : texto.slice(0, -1) + l.texto;
      continue;
    }

    texto += " " + l.texto;
  }

  const alt = mediana(linhas.map((l) => l.alt));
  const titulo = alt > corpo * 1.18 && linhas.length <= 3;
  return { tipo: titulo ? "titulo" : "paragrafo", texto };
}
