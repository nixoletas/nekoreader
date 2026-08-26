"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { remontarPagina, type Bloco, type Item, type PaginaRemontada } from "@/lib/pdf-blocos";

/**
 * Leitura de página digitalizada — o livro escaneado, que não tem camada de texto.
 *
 * A ideia toda é **não** ter um caminho paralelo: o OCR devolve as mesmas
 * `Item` (texto com posição e tamanho) que o pdf.js devolveria, e daí pra frente
 * é a remontagem de sempre. Com isso o livro digitalizado ganha de graça tudo o
 * que o livro digital já tinha — parágrafo, coluna, título, tabela, nota, e o
 * número impresso no rodapé, que é o que põe a numeração no lugar.
 *
 * Custa caro (uns segundos por página), então nunca roda sozinho: quem pede é a
 * pessoa, e o resultado fica guardado.
 */

/** Largura em pixel pra desenhar a página antes de reconhecer. */
const LARGURA_OCR = 1800;

/** Abaixo disto o "texto" reconhecido é ruído de imagem, não palavra. */
const CONFIANCA_MINIMA = 45;

/**
 * Dicionário padrão, quando quem chama não diz qual quer.
 *
 * Inglês sozinho porque é o fallback do app inteiro e o idioma mais provável de
 * um livro técnico. A tela de leitura passa o do idioma em vigor (`IDIOMAS_OCR`
 * em `lib/i18n/config`), que é o palpite bom de verdade.
 */
const IDIOMAS_PADRAO = "eng";

type Trabalhador = {
  recognize: (
    imagem: HTMLCanvasElement,
    opcoes?: unknown,
    saida?: { blocks?: boolean },
  ) => Promise<{ data: { blocks: unknown } }>;
  terminate: () => Promise<unknown>;
};

/**
 * Um worker por conjunto de idiomas, vivo pelo tempo da aba.
 *
 * Ligar um custa baixar o núcleo WASM e o dicionário; refazer isso a cada página
 * tornaria o OCR inviável. A chave é o conjunto de idiomas porque trocar o
 * idioma do app troca o dicionário — e o worker antigo continua servindo, caso a
 * pessoa volte pro idioma de antes no meio do mesmo livro.
 *
 * O worker e o núcleo vêm de `/tesseract` (mesma origem); o dicionário vem de
 * fora na primeira vez e fica no IndexedDB do navegador.
 */
const trabalhadores = new Map<string, Promise<Trabalhador>>();

async function pegarTrabalhador(idiomas: string): Promise<Trabalhador> {
  const existente = trabalhadores.get(idiomas);
  if (existente) return existente;

  const novo = (async () => {
    const { createWorker } = await import("tesseract.js");
    return (await createWorker(idiomas, 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract",
    })) as unknown as Trabalhador;
  })();

  novo.catch(() => {
    trabalhadores.delete(idiomas); // deixa tentar de novo depois de uma falha de rede
  });
  trabalhadores.set(idiomas, novo);
  return novo;
}

/** Desliga o OCR e devolve a memória — o núcleo WASM não é pequeno. */
export async function encerrarOcr(): Promise<void> {
  const abertos = [...trabalhadores.values()];
  trabalhadores.clear();
  await Promise.all(
    abertos.map(async (t) => {
      try {
        await (await t).terminate();
      } catch {
        // já morreu junto com a aba
      }
    }),
  );
}

/**
 * Reconhece o texto de uma página digitalizada e devolve os blocos remontados.
 *
 * `aoProgredir` recebe a fração (0..1) do reconhecimento — é uma espera longa o
 * bastante pra precisar de barra.
 */
export async function blocosPorOcr(
  doc: PDFDocumentProxy,
  pageNumber: number,
  { sinal, idiomas }: OpcoesOcr = {},
): Promise<Bloco[]> {
  const { colunas } = await remontarPorOcr(doc, pageNumber, { sinal, idiomas });
  return colunas.flat().map((p) => p.bloco);
}

export type OpcoesOcr = {
  sinal?: AbortSignal;
  /** Dicionários do tesseract, no formato `"por+eng"`. Padrão: só inglês. */
  idiomas?: string;
};

/** O mesmo reconhecimento, devolvendo também o número impresso na página. */
export async function remontarPorOcr(
  doc: PDFDocumentProxy,
  pageNumber: number,
  { sinal, idiomas = IDIOMAS_PADRAO }: OpcoesOcr = {},
): Promise<PaginaRemontada> {
  const page = await doc.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const escala = LARGURA_OCR / base.width;
  const viewport = page.getViewport({ scale: escala });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) return { colunas: [], folio: null };

  // Fundo branco: página com transparência sai preta no canvas, e aí o OCR não
  // acha letra nenhuma.
  canvasContext.fillStyle = "#fff";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext, viewport }).promise;
  if (sinal?.aborted) throw new DOMException("cancelado", "AbortError");

  const motor = await pegarTrabalhador(idiomas);
  const { data } = await motor.recognize(canvas, undefined, { blocks: true });
  if (sinal?.aborted) throw new DOMException("cancelado", "AbortError");

  const itens = itensDoResultado(data.blocks, canvas.height, escala);
  return remontarPagina(itens, base.width);
}

/* --------------------------------------------------------------------- */

type CaixaOcr = { x0: number; y0: number; x1: number; y1: number };
type PalavraOcr = { text: string; confidence: number; bbox: CaixaOcr };
type LinhaOcr = {
  words: PalavraOcr[];
  bbox: CaixaOcr;
  rowAttributes?: { rowHeight?: number };
};
type BlocoOcr = { paragraphs: { lines: LinhaOcr[] }[] };

/**
 * O que o tesseract achou → os mesmos `Item` que o pdf.js entrega.
 *
 * Duas conversões importam aqui:
 *
 * 1. **O eixo vertical vira ao contrário.** O canvas conta de cima pra baixo, o
 *    PDF de baixo pra cima; a remontagem toda foi escrita pro jeito do PDF.
 * 2. **O tamanho da letra vale por linha, não por palavra.** A caixa de "moon" é
 *    baixinha e a de "Mighty" é alta, mas as duas são o mesmo corpo — usar a
 *    caixa da palavra faria a detecção de título disparar no meio do parágrafo.
 *
 * A "fonte" é inventada a partir do corpo da linha, arredondado. Não é enfeite:
 * é o que a classificação usa pra saber que uma linha destoa do texto ao redor —
 * sem isso, página digitalizada nunca teria título.
 */
function itensDoResultado(blocos: unknown, alturaCanvas: number, escala: number): Item[] {
  const itens: Item[] = [];

  for (const bloco of (blocos ?? []) as BlocoOcr[]) {
    for (const paragrafo of bloco.paragraphs ?? []) {
      for (const linha of paragrafo.lines ?? []) {
        const alt =
          ((linha.rowAttributes?.rowHeight ?? linha.bbox.y1 - linha.bbox.y0) || 10) / escala;
        const fonte = `ocr-${Math.round(alt)}`;
        // A base da linha, no eixo do PDF (que cresce pra cima).
        const y = (alturaCanvas - linha.bbox.y1) / escala;

        for (const palavra of linha.words ?? []) {
          const texto = palavra.text?.trim();
          if (!texto || palavra.confidence < CONFIANCA_MINIMA) continue;

          itens.push({
            texto,
            x: palavra.bbox.x0 / escala,
            y,
            w: (palavra.bbox.x1 - palavra.bbox.x0) / escala,
            alt,
            fonte,
            mono: false,
            italico: false,
            espaco: false,
          });
        }
      }
    }
  }

  return itens;
}
