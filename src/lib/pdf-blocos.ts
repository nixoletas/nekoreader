/**
 * Remontagem do texto do PDF em blocos (título, parágrafo, citação).
 *
 * Módulo puro de propósito: só recebe números e strings, sem tocar em pdf.js,
 * canvas ou DOM. É o que permite rodar essa lógica fora do navegador pra
 * conferir o resultado contra um PDF de verdade.
 */

/** Trecho do texto do bloco, em índice de caractere. */
export type Faixa = { start: number; end: number };

/** Trecho que é um endereço clicável. */
export type Elo = Faixa & { href: string };

/** Um pedaço de conteúdo já remontado, pronto para virar <h2>, <p>, <pre>, <table> ou <img>. */
export type Bloco =
  | { tipo: "titulo"; nivel: 1 | 2 | 3; texto: string }
  | { tipo: "paragrafo"; texto: string; negrito: Faixa[]; italico: Faixa[]; links: Elo[] }
  | { tipo: "citacao"; texto: string; negrito: Faixa[]; italico: Faixa[]; links: Elo[] }
  /** Nota de rodapé: mesmo texto corrido, só que em corpo menor e no pé da página. */
  | { tipo: "nota"; texto: string; negrito: Faixa[]; italico: Faixa[]; links: Elo[] }
  | { tipo: "codigo"; texto: string }
  | { tipo: "tabela"; linhas: string[][] }
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
  /** Fonte monoespaçada — é o que denuncia bloco de código. */
  mono: boolean;
  /** Fonte itálica (o nome dela termina em -It, Italic, Oblique...). */
  italico: boolean;
  /** Item que só carrega espaço — separa palavras, não conta como conteúdo. */
  espaco: boolean;
};

/** Um pedaço de linha separado do vizinho por um vão grande — vira célula de tabela. */
type Celula = { texto: string; x: number; dir: number };

type Linha = {
  texto: string;
  x: number;
  dir: number;
  y: number;
  alt: number;
  /** Nenhum trecho da linha usa a fonte do corpo — é candidata a título. */
  soOutraFonte: boolean;
  /** Toda a linha é monoespaçada — código. (Trecho solto de `código` no meio da frase não conta.) */
  soMono: boolean;
  /** Recuo em espaços, pra preservar o aninhamento do código. */
  recuo: number;
  /** Pedaços separados por vão largo — 2 ou mais sugerem linha de tabela. */
  celulas: Celula[];
  /** Trechos em destaque dentro da linha (índice de caractere no texto dela). */
  negrito: Faixa[];
  /** Trechos em itálico, na mesma contagem de caracteres. */
  italico: Faixa[];
};

/** Como a linha vai ser tratada. */
type Classe =
  | { tipo: "titulo"; nivel: 1 | 2 | 3 }
  | { tipo: "paragrafo" }
  | { tipo: "citacao" }
  | { tipo: "nota" }
  | { tipo: "codigo" }
  | { tipo: "tabela" };

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

/**
 * Corta a linha onde há vão horizontal grande — o "corredor" entre colunas.
 *
 * O corte é deliberadamente baixo (pouco mais de 1em): numa tabela real medida
 * aqui, o corredor entre a 1ª e a 2ª coluna tinha só 18pt contra 11.5pt de corpo,
 * e um limite mais alto perdia a coluna. Cortar demais não faz estrago porque
 * `marcarTabelas` só aceita tabela com várias linhas seguidas alinhadas.
 */
function separarCelulas(cheios: Item[], alt: number): Celula[] {
  const emOrdem = [...cheios].sort((a, b) => a.x - b.x);
  const corte = Math.max(alt * 1.15, 6);

  const celulas: Celula[] = [];
  let atual: Celula | null = null;
  let fim = -Infinity;

  for (const it of emOrdem) {
    if (!atual || it.x - fim > corte) {
      atual = { texto: it.texto, x: it.x, dir: it.x + it.w };
      celulas.push(atual);
    } else {
      const colado = it.x - fim < alt * 0.15;
      atual.texto += (colado ? "" : " ") + it.texto;
      atual.dir = it.x + it.w;
    }
    fim = it.x + it.w;
  }

  return celulas.map((c) => ({ ...c, texto: c.texto.replace(/\s+/g, " ").trim() }));
}

