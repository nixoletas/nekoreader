/**
 * Remontagem do texto do PDF em blocos (título, parágrafo, citação).
 *
 * Módulo puro de propósito: só recebe números e strings, sem tocar em pdf.js,
 * canvas ou DOM. É o que permite rodar essa lógica fora do navegador pra
 * conferir o resultado contra um PDF de verdade.
 */

/** Um pedaço de conteúdo já remontado, pronto para virar <h2>, <p>, <blockquote> ou <img>. */
export type Bloco =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "citacao"; texto: string }
  | { tipo: "imagem"; url: string; largura: number; altura: number };

/** Bloco com a posição vertical (pt) que ele ocupava na página — só pra encaixar as imagens. */
export type BlocoPosicionado = { y: number; bloco: Bloco };

export type Item = {
  texto: string;
  x: number;
  y: number;
  w: number;
  alt: number;
  /** Fonte do trecho — id do pdf.js, só comparável dentro da mesma página. */
  fonte: string;
  /** Item que só carrega espaço — separa palavras, não conta como conteúdo. */
  espaco: boolean;
};

type Linha = {
  texto: string;
  x: number;
  dir: number;
  y: number;
  alt: number;
  /** Nenhum trecho da linha usa a fonte do corpo — é candidata a título. */
  soOutraFonte: boolean;
};

/** Como a linha vai ser tratada: título (com nível), citação ou texto corrido. */
type Classe =
  | { tipo: "titulo"; nivel: 1 | 2 | 3 }
  | { tipo: "paragrafo" }
  | { tipo: "citacao" };

/**
 * Itens de texto da página → blocos, uma lista por coluna.
 *
 * O PDF não guarda parágrafos — guarda pedaços de texto com coordenadas. Aqui a
 * gente agrupa por linha, junta as linhas em parágrafos e desfaz a hifenização.
 * Heurística: acerta livro corrido, erra tabela e fórmula.
 */
export function remontarColunas(itens: Item[], pw: number): BlocoPosicionado[][] {
  const cheios = itens.filter((i) => !i.espaco);
  if (!cheios.length) return [];

  // Fonte do corpo = a que escreve mais caractere na página. Título costuma ser
  // outra fonte (negrito), e é esse contraste que identifica ele — mais confiável
  // que só o tamanho, porque tem livro com título só um tiquinho maior que o corpo.
  const fonteCorpo = maisFrequente(cheios);
  const corpo =
    mediana(cheios.filter((i) => i.fonte === fonteCorpo).map((i) => i.alt)) ||
    mediana(cheios.map((i) => i.alt)) ||
    10;

  return separarColunas(itens, pw).map((col) => {
    const linhas = semCabecalho(agruparLinhas(col, corpo, fonteCorpo), corpo);
    return juntarParagrafos(linhas, corpo);
  });
}

/** Fonte que escreve mais caractere — o corpo do texto da página. */
function maisFrequente(itens: Item[]): string {
  const porFonte = new Map<string, number>();
  for (const i of itens) {
    porFonte.set(i.fonte, (porFonte.get(i.fonte) ?? 0) + i.texto.length);
  }
  let melhor = "";
  let max = -1;
  for (const [fonte, n] of porFonte) {
    if (n > max) {
      max = n;
      melhor = fonte;
    }
  }
  return melhor;
}

function mediana(ns: number[]): number {
  if (!ns.length) return 0;
  const ord = [...ns].sort((a, b) => a - b);
  return ord[Math.floor(ord.length / 2)];
}

/**
 * Duas avarias comuns de fonte incorporada no PDF, que sem isso viram quadradinho no
 * meio da palavra (a fonte do navegador não tem glifo pra elas):
 *
 * 1. NFKC já desfez ligadura Unicode de verdade (ﬁ, ﬂ, ﬀ...) — isso é feito antes de
 *    chamar esta função, em quem chama.
 * 2. Fonte sem `ToUnicode` pro glifo da ligadura "fi": o pdf.js devolve U+0000 (NUL)
 *    no lugar dela. "fi" é de longe a ligadura mais comum em texto corrido — bem mais
 *    que fl/ff — então é o chute mais seguro. Qualquer outro caractere de controle
 *    que sobrar tampouco tem glifo — melhor sumir do que virar quadrado.
 */
export function saneiaLigaduras(s: string): string {
  if (!/[\u0000-\u001f\u007f]/.test(s)) return s;
  return s
    .replace(/\u0000/g, "fi")
    .replace(/[\u0001-\u001f\u007f]/g, "");
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
function agruparLinhas(itens: Item[], corpo: number, fonteCorpo: string): Linha[] {
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
        soOutraFonte: cheios.length > 0 && cheios.every((i) => i.fonte !== fonteCorpo),
      };
    })
    .filter((l) => l.texto);
}

/**
 * Tira número de página e título corrido (a "mobília" da página).
 *
 * Só a primeira e a última linha entram na conta, e mesmo assim precisam de duas
 * coisas: parecer mobília (curta, só número, ou "38 | Capítulo 2") **e** estar
 * destacada do resto por um vão maior que o normal — no miolo do texto não existe
 * esse buraco. Antes isso era uma faixa fixa de 8% da altura da página, que falhava
 * em PDF com margem torta (tem livro cujo conteúdo começa colado no topo).
 */
