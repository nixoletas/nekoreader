/**
 * Interpretação do sumário do livro.
 *
 * O PDF guarda o sumário em dois lugares, e nenhum dos dois é confiável sozinho:
 *
 * - **Os marcadores** (`getOutline`) trazem os títulos bonitos, já hierarquizados —
 *   mas o destino de cada um costuma vir quebrado, ou simplesmente não vir. O
 *   "Código Limpo", por exemplo, lista os 17 capítulos e nenhum deles sabe dizer
 *   em que página começa.
 * - **Os títulos do próprio texto** sabem a página exata, mas vêm sem hierarquia
 *   confiável e misturados com falso positivo (legenda de figura, cabeçalho...).
 *
 * A ideia aqui é cruzar os dois: o marcador dá o nome e o nível, a varredura do
 * texto dá a página. Módulo puro de propósito — recebe listas simples, sem tocar
 * em pdf.js — pra poder ser conferido contra um PDF de verdade fora do navegador.
 */

import { saneiaLigaduras } from "@/lib/pdf-blocos";

/** Uma linha do sumário. `pagina: null` = não deu pra descobrir onde começa. */
export type ItemSumario = {
  titulo: string;
  /** 1 = capítulo, 2 = seção, 3 = subseção. Mais fundo que isso é achatado em 3. */
  nivel: number;
  pagina: number | null;
};

/** Marcador cru do PDF, já com a página resolvida (ou não). */
export type Marcador = {
  titulo: string;
  pagina: number | null;
  filhos: Marcador[];
};

/** Um título encontrado varrendo o texto do livro. */
export type TituloAchado = { texto: string; nivel: number; pagina: number };

/**
 * Deixa o título apresentável: conserta ligadura quebrada, junta espaço repetido
 * e remove a "cauda" de sumário impresso ("Funções . . . . . 45"), que às vezes
 * vem colada no nome do marcador.
 */