/** Itens na mesma altura (mesma baseline) viram uma linha de texto. */
function agruparLinhas(itens: Item[], corpo: number, fonteCorpo: string): Linha[] {
  const ordenados = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
  // Borda esquerda da coluna — referência pra medir o recuo do código.
  const margem = Math.min(...itens.filter((i) => !i.espaco).map((i) => i.x));

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
      const negrito: Faixa[] = [];
      const italico: Faixa[] = [];

      // Trecho vizinho do mesmo tipo é emendado no anterior em vez de virar faixa
      // nova — senão "Data Governance: The Definitive Guide" viraria quatro <em>,
      // um por item do pdf.js. Emenda também por cima do espaço entre palavras.
      const marcar = (faixas: Faixa[], inicio: number, fim: number) => {
        const ultimo = faixas[faixas.length - 1];
        const colado =
          ultimo && ultimo.end <= inicio && !texto.slice(ultimo.end, inicio).trim();
        if (colado) ultimo.end = fim;
        else faixas.push({ start: inicio, end: fim });
      };

      for (const it of emOrdem) {
        const separado =
          anterior && it.x - (anterior.x + anterior.w) > it.alt * 0.15;
        if ((it.espaco || separado) && texto && !/\s$/.test(texto)) texto += " ";
        anterior = it;
        if (it.espaco) continue;

        // Normaliza aqui, item a item, em vez de no fim: o índice do trecho em
        // destaque precisa valer no texto final, e um replace depois deslocaria tudo.
        const pedaco = it.texto.replace(/\s+/g, " ");
        const inicio = texto.length;
        texto += pedaco;
        // Negrito = outra fonte e maior que o corpo. O mesmo sinal do título, o que
        // é coerente: é literalmente a fonte de título usada no meio da linha
        // ("**Metadata.** Metadata is...").
        if (it.fonte !== fonteCorpo && it.alt >= corpo * 1.05) {
          marcar(negrito, inicio, texto.length);
        }
        // Itálico vem do nome da fonte, não do tamanho: no corpo do texto ele usa
        // outra fonte com a mesma altura, então nenhuma medida geométrica o pega.
        if (it.italico) marcar(italico, inicio, texto.length);
      }
      while (/\s$/.test(texto)) texto = texto.slice(0, -1);

      const cheios = g.filter((i) => !i.espaco);
      const esq = Math.min(...cheios.map((i) => i.x));
      const altLinha = mediana(cheios.map((i) => i.alt));
      return {
        texto,
        negrito,
        italico,
        x: esq,
        dir: Math.max(...cheios.map((i) => i.x + i.w)),
        y: g[0].y,
        alt: altLinha,
        soOutraFonte: cheios.length > 0 && cheios.every((i) => i.fonte !== fonteCorpo),
        soMono: cheios.length > 0 && cheios.every((i) => i.mono),
        // Courier tem largura fixa ~0.6em; serve pra converter recuo em nº de espaços.
        recuo: Math.round((esq - margem) / Math.max(altLinha * 0.6, 1)),
        celulas: separarCelulas(cheios, altLinha),
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
  const esquerda = mediana(linhas.map((l) => l.x));
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
    // Título corrido com o número da página numa ponta, sem separador no meio:
    // "SEC. 1.1  USES OF COMPUTER NETWORKS  9" ou "Evite Informações Erradas  19".
    // O número precisa estar destacado do resto (é a outra ponta da linha), senão
    // pegaria frase que só termina em número.
    const folga = l.alt * 3;
    const comFolio =
      l.celulas.length >= 2 &&
      ((/^\d{1,4}$/.test(l.celulas[l.celulas.length - 1].texto) &&
        l.celulas[l.celulas.length - 1].x - l.celulas[l.celulas.length - 2].dir > folga) ||
        (/^\d{1,4}$/.test(l.celulas[0].texto) &&
          l.celulas[1].x - l.celulas[0].dir > folga));
    // Carimbo de gráfica ("...Emendas Finais.indd 19 04/07/2011 16:02:23") fica fora
    // da caixa de texto, à esquerda de onde qualquer conteúdo real começa.
    const foraDaColuna = l.x < esquerda - corpo;
    if (!curta && !soNumero && !numerada && !comFolio && !foraDaColuna) return false;

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

  // Linha inteira em fonte monoespaçada é código. Trecho solto de `código` no meio
  // da frase não conta — ali a linha é mista, e vira parágrafo normal.
  if (l.soMono) return { tipo: "codigo" };

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

/**
 * Marca como tabela as sequências de linhas partidas em colunas.
 *
 * Uma linha só com vão largo não diz nada (pode ser texto justificado ou um
 * cabeçalho de página); o que denuncia tabela é a **repetição**: várias linhas
 * seguidas quebrando no mesmo lugar. Por isso exige 2+ linhas vizinhas com o
 * mesmo número de células e os inícios de coluna quase alinhados.
 */
function marcarTabelas(linhas: Linha[], classes: Classe[], corpo: number): void {
  // Tabela costuma vir em corpo menor e recuada — o que a faria cair na regra de
  // citação antes de chegar aqui. Por isso as duas classes entram na peneira; só
  // título e código ficam de fora.
  const colunavel = (i: number) =>
    (classes[i].tipo === "paragrafo" || classes[i].tipo === "citacao") &&
    linhas[i].celulas.length >= 2;

  const alinhadas = (a: Linha, b: Linha) => {
    if (a.celulas.length !== b.celulas.length) return false;
    const folga = corpo * 1.5;
    return a.celulas.every((c, k) => Math.abs(c.x - b.celulas[k].x) <= folga);
  };

  // 3 linhas seguidas alinhadas: é o que separa tabela de coincidência em texto
  // justificado, já que o corte de célula é generoso de propósito.
  const MINIMO = 3;

  let i = 0;
  while (i < linhas.length) {
    if (!colunavel(i)) {
      i++;
      continue;
    }
    let fim = i;
    while (
      fim + 1 < linhas.length &&
      colunavel(fim + 1) &&
      alinhadas(linhas[fim], linhas[fim + 1])
    ) {
      fim++;
    }

    if (fim - i + 1 >= MINIMO) {
      let ini = i;
      // Cabeçalho costuma vir centralizado, então não alinha com o corpo da tabela;
      // entra pelo número de colunas.
      if (ini > 0 && colunavel(ini - 1) && linhas[ini - 1].celulas.length === linhas[ini].celulas.length) {
        ini--;
      }
      if (
        fim + 1 < linhas.length &&
        colunavel(fim + 1) &&
        linhas[fim + 1].celulas.length === linhas[fim].celulas.length
      ) {
        fim++;
      }
      for (let k = ini; k <= fim; k++) classes[k] = { tipo: "tabela" };
    }
    i = fim + 1;
  }
}

/**
 * Marca as notas de rodapé no pé da coluna.
 *
 * O sinal é a combinação de três coisas, que juntas não acontecem no meio do
 * texto: corpo visivelmente menor que o do texto (aqui, 8.3 contra 12.4), estar
 * na última leva de linhas da página, e um vão de separação bem maior que o
 * entrelinhas normal — o branco que o miolo da página deixa acima da nota.
 *
 * Sozinho, "menor que o corpo" pegaria legenda de figura e linha de tabela; por
 * isso a varredura começa da última linha e para no primeiro tamanho normal.
 */
function marcarNotas(linhas: Linha[], classes: Classe[], corpo: number): void {
  if (linhas.length < 3) return;

  const miudo = (i: number) =>
    linhas[i].alt <= corpo * 0.9 &&
    (classes[i].tipo === "paragrafo" || classes[i].tipo === "citacao");

  // De baixo pra cima, enquanto for pequeno.
  let inicio = linhas.length;
  while (inicio > 0 && miudo(inicio - 1)) inicio--;
  if (inicio === linhas.length) return; // nada pequeno no pé

  // Nota é o rodapé da página, não a página inteira.
  if (linhas.length - inicio > linhas.length * 0.4) return;
  if (inicio === 0) return;

  const vaos: number[] = [];
  for (let i = 1; i < inicio; i++) {
    const v = linhas[i - 1].y - linhas[i].y;
    if (v > 0) vaos.push(v);
  }
  const vaoTipico = mediana(vaos) || linhas[0].alt;
  const separada = linhas[inicio - 1].y - linhas[inicio].y > vaoTipico * 1.35;
  // Marcador de chamada ("1 Evren Eryurek...", "* Ver adiante") confirma sem
  // depender do branco, que alguns livros apertam.
  const comMarcador = /^[\d*†‡§]/.test(linhas[inicio].texto);
  if (!separada && !comMarcador) return;

  for (let i = inicio; i < linhas.length; i++) classes[i] = { tipo: "nota" };
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
  marcarTabelas(linhas, classes, corpo);
  // Depois da tabela: uma tabela no pé da página é tabela, não nota.
  marcarNotas(linhas, classes, corpo);

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
      // Só vale pra texto corrido: em código quase toda linha acaba em ; ou },
      // e em tabela toda célula acaba "curta" — sem isso cada linha viraria um bloco.
      const encerrou =
        classes[i].tipo === "paragrafo" &&
        ant.dir - ant.x < largura * 0.82 &&
        /[.!?:;"”')\]]$/.test(ant.texto);
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
  // Código mantém a quebra de linha e o recuo — é o que dá sentido ao aninhamento.
  if (classe.tipo === "codigo") {
    const base = Math.min(...linhas.map((l) => l.recuo));
    const texto = linhas
      .map((l) => " ".repeat(Math.max(0, l.recuo - base)) + l.texto)
      .join("\n");
    return { tipo: "codigo", texto };
  }

  if (classe.tipo === "tabela") {
    return { tipo: "tabela", linhas: linhas.map((l) => l.celulas.map((c) => c.texto)) };
  }

  let texto = "";
  const negrito: Faixa[] = [];
  const italico: Faixa[] = [];
  for (const l of linhas) {
    if (!texto) {
      texto = l.texto;
    } else {
      const hifen = HIFEN_FINAL.exec(texto);
      if (hifen && /^[a-zà-ÿ]/.test(l.texto)) {
        // Hífen tipográfico é sempre quebra: "Lan‐ guages" → "Languages".
        // Com hífen comum, só junta sem apagar se a palavra já é composta
        // ("one-to-" + "many"), senão era hifenização: "conti-" + "nuação".
        const ultima = texto.slice(texto.lastIndexOf(" ") + 1);
        const composta = hifen[1] === "-" && ultima.split("-").length > 2;
        texto = composta ? texto + l.texto : texto.slice(0, -1) + l.texto;
      } else {
        texto += " " + l.texto;
      }
    }

    // Onde esta linha acabou caindo no texto do bloco — vale pros três jeitos de
    // juntar acima, inclusive o que apaga o hífen.
    const deslocamento = texto.length - l.texto.length;
    const transportar = (de: Faixa[], para: Faixa[]) => {
      for (const n of de) {
        const faixa = { start: n.start + deslocamento, end: n.end + deslocamento };
        const ultimo = para[para.length - 1];
        if (ultimo && ultimo.end >= faixa.start) ultimo.end = Math.max(ultimo.end, faixa.end);
        else para.push(faixa);
      }
    };
    transportar(l.negrito, negrito);
    transportar(l.italico, italico);
  }

  // Título já é destacado por inteiro; marcar de novo por dentro seria redundante.
  if (classe.tipo === "titulo") return { tipo: "titulo", nivel: classe.nivel, texto };

  // O PDF guarda o endereço como texto comum; quem transforma em link é a leitura
  // do próprio texto. (No EPUB o <a href> vem escrito, e é ele que vale.)
  const links = acharLinks(texto);
  if (classe.tipo === "citacao") return { tipo: "citacao", texto, negrito, italico, links };
  if (classe.tipo === "nota") return { tipo: "nota", texto, negrito, italico, links };
  return { tipo: "paragrafo", texto, negrito, italico, links };
}

/**
 * Endereços escritos no meio do texto — típico de nota de rodapé e bibliografia.
 *
 * `www.` e e-mail entram junto porque livro impresso escreve dos três jeitos.
 */
const PADRAO_LINK =
  /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+\.[a-z]{2,}[^\s<>"']*|[^\s<>"'@]+@[^\s<>"'@]+\.[a-z]{2,})/gi;

export function acharLinks(texto: string): Elo[] {
  const elos: Elo[] = [];

  for (const achado of texto.matchAll(PADRAO_LINK)) {
    const inicio = achado.index ?? 0;
    const bruto = achado[0];
    const cru = aparar(bruto);
    if (cru.length < 6) continue;

    const href = cru.includes("@") && !/^[a-z]+:/i.test(cru)
      ? `mailto:${cru}`
      : /^https?:\/\//i.test(cru)
        ? cru
        : `https://${cru}`;
    elos.push({ start: inicio, end: inicio + cru.length, href });
  }

  return elos;
}

/**
 * Tira a pontuação que encosta no fim do endereço.
 *
 * "https://oreil.ly/LFT4d." acaba a frase — o ponto é do texto, não da URL. Mas
 * parêntese e colchete só saem se não tiverem par aberto dentro do endereço, que
 * é comum em link de wiki.
 */
function aparar(bruto: string): string {
  let s = bruto;
  for (;;) {
    const ultimo = s[s.length - 1];
    if (!ultimo) break;
    if (".,;:!?'\"".includes(ultimo)) {
      s = s.slice(0, -1);
      continue;
    }
    if ((ultimo === ")" || ultimo === "]") && !temParAberto(s, ultimo)) {
      s = s.slice(0, -1);
      continue;
    }
    break;
  }
  return s;
}

function temParAberto(s: string, fecha: string): boolean {
  const abre = fecha === ")" ? "(" : "[";
  let saldo = 0;
  for (const c of s) {
    if (c === abre) saldo++;
    else if (c === fecha) saldo--;
  }
  return saldo >= 0;
}
