import type { PDFDocumentProxy } from "pdfjs-dist";
import { remontarColunas, type Item } from "@/lib/pdf-blocos";
import {
  achatar,
  ajustar,
  casarPaginas,
  sumarioDosTitulos,
  utilizavel,
  type ItemSumario,
  type Marcador,
  type TituloAchado,
} from "@/lib/sumario";

export type { ItemSumario } from "@/lib/sumario";

/** Quantas páginas a varredura lê por vez — o suficiente pra ocupar o worker sem travar a aba. */
const LOTE = 8;

/**
 * Monta o sumário do livro.
 *
 * Primeiro tenta o caminho barato: os marcadores do PDF, que já vêm prontos. Se
 * eles não souberem dizer em que página cada coisa começa — o caso do "Código
 * Limpo", em que nenhum dos 17 capítulos tem destino —, varre o texto atrás dos
 * títulos e usa a varredura pra preencher as páginas que faltam.
 *
 * `aoProgredir` recebe a fração já varrida (0..1) só durante a varredura; se der
 * pra resolver tudo pelos marcadores, ele nunca é chamado.
 */
export async function montarSumario(
  doc: PDFDocumentProxy,
  opcoes: { aoProgredir?: (fracao: number) => void; sinal?: AbortSignal } = {},
): Promise<ItemSumario[]> {
  const marcadores = await lerMarcadores(doc);
  const doOutline = ajustar(achatar(marcadores), doc.numPages);

  // Marcadores bons o bastante: varrer o livro inteiro pra achar as poucas
  // entradas que faltam não paga o preço da espera.
  const resolvidos = doOutline.filter((i) => i.pagina !== null).length;
  if (doOutline.length >= 5 && resolvidos >= doOutline.length * 0.9) return doOutline;
  if (doOutline.length && resolvidos === doOutline.length) return doOutline;

  const achados = await varrerTitulos(doc, opcoes);
  if (opcoes.sinal?.aborted) return doOutline;

  if (doOutline.length) {
    const cruzado = ajustar(casarPaginas(doOutline, achados), doc.numPages);
    // Só troca pelo sumário da varredura se o cruzamento não tiver ajudado em nada.
    if (utilizavel(cruzado)) return cruzado;
  }

  const varrido = ajustar(sumarioDosTitulos(achados), doc.numPages);
  return utilizavel(varrido) ? varrido : doOutline;
}

/** Marcadores do PDF, com cada destino já traduzido em número de página (quando dá). */
async function lerMarcadores(doc: PDFDocumentProxy): Promise<Marcador[]> {
  let bruto: Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>;
  try {
    bruto = await doc.getOutline();
  } catch {
    return [];
  }
  if (!bruto?.length) return [];

  // Um destino repetido é comum (capa, guarda) — resolver duas vezes é ida ao worker à toa.
  const cache = new Map<string, number | null>();

  async function converter(nos: typeof bruto): Promise<Marcador[]> {
    const saida: Marcador[] = [];
    for (const no of nos ?? []) {
      saida.push({
        titulo: String(no.title ?? ""),
        pagina: await paginaDoDestino(doc, no.dest, cache),
        filhos: await converter(no.items as typeof bruto),
      });
    }
    return saida;
  }

  return converter(bruto);
}

/**
 * Destino do marcador → número de página.
 *
 * Devolve `null` sem reclamar em todo caso torto: destino nomeado que não existe,
 * referência apontando pra fora do arquivo (comum em PDF recortado), destino
 * vazio. Quem chama trata `null` como "página desconhecida" e vai atrás do texto.
 */
async function paginaDoDestino(
  doc: PDFDocumentProxy,
  dest: unknown,
  cache: Map<string, number | null>,
): Promise<number | null> {
  if (!dest) return null;
  const chave = typeof dest === "string" ? dest : JSON.stringify(dest);
  const guardado = cache.get(chave);
  if (guardado !== undefined) return guardado;

  let pagina: number | null = null;
  try {
    const alvo = typeof dest === "string" ? await doc.getDestination(dest) : dest;
    const ref = Array.isArray(alvo) ? alvo[0] : null;
    if (ref && typeof ref === "object") {
      pagina = (await doc.getPageIndex(ref as Parameters<typeof doc.getPageIndex>[0])) + 1;
    } else if (typeof ref === "number") {
      pagina = ref + 1; // destino já em índice de página
    }
  } catch {
    pagina = null;
  }

  cache.set(chave, pagina);
  return pagina;
}

/**
 * Varre o livro atrás dos títulos, reaproveitando a mesma detecção do modo texto
 * (fonte diferente da do corpo + corpo maior). Lê só o texto, sem renderizar nada
 * nem recortar imagem, que é o que torna isso viável num livro de 500 páginas.
 */
export async function varrerTitulos(
  doc: PDFDocumentProxy,
  { aoProgredir, sinal }: { aoProgredir?: (fracao: number) => void; sinal?: AbortSignal } = {},
): Promise<TituloAchado[]> {
  const achados: TituloAchado[] = [];

  for (let inicio = 1; inicio <= doc.numPages; inicio += LOTE) {
    if (sinal?.aborted) return achados;
    const fim = Math.min(doc.numPages, inicio + LOTE - 1);
    const lote = await Promise.all(
      Array.from({ length: fim - inicio + 1 }, (_, i) => titulosDaPagina(doc, inicio + i)),
    );
    for (const titulos of lote) achados.push(...titulos);
    aoProgredir?.(fim / doc.numPages);
  }

  return achados;
}

async function titulosDaPagina(
  doc: PDFDocumentProxy,
  pageNumber: number,
): Promise<TituloAchado[]> {
  try {
    const page = await doc.getPage(pageNumber);
    const { width: pw } = page.getViewport({ scale: 1 });
    const conteudo = await page.getTextContent();

    const itens: Item[] = [];
    for (const it of conteudo.items) {
      if (!("str" in it) || !it.str) continue;
      const fonte = "fontName" in it ? String(it.fontName ?? "") : "";
      itens.push({
        texto: it.str,
        x: it.transform[4],
        y: it.transform[5],
        w: it.width,
        alt: Math.abs(it.transform[3]) || it.height || 10,
        fonte,
        mono: conteudo.styles?.[fonte]?.fontFamily === "monospace",
        // A varredura não resolve as fontes de verdade (custaria a lista de
        // operadores de cada página); título não depende de itálico.
        italico: false,
        espaco: !it.str.trim(),
      });
    }

    // A limpeza do texto (ligadura etc.) fica pro `limparTitulo` — aqui interessa
    // só saber quais linhas são título e em que página estão.
    return remontarColunas(itens, pw)
      .flat()
      .map((p) => p.bloco)
      .filter((b) => b.tipo === "titulo")
      .map((b) => ({ texto: b.texto, nivel: b.nivel, pagina: pageNumber }));
  } catch {
    return []; // página estranha não derruba a varredura inteira
  }
}
