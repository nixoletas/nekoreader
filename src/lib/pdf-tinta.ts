"use client";

import type { PDFPageProxy } from "pdfjs-dist";
import type { Item } from "@/lib/pdf-blocos";

/**
 * O peso da letra, medido na folha desenhada.
 *
 * No livro digitalizado a página inteira é escrita numa fonte só — a que o OCR
 * inventou pra camada de texto. Sem contraste de fonte, `classificar` não tem
 * como saber o que é título: o negrito, que é o sinal de sempre, simplesmente
 * não está no arquivo.
 *
 * Só que ele está na *imagem*. O que se mede aqui é a **espessura do traço**:
 * quantos pixels escuros seguidos, em média, cada pincelada de letra tem. Negrito
 * engorda o traço; corpo menor ou maior não muda a proporção, porque a medida sai
 * dividida pela altura da linha. Contar pixel escuro puro e simples não serve —
 * isso mede quão cheia a linha está de letra, não quão pesada a letra é.
 *
 * Vale só pro caso digitalizado: no PDF digital o nome da fonte já diz tudo, e
 * desenhar a página pra descobrir o que está escrito ali seria pagar caro à toa.
 */

/** Largura em pixel pra desenhar a página antes de medir. */
const LARGURA_MEDIDA = 1400;

/** Abaixo disto a caixa do trecho é fina demais pra ter traço que se meça. */
const LADO_MIN_PX = 3;

type Caixa = { esq: number; dir: number; topo: number; base: number; alt: number };

/**
 * Preenche `traco` em cada item — a espessura do traço dividida pela altura da
 * linha. Quem não deu pra medir fica sem, e a classificação segue sem esse sinal.
 */
export async function medirTraco(page: PDFPageProxy, itens: Item[]): Promise<void> {
  if (!itens.length) return;

  const base = page.getViewport({ scale: 1 });
  const escala = LARGURA_MEDIDA / base.width;
  const viewport = page.getViewport({ scale: escala });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  // Fundo branco: página com transparência sai preta, e aí tudo vira traço.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const largura = canvas.width;
  const altura = canvas.height;

  // Um byte de luminância por pixel — o resto do trabalho lê isto, não o RGBA.
  const cinza = new Uint8Array(largura * altura);
  for (let p = 0, i = 0; p < cinza.length; p++, i += 4) {
    cinza[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }

  const caixas = itens.map((it) => caixaDoItem(it, viewport, largura, altura));
  const limiar = limiarDeOtsu(cinza, largura, caixas);

  itens.forEach((it, i) => {
    const c = caixas[i];
    if (!c) return;
    const espessura = tracoMedio(cinza, largura, c, limiar);
    if (espessura > 0) it.traco = espessura / c.alt;
  });
}

/** A caixa do trecho na folha desenhada, com folga pra pegar acento e perna de letra. */
function caixaDoItem(
  it: Item,
  viewport: { convertToViewportPoint: (x: number, y: number) => number[] },
  largura: number,
  altura: number,
): Caixa | null {
  if (it.espaco || !it.texto.trim() || it.w <= 0 || it.alt <= 0) return null;

  // `y` é a linha de base: a letra sobe quase uma altura acima dela e a perna do
  // "g" desce um tanto abaixo.
  const [x1, y1] = viewport.convertToViewportPoint(it.x, it.y - it.alt * 0.25);
  const [x2, y2] = viewport.convertToViewportPoint(it.x + it.w, it.y + it.alt * 0.95);

  const esq = Math.max(0, Math.floor(Math.min(x1, x2)));
  const dir = Math.min(largura, Math.ceil(Math.max(x1, x2)));
  const topo = Math.max(0, Math.floor(Math.min(y1, y2)));
  const fim = Math.min(altura, Math.ceil(Math.max(y1, y2)));
  if (dir - esq < LADO_MIN_PX || fim - topo < LADO_MIN_PX) return null;

  return { esq, dir, topo, base: fim, alt: fim - topo };
}

/**
 * Onde termina o papel e começa a tinta.
 *
 * O método de Otsu: parte o histograma no ponto que deixa os dois lados mais
 * separados que der. Um corte fixo em 128 funciona no escaneado limpo e falha no
 * papel amarelado ou na cópia clara, que é justamente o livro velho.
 *
 * O histograma sai só de dentro das caixas de texto — a margem branca da folha é
 * a maior parte da página e afogaria a conta.
 */
function limiarDeOtsu(
  cinza: Uint8Array,
  largura: number,
  caixas: (Caixa | null)[],
): number {
  const hist = new Uint32Array(256);
  let total = 0;
  for (const c of caixas) {
    if (!c) continue;
    for (let y = c.topo; y < c.base; y++) {
      const linha = y * largura;
      for (let x = c.esq; x < c.dir; x++) {
        hist[cinza[linha + x]]++;
        total++;
      }
    }
  }
  if (!total) return 128;

  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * hist[i];

  let somaEscura = 0;
  let pesoEscuro = 0;
  let melhor = 128;
  let maiorVariancia = -1;
  for (let i = 0; i < 256; i++) {
    pesoEscuro += hist[i];
    if (!pesoEscuro) continue;
    const pesoClaro = total - pesoEscuro;
    if (!pesoClaro) break;
    somaEscura += i * hist[i];
    const mediaEscura = somaEscura / pesoEscuro;
    const mediaClara = (soma - somaEscura) / pesoClaro;
    const entre = pesoEscuro * pesoClaro * (mediaEscura - mediaClara) ** 2;
    if (entre > maiorVariancia) {
      maiorVariancia = entre;
      melhor = i;
    }
  }
  return melhor;
}

/**
 * Espessura média do traço, em pixel.
 *
 * Varre linha a linha e mede cada sequência de pixel escuro: numa fatia
 * horizontal de letra, essa sequência é a largura da pincelada. A média de todas
 * elas é o peso da letra. Fatia vertical seria a mesma ideia — a horizontal
 * basta, e é uma passada só pela memória, na ordem em que ela está.
 */
function tracoMedio(cinza: Uint8Array, largura: number, c: Caixa, limiar: number): number {
  let escuros = 0;
  let pinceladas = 0;

  for (let y = c.topo; y < c.base; y++) {
    const linha = y * largura;
    let seguidos = 0;
    for (let x = c.esq; x < c.dir; x++) {
      if (cinza[linha + x] < limiar) {
        seguidos++;
      } else if (seguidos) {
        escuros += seguidos;
        pinceladas++;
        seguidos = 0;
      }
    }
    if (seguidos) {
      escuros += seguidos;
      pinceladas++;
    }
  }

  return pinceladas ? escuros / pinceladas : 0;
}
