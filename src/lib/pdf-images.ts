"use client";

import type { PDFPageProxy } from "pdfjs-dist";
import { pdfjs } from "@/lib/pdf";

/**
 * Recorta pedaços quaisquer da folha, já desenhada.
 *
 * Serve pra fórmula: a equação não é uma imagem dentro do PDF (é texto em fonte
 * de matemática), então não tem como achá-la entre as pinturas da página — o que
 * se tem é o retângulo onde ela está, e é dele que sai o recorte.
 *
 * Desenha a página **uma vez** e corta todas as caixas dela: uma renderização
 * por fórmula deixaria a página lenta num livro cheio de equação.
 */
export async function recortarCaixas(
  page: PDFPageProxy,
  caixas: { x: number; y: number; w: number; h: number }[],
  escala = 2,
): Promise<({ url: string; largura: number; altura: number } | null)[]> {
  if (!caixas.length) return [];

  const viewport = page.getViewport({ scale: escala });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return caixas.map(() => null);

  // Fundo branco: sem isso o recorte de uma página sem fundo sai preto.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  return Promise.all(
    caixas.map(async (c) => {
      // O eixo y do PDF cresce pra cima e o do canvas pra baixo: o topo da caixa
      // (y + h) é que vira a borda de cima do recorte.
      const sx = Math.max(0, Math.round(c.x * escala));
      const sy = Math.max(0, Math.round(canvas.height - (c.y + c.h) * escala));
      const sw = Math.min(canvas.width - sx, Math.round(c.w * escala));
      const sh = Math.min(canvas.height - sy, Math.round(c.h * escala));
      if (sw < 2 || sh < 2) return null;

      const recorte = document.createElement("canvas");
      recorte.width = sw;
      recorte.height = sh;
      const rctx = recorte.getContext("2d");
      if (!rctx) return null;
      rctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const blob = await new Promise<Blob | null>((resolve) =>
        recorte.toBlob(resolve, "image/png"),
      );
      if (!blob) return null;
      return { url: URL.createObjectURL(blob), largura: sw, altura: sh };
    }),
  );
}

/** Um recorte de imagem já pronto para exibir, com a posição no espaço da página (pt, escala 1). */
export type ImagemPagina = {
  url: string;
  /** Dimensões do recorte, em pixel. */
  largura: number;
  altura: number;
  /**
   * Retângulo no espaço da página (pt, escala 1) — só pra encaixar entre os parágrafos.
   * Convenção do PDF: y é a borda de baixo (eixo cresce pra cima), topo = y + h.
   */
  x: number;
  y: number;
  w: number;
  h: number;
};

// abaixo disso é filete, marcador de lista ou textura decorativa — não vira recorte
const LADO_MIN_PX = 28;
const AREA_MIN_PX = 1400;

const ESCALA_MAX = 2.5;
const LARGURA_ALVO_PX = 1500;

function aplicarTransform(m: number[], x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

type Caixa = { x: number; y: number; w: number; h: number; px: number; py: number; pw: number; ph: number };

/**
 * Recorta as imagens da página a partir do que foi renderizado, na posição exata.
 *
 * O pdf.js não expõe "a imagem e seu retângulo" pronto — a gente reconstrói a matriz de
 * transformação vigente em cada comando de pintura de imagem no operator list (acompanhando
 * save/restore/transform) e usa isso pra saber onde, na página renderizada, recortar.
 * Renderiza a página inteira uma vez (só quando há imagem) e tira o recorte dali — mais simples
 * e mais fiel que decodificar o XObject na mão (cor, máscara etc. já saem certos).
 */
export async function extrairImagens(page: PDFPageProxy): Promise<ImagemPagina[]> {
  const { OPS, Util } = pdfjs;
  const OPS_IMAGEM = new Set<number>([
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageMaskXObject,
  ]);

  const { fnArray, argsArray } = await page.getOperatorList();

  let ctm: number[] = [1, 0, 0, 1, 0, 0];
  const pilha: number[][] = [];
  const matrizes: number[][] = [];

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    if (fn === OPS.save) {
      pilha.push(ctm);
    } else if (fn === OPS.restore) {
      ctm = pilha.pop() ?? ctm;
    } else if (fn === OPS.transform) {
      ctm = Util.transform(ctm, argsArray[i] as number[]);
    } else if (OPS_IMAGEM.has(fn)) {
      matrizes.push(ctm);
    }
  }
  if (!matrizes.length) return [];

  const viewportBase = page.getViewport({ scale: 1 });
  const escala = Math.min(
    ESCALA_MAX,
    Math.max(1, LARGURA_ALVO_PX / viewportBase.width),
  );
  const viewport = page.getViewport({ scale: escala });

  const vistas = new Set<string>();
  const caixas: Caixa[] = [];
  for (const m of matrizes) {
    // a imagem ocupa o quadrado unitário [0,1]x[0,1] no espaço corrente, transformado pela ctm
    const cantos = [
      aplicarTransform(m, 0, 0),
      aplicarTransform(m, 1, 0),
      aplicarTransform(m, 0, 1),
      aplicarTransform(m, 1, 1),
    ];
    const xs = cantos.map((c) => c[0]);
    const ys = cantos.map((c) => c[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    const w = Math.max(...xs) - x;
    const h = Math.max(...ys) - y;

    const cantosPx = cantos.map(([px, py]) => viewport.convertToViewportPoint(px, py) as [number, number]);
    const xsPx = cantosPx.map((c) => c[0]);
    const ysPx = cantosPx.map((c) => c[1]);
    const px = Math.min(...xsPx);
    const py = Math.min(...ysPx);
    const pw = Math.max(...xsPx) - px;
    const ph = Math.max(...ysPx) - py;
    if (pw < LADO_MIN_PX || ph < LADO_MIN_PX || pw * ph < AREA_MIN_PX) continue;

    // várias pinturas caem quase no mesmo lugar (fundo + imagem, camadas repetidas) — fica só a primeira
    const chave = `${Math.round(px / 4)},${Math.round(py / 4)},${Math.round(pw / 4)},${Math.round(ph / 4)}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);

    caixas.push({ x, y, w, h, px, py, pw, ph });
  }
  if (!caixas.length) return [];

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;

  const imagens: ImagemPagina[] = [];
  for (const c of caixas) {
    const sx = Math.max(0, Math.round(c.px));
    const sy = Math.max(0, Math.round(c.py));
    const sw = Math.min(canvas.width - sx, Math.round(c.pw));
    const sh = Math.min(canvas.height - sy, Math.round(c.ph));
    if (sw < LADO_MIN_PX || sh < LADO_MIN_PX) continue;

    const recorte = document.createElement("canvas");
    recorte.width = sw;
    recorte.height = sh;
    const rctx = recorte.getContext("2d");
    if (!rctx) continue;
    rctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await new Promise<Blob | null>((resolve) =>
      recorte.toBlob(resolve, "image/jpeg", 0.85),
    );
    if (!blob) continue;

    imagens.push({
      url: URL.createObjectURL(blob),
      largura: sw,
      altura: sh,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
    });
  }

  return imagens;
}
