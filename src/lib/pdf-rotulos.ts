import type { PDFDocumentProxy } from "pdfjs-dist";
import { remontarPagina } from "@/lib/pdf-blocos";
import { itensDaPagina } from "@/lib/pdf-itens";

/**
 * A numeração do livro, que quase nunca é a do arquivo.
 *
 * Um PDF de livro começa com capa, folha de rosto, créditos e sumário — dezenas
 * de páginas que o próprio livro numera em romano ou não numera. Quando o texto
 * enfim começa, o livro imprime "1" numa página que o arquivo chama de 17. Sem
 * isto, tudo que o leitor mostra (posição, marcação, sumário) fica deslocado em
 * relação ao livro de verdade, e citar uma página vira erro.
 */
export type Rotulos = {
  /** Rótulo de cada página física; índice 0 = página 1. `null` = página sem número impresso. */
  porPagina: (string | null)[];
  /** `pdf` = o arquivo declara os rótulos; `texto` = foram lidos do rodapé. */
  fonte: "pdf" | "texto";
  /** Página física em que o livro imprime "1". */
  inicioArabico: number | null;
};

/** Quantas páginas a varredura lê por vez — o mesmo lote do sumário. */
const LOTE = 8;

/**
 * Quantas páginas do começo entram inteiras na amostra.
 *
 * É onde a numeração vira arábica: nenhum livro tem 50 páginas de abertura, e
 * ler todas elas é o que permite achar a página física do "1" impresso em vez de
 * deduzir por interpolação.
 */
const ABERTURA = 48;

/** Quantas páginas do miolo são espiadas, espaçadas, só pra confirmar o deslocamento. */
const CONFERENCIA = 40;

/**
 * Quanto da amostra precisa ter sido lida pra varredura valer como resposta.
 *
 * Página que não abre (arquivo quebrado, rede caindo no meio do streaming) não
 * conta como "página sem número impresso": se metade da amostra falha, a dedução
 * enxerga um livro sem numeração que não existe — e essa resposta fica guardada.
 */
const COBERTURA_MINIMA = 0.6;

/**
 * O que uma varredura conclui.
 *
 * `sem-numeracao` e `incompleta` mostram a mesma coisa na tela (a página física),
 * mas são coisas diferentes na hora de guardar: a primeira é resposta final, a
 * segunda é uma tentativa que vale repetir.
 */
export type Varredura =
  | { fim: "achou"; rotulos: Rotulos }
  | { fim: "sem-numeracao" }
  | { fim: "incompleta" };

/**
 * Descobre a numeração impressa do livro.
 *
 * Dois caminhos, nesta ordem:
 *
 * 1. `/PageLabels`, que o PDF pode trazer pronto — é o caminho certo, e alguns
 *    geradores (LaTeX, InDesign) preenchem. Custa uma chamada.
 * 2. Ler o número do rodapé de uma amostra de páginas e deduzir o deslocamento.
 *    O que vale é a **repetição**: uma página solta pode ter qualquer número
 *    (nota, tabela, ano), mas "físico − impresso" dá sempre o mesmo valor no
 *    livro inteiro. Por isso o deslocamento sai da moda da amostra, e não da
 *    primeira página numerada que aparecer.
 *
 * Diz `sem-numeracao` quando o livro não tem numeração própria (ou ela não foi
 * reconhecida) — aí a página física é a única verdade que existe, e o leitor
 * segue mostrando ela. Diz `incompleta` quando desistiu no meio (cancelada, ou
 * amostra que não deu pra ler): parece o mesmo na tela, mas não é resposta.
 */
export async function montarRotulos(
  doc: PDFDocumentProxy,
  { sinal, aoProgredir }: { sinal?: AbortSignal; aoProgredir?: (fracao: number) => void } = {},
): Promise<Varredura> {
  const declarados = await rotulosDeclarados(doc);
  if (declarados) return { fim: "achou", rotulos: declarados };

  const paginas = amostra(doc.numPages);
  const achados: { fisica: number; folio: string }[] = [];
  let lidas = 0;

  for (let i = 0; i < paginas.length; i += LOTE) {
    if (sinal?.aborted) return { fim: "incompleta" };
    const lote = paginas.slice(i, i + LOTE);
    const folios = await Promise.all(lote.map((p) => folioDaPagina(doc, p)));
    lote.forEach((fisica, j) => {
      const lido = folios[j];
      if (!lido.lida) return;
      lidas++;
      if (lido.folio) achados.push({ fisica, folio: lido.folio });
    });
    aoProgredir?.(Math.min(1, (i + LOTE) / paginas.length));
  }

  if (lidas < paginas.length * COBERTURA_MINIMA) return { fim: "incompleta" };

  const rotulos = deduzir(achados, doc.numPages);
  return rotulos ? { fim: "achou", rotulos } : { fim: "sem-numeracao" };
}

/** Os rótulos que o próprio arquivo declara — só valem se disserem algo novo. */
async function rotulosDeclarados(doc: PDFDocumentProxy): Promise<Rotulos | null> {
  let rotulos: string[] | null = null;
  try {
    rotulos = await doc.getPageLabels();
  } catch {
    return null;
  }
  if (!rotulos || rotulos.length !== doc.numPages) return null;
  // "1, 2, 3..." é o que o leitor já mostra sozinho — não é numeração própria.
  if (rotulos.every((r, i) => r === String(i + 1))) return null;

  const porPagina = rotulos.map((r) => r.trim() || null);
  return { porPagina, fonte: "pdf", inicioArabico: porPagina.indexOf("1") + 1 || null };
}