function semCabecalho(linhas: Linha[], corpo: number): Linha[] {
  if (linhas.length < 4) return linhas;
  const largura = Math.max(...linhas.map((l) => l.dir - l.x), 1);
  const vaos: number[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const v = linhas[i - 1].y - linhas[i].y;
    if (v > 0) vaos.push(v);
  }
  const vaoTipico = mediana(vaos) || 1;

  const ehMobilia = (i: number) => {
    const l = linhas[i];
    // Mobília nunca é maior que o texto — isso protege o título curto que abre um
    // capítulo (ele é a primeira linha da página e seria descartado sem essa trava).
    if (l.alt > corpo) return false;
    const curta = l.dir - l.x < largura * 0.35;
    const soNumero = /^[\divxlcdm]+$/i.test(l.texto.replace(/[\s.\-—|]/g, ""));
    // "38 | Capítulo 2" ou "Capítulo 2 | 38"
    const numerada =
      /^\d{1,4}\s*[|·–—]/.test(l.texto) || /[|·–—]\s*\d{1,4}$/.test(l.texto);
    if (!curta && !soNumero && !numerada) return false;

    const vizinho = i === 0 ? linhas[1] : linhas[i - 1];
    return Math.abs(l.y - vizinho.y) > vaoTipico * 1.6;
  };

  const fora = new Set<number>();
  if (ehMobilia(0)) fora.add(0);
  if (ehMobilia(linhas.length - 1)) fora.add(linhas.length - 1);
  return linhas.filter((_, i) => !fora.has(i));
}

/**
 * O que cada linha é: título (e de que nível), citação recuada ou texto corrido.
 *
 * Título vem da fonte, não do tamanho: livro técnico costuma usar um negrito
 * pouco maior que o corpo (aqui, 13.65 contra 12.40 — só 10% a mais), então
 * exigir "bem maior" deixava passar direto. O nível sai da proporção.
 */
function classificar(l: Linha, corpo: number, esquerda: number): Classe {
  const proporcao = l.alt / corpo;

  if (l.soOutraFonte && proporcao >= 1.05) {
    const nivel = proporcao >= 1.7 ? 1 : proporcao >= 1.28 ? 2 : 3;
    return { tipo: "titulo", nivel };
  }

  // Epígrafe/citação: recuada e em corpo menor que o texto normal.
  if (proporcao <= 0.95 && l.x > esquerda + corpo * 0.8) {
    return { tipo: "citacao" };
  }

  return { tipo: "paragrafo" };
}

function mesmaClasse(a: Classe, b: Classe): boolean {
  if (a.tipo !== b.tipo) return false;
  return a.tipo === "titulo" && b.tipo === "titulo" ? a.nivel === b.nivel : true;
}

/** Linhas → blocos. Quebra por espaçamento, recuo, ponto final ou mudança de classe. */
function juntarParagrafos(linhas: Linha[], corpo: number): BlocoPosicionado[] {
  if (!linhas.length) return [];
  const esquerda = mediana(linhas.map((l) => l.x));
  const largura = mediana(linhas.map((l) => l.dir - l.x));
  const classes = linhas.map((l) => classificar(l, corpo, esquerda));

  const blocos: BlocoPosicionado[] = [];
  let atual: Linha[] = [];
  let classeAtual: Classe = { tipo: "paragrafo" };
  const fechar = () => {
    if (atual.length) {
      blocos.push({ y: atual[0].y, bloco: montar(atual, classeAtual) });
    }
    atual = [];
  };

  linhas.forEach((l, i) => {
    const ant = linhas[i - 1];
    if (ant) {
      const vao = ant.y - l.y;
      const salto = vao > Math.max(ant.alt, l.alt) * 1.7;
      // Recuo só indica parágrafo novo no texto corrido — citação é recuada inteira,
      // senão cada linha dela viraria um bloco.
      const recuo =
        classes[i].tipo === "paragrafo" && l.x > esquerda + corpo * 0.9;
      const encerrou =
        ant.dir - ant.x < largura * 0.82 && /[.!?:;"”')\]]$/.test(ant.texto);
      // Mudou de título pra texto (ou vice-versa) é sempre fim de bloco — é isso
      // que impede o título de ser engolido pelo parágrafo logo abaixo dele.
      const trocouClasse = !mesmaClasse(classes[i], classes[i - 1]);
      if (salto || recuo || encerrou || trocouClasse) fechar();
    }
    classeAtual = classes[i];
    atual.push(l);
  });
  fechar();

  return blocos;
}

/** Hífen no fim da linha: comum (-), tipográfico (‐ ‑) ou opcional (­). */
const HIFEN_FINAL = /[A-Za-zÀ-ÿ]([-‐‑­])$/;

function montar(linhas: Linha[], classe: Classe): Bloco {
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

  if (classe.tipo === "titulo") return { tipo: "titulo", nivel: classe.nivel, texto };
  if (classe.tipo === "citacao") return { tipo: "citacao", texto };
  return { tipo: "paragrafo", texto };
}