export function limparTitulo(bruto: string): string {
  const limpo = saneiaLigaduras(bruto.normalize("NFKC"))
    // pontilhado de sumário impresso, com ou sem espaço entre os pontos
    .replace(/[.·•…\s]{4,}\d{1,4}\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  // sobrou só a numeração solta? não é título.
  return /^[\d.\-–—:]+$/.test(limpo) ? "" : limpo;
}

/**
 * Forma canônica pra comparar dois títulos: sem acento, sem pontuação e sem a
 * numeração da frente — "2. Nomes Significativos" e "Nomes Significativos"
 * precisam se encontrar.
 */
export function normalizar(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /^(cap[ií]tulo|chapter|parte|part|ap[êe]ndice|appendix|se[çc][ãa]o|section)\s+/u,
      "",
    )
    .replace(/^[\divxlc]+\s*[.):\-–—]?\s+/u, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Árvore de marcadores → lista plana, com o nível vindo da profundidade. */
export function achatar(marcadores: Marcador[], nivel = 1): ItemSumario[] {
  const saida: ItemSumario[] = [];
  for (const m of marcadores) {
    const titulo = limparTitulo(m.titulo);
    if (titulo) saida.push({ titulo, nivel: Math.min(3, nivel), pagina: m.pagina });
    saida.push(...achatar(m.filhos, nivel + 1));
  }
  return saida;
}

/** Título achado no texto, pronto pra comparação. */
type Alvo = { pagina: number; chave: string };

function alvosDe(achados: TituloAchado[]): Alvo[] {
  const alvos: Alvo[] = [];
  for (const a of achados) {
    const chave = normalizar(limparTitulo(a.texto));
    // Linha comprida demais é frase do corpo que passou por título, não capítulo.
    if (chave.length >= 3 && chave.length <= 120) alvos.push({ pagina: a.pagina, chave });
  }
  return alvos.sort((x, y) => x.pagina - y.pagina);
}

function combina(chaveItem: string, chaveAlvo: string): boolean {
  return (
    chaveAlvo === chaveItem ||
    chaveAlvo.startsWith(chaveItem) ||
    chaveItem.startsWith(chaveAlvo)
  );
}

/**
 * Preenche as páginas que faltam usando os títulos achados no texto.
 *
 * Casar na marra, do começo ao fim, não funciona: basta um "Introdução" do
 * sumário casar com o "Introdução" que abre o capítulo 2 pra que todo o resto
 * saia arrastado pra frente. Então vai em duas etapas:
 *
 * 1. **Âncoras** — título que aparece uma única vez no sumário *e* uma única vez
 *    no texto. Não tem com quem confundir, então vale mesmo fora de ordem; só
 *    descarta as que andariam pra trás.
 * 2. **O resto** — cada item ainda sem página procura entre as âncoras vizinhas.
 *    O trecho de busca é curto, e é isso que evita a repescagem errada.
 *
 * Nas duas etapas cada título do texto é usado no máximo uma vez. Sem isso, uma
 * seção que se repete a cada capítulo ("Segurança", "Conclusão", "Data
 * Management") acaba com todas as ocorrências apontando pra mesma página.
 */
export function casarPaginas(
  itens: ItemSumario[],
  achados: TituloAchado[],
): ItemSumario[] {
  const alvos = alvosDe(achados);
  if (!alvos.length) return itens;

  const vezesNoTexto = new Map<string, number>();
  for (const a of alvos) vezesNoTexto.set(a.chave, (vezesNoTexto.get(a.chave) ?? 0) + 1);

  const chaves = itens.map((i) => (i.pagina === null ? normalizar(i.titulo) : ""));
  const vezesNoSumario = new Map<string, number>();
  for (const c of chaves) if (c) vezesNoSumario.set(c, (vezesNoSumario.get(c) ?? 0) + 1);

  const usados = new Set<number>();

  // Título que o marcador já resolveu queima o achado correspondente: a seção
  // "Data Management" do capítulo 2 não pode servir de página pra "Data
  // Management" do capítulo 5 só porque o texto do capítulo 5 não está por perto.
  for (let i = 0; i < itens.length; i++) {
    const p = itens[i].pagina;
    if (p === null) continue;
    const chave = normalizar(itens[i].titulo);
    if (chave.length < 3) continue;
    const k = alvos.findIndex(
      (a, idx) => !usados.has(idx) && a.chave === chave && Math.abs(a.pagina - p) <= 1,
    );
    if (k >= 0) usados.add(k);
  }

  // ---- 1. âncoras ----
  const pagina: (number | null)[] = itens.map((i) => i.pagina);
  let ultimaAncora = 0;
  for (let i = 0; i < itens.length; i++) {
    if (pagina[i] !== null) {
      ultimaAncora = Math.max(ultimaAncora, pagina[i] as number);
      continue;
    }
    const chave = chaves[i];
    if (chave.length < 3 || vezesNoSumario.get(chave) !== 1) continue;
    if (vezesNoTexto.get(chave) !== 1) continue;

    const achado = alvos.findIndex((a, k) => !usados.has(k) && a.chave === chave);
    if (achado < 0 || alvos[achado].pagina < ultimaAncora) continue; // andaria pra trás
    pagina[i] = alvos[achado].pagina;
    usados.add(achado);
    ultimaAncora = alvos[achado].pagina;
  }

  // ---- 2. o resto, entre as âncoras ----
  for (let i = 0; i < itens.length; i++) {
    if (pagina[i] !== null) continue;
    const chave = chaves[i];
    if (chave.length < 3) continue;

    let piso = 0;
    for (let j = i - 1; j >= 0; j--) {
      if (pagina[j] !== null) {
        piso = pagina[j] as number;
        break;
      }
    }
    let teto = Infinity;
    for (let j = i + 1; j < itens.length; j++) {
      if (pagina[j] !== null) {
        teto = pagina[j] as number;
        break;
      }
    }

    const achado = alvos.findIndex(
      (a, k) =>
        !usados.has(k) && a.pagina >= piso && a.pagina <= teto && combina(chave, a.chave),
    );
    if (achado >= 0) {
      pagina[i] = alvos[achado].pagina;
      usados.add(achado);
    }
  }

  return itens.map((item, i) => (pagina[i] === item.pagina ? item : { ...item, pagina: pagina[i] }));
}

/**
 * Últimos ajustes antes de mostrar: joga fora repetição vizinha, descarta página
 * que anda pra trás (destino quebrado costuma apontar pro lugar errado) e apara
 * o que cair fora do livro.
 */
export function ajustar(itens: ItemSumario[], totalPaginas: number): ItemSumario[] {
  const saida: ItemSumario[] = [];
  let maior = 0;

  for (const item of itens) {
    const anterior = saida[saida.length - 1];
    if (
      anterior &&
      anterior.nivel === item.nivel &&
      normalizar(anterior.titulo) === normalizar(item.titulo)
    ) {
      // mesmo título repetido em sequência: fica o que sabe a página
      if (anterior.pagina === null && item.pagina !== null) {
        saida[saida.length - 1] = { ...item, nivel: anterior.nivel };
        maior = item.pagina;
      }
      continue;
    }

    let pagina = item.pagina;
    if (pagina !== null) {
      if (!Number.isFinite(pagina) || pagina < 1) pagina = null;
      else if (totalPaginas > 0 && pagina > totalPaginas) pagina = null;
      else if (pagina < maior) pagina = null; // volta pra trás = destino não confiável
    }
    if (pagina !== null) maior = pagina;

    saida.push({ titulo: item.titulo, nivel: Math.min(3, Math.max(1, item.nivel)), pagina });
  }

  return saida;
}

/**
 * Sumário tirado só da varredura, pra livro sem marcador nenhum (1984, PDF
 * digitalizado...). Fica mais grosseiro, mas ainda navega.
 */
export function sumarioDosTitulos(achados: TituloAchado[]): ItemSumario[] {
  const itens: ItemSumario[] = [];
  for (const a of achados) {
    const titulo = limparTitulo(a.texto);
    // Sem marcador pra conferir, o filtro tem que ser mais duro: título de
    // capítulo é curto e não termina no meio da frase.
    if (titulo.length < 3 || titulo.length > 80) continue;
    if (/[,;:]$|[-–—]$/.test(titulo)) continue;
    itens.push({ titulo, nivel: a.nivel, pagina: a.pagina });
  }
  return itens;
}

/** Vale a pena mostrar? Sumário de uma linha só, ou sem nenhuma página, não navega. */
export function utilizavel(itens: ItemSumario[]): boolean {
  return itens.length >= 2 && itens.some((i) => i.pagina !== null);
}