/** Quais páginas a varredura lê: a abertura inteira, mais uma espiada no miolo. */
function amostra(total: number): number[] {
  const paginas = new Set<number>();
  for (let p = 1; p <= Math.min(total, ABERTURA); p++) paginas.add(p);

  const sobra = total - ABERTURA;
  if (sobra > 0) {
    const passo = Math.max(1, Math.floor(sobra / CONFERENCIA));
    for (let p = ABERTURA + 1; p <= total; p += passo) paginas.add(p);
    paginas.add(total);
  }

  return [...paginas].sort((a, b) => a - b);
}

/**
 * O número impresso desta página — e, antes disso, se a página deu pra ler.
 *
 * A distinção é o que separa "página sem folio" (normal: abertura, página de
 * parte) de "página que não abriu", que não pode contar como evidência de nada.
 */
async function folioDaPagina(
  doc: PDFDocumentProxy,
  pagina: number,
): Promise<{ lida: boolean; folio: string | null }> {
  const lido = await itensDaPagina(doc, pagina);
  if (!lido) return { lida: false, folio: null };
  return { lida: true, folio: remontarPagina(lido.itens, lido.pw).folio };
}

/**
 * Amostra de folios → numeração do livro inteiro.
 *
 * O miolo manda: é dele que sai o deslocamento arábico, porque é onde a
 * numeração é contínua e onde a pessoa vai passar a leitura toda. A abertura em
 * romano é resolvida depois, com o mesmo método, e só vale até onde o arábico
 * começa.
 */
function deduzir(
  achados: { fisica: number; folio: string }[],
  total: number,
): Rotulos | null {
  const arabicos = achados.filter((a) => /^\d{1,4}$/.test(a.folio));
  const deslocamento = moda(arabicos.map((a) => a.fisica - Number(a.folio)));
  // Metade da amostra tem que concordar: sem isso, um livro em que a detecção
  // pega números soltos (tabela, nota de rodapé) inventaria uma numeração torta,
  // que é bem pior que não ter numeração nenhuma.
  if (
    !deslocamento ||
    deslocamento.contagem < 3 ||
    deslocamento.contagem < arabicos.length * 0.5
  ) {
    return null;
  }

  // Onde o livro imprime "1". Pode cair antes da primeira página quando o PDF é
  // um recorte que já começa no miolo (artigo tirado de uma revista) — aí a
  // numeração arábica vale desde a primeira página do arquivo.
  const inicioArabico = Math.max(1, 1 + deslocamento.valor);

  const romanos = achados
    .filter((a) => a.fisica < inicioArabico)
    .map((a) => ({ fisica: a.fisica, valor: deRomano(a.folio) }))
    .filter((a): a is { fisica: number; valor: number } => a.valor !== null);
  const deslocamentoRomano = moda(romanos.map((r) => r.fisica - r.valor));

  const porPagina: (string | null)[] = [];
  for (let fisica = 1; fisica <= total; fisica++) {
    if (fisica >= inicioArabico) {
      porPagina.push(String(fisica - deslocamento.valor));
      continue;
    }
    const n = deslocamentoRomano ? fisica - deslocamentoRomano.valor : 0;
    porPagina.push(n >= 1 ? paraRomano(n) : null);
  }

  return { porPagina, fonte: "texto", inicioArabico };
}

/** O valor que mais se repete — e quantas vezes. */
function moda(ns: number[]): { valor: number; contagem: number } | null {
  if (!ns.length) return null;
  const conta = new Map<number, number>();
  for (const n of ns) conta.set(n, (conta.get(n) ?? 0) + 1);

  let melhor: { valor: number; contagem: number } | null = null;
  for (const [valor, contagem] of conta) {
    if (!melhor || contagem > melhor.contagem) melhor = { valor, contagem };
  }
  return melhor;
}

/** Rótulo impresso nesta página física, ou `null` quando ela não tem. */
export function rotuloDaPagina(rotulos: Rotulos | null, fisica: number): string | null {
  return rotulos?.porPagina[fisica - 1] ?? null;
}

/**
 * O caminho de volta: "87" (como impresso) → página física do arquivo.
 *
 * Aceita romano e arábico, e é o que faz o campo "ir para a página" falar a
 * mesma língua do livro. Devolve `null` quando o número não existe no livro —
 * quem chama decide se trata o que foi digitado como página física.
 */
export function paginaDoRotulo(rotulos: Rotulos | null, texto: string): number | null {
  if (!rotulos) return null;
  const alvo = texto.trim().toLowerCase();
  if (!alvo) return null;

  const i = rotulos.porPagina.findIndex((r) => r !== null && r.toLowerCase() === alvo);
  return i === -1 ? null : i + 1;
}

/** O livro numera diferente do arquivo? É o que decide mostrar as duas contas na tela. */
export function numeracaoPropria(rotulos: Rotulos | null): boolean {
  return !!rotulos?.porPagina.some((r, i) => r !== null && r !== String(i + 1));
}

const ROMANOS: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

function paraRomano(n: number): string {
  let resto = n;
  let saida = "";
  for (const [valor, letra] of ROMANOS) {
    while (resto >= valor) {
      saida += letra;
      resto -= valor;
    }
  }
  return saida;
}

/** "xix" → 19. `null` quando não é romano bem formado (inclusive quando é arábico). */
function deRomano(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!/^[ivxlcdm]+$/.test(t)) return null;

  const valores: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    const atual = valores[t[i]];
    const proximo = valores[t[i + 1]] ?? 0;
    total += atual < proximo ? -atual : atual;
  }

  // Ida e volta: garante forma canônica ("iiii" e "ivi" não são numeral).
  return paraRomano(total) === t ? total : null;
}
