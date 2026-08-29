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
  | { tipo: "paragrafo"; texto: string; negrito: Faixa[]; italico: Faixa[]; sobrescrito: Faixa[]; links: Elo[] }
  | { tipo: "citacao"; texto: string; negrito: Faixa[]; italico: Faixa[]; sobrescrito: Faixa[]; links: Elo[] }
  /** Nota de rodapé: mesmo texto corrido, só que em corpo menor e no pé da página. */
  | { tipo: "nota"; texto: string; negrito: Faixa[]; italico: Faixa[]; sobrescrito: Faixa[]; links: Elo[] }
  | { tipo: "codigo"; texto: string }
  /**
   * Equação destacada. O texto sai embaralhado do PDF (o arquivo guarda glifo
   * solto, não fórmula), então o que vale é o recorte da folha; `texto` fica
   * como descrição e como o que a busca enxerga.
   */
  | { tipo: "formula"; texto: string; caixa: Caixa; url?: string; largura?: number; altura?: number }
  | { tipo: "tabela"; linhas: string[][] }
  /** Página de sumário impressa no próprio livro ("Prefácio ....... xix"). */
  | { tipo: "sumario"; entradas: EntradaSumario[] }
  | { tipo: "imagem"; url: string; largura: number; altura: number };

/** Retângulo na página, em pontos do PDF (o eixo y cresce pra cima). */
export type Caixa = { x: number; y: number; w: number; h: number };

/** Uma linha da página de sumário: o título de um lado, a página do outro. */
export type EntradaSumario = {
  texto: string;
  /** Como está impresso — pode ser romano ("xix"). Vazio quando a linha não traz. */
  pagina: string;
  /** 1 = capítulo, 2 = seção, 3 = subseção. Vem do recuo da linha. */
  nivel: 1 | 2 | 3;
};

/** Bloco com a posição vertical (pt) que ele ocupava na página — só pra encaixar as imagens. */
export type BlocoPosicionado = { y: number; bloco: Bloco };

/**
 * O que saiu de uma página: o conteúdo em colunas e o número que o livro imprime
 * nela.
 *
 * O folio vem da mesma linha de mobília que a remontagem descarta — e é ele que
 * permite dizer "página 3 do livro" numa página física 17, que é como a pessoa
 * lê a referência do índice e da citação.
 */
export type PaginaRemontada = {
  colunas: BlocoPosicionado[][];
  /** Como está impresso: "38", "xix". `null` quando a página não traz número. */
  folio: string | null;
};

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
  /** Fonte de matemática (CMMI, CMSY, MathematicalPi, Symbol...) — sinal de fórmula. */
  matematica?: boolean;
  /**
   * Espessura do traço da letra dividida pela altura da linha — o negrito do
   * livro digitalizado, medido na folha desenhada (`pdf-tinta.ts`). Só vem
   * preenchido quando a página não tem contraste de fonte pra oferecer.
   */
  traco?: number;
  /** Item que só carrega espaço — separa palavras, não conta como conteúdo. */
  espaco: boolean;
};

/** Um pedaço de linha separado do vizinho por um vão grande — vira célula de tabela. */
type Celula = { texto: string; x: number; dir: number };

export type Linha = {
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
  /** Chamada de nota e expoente ("¹", "²"), na mesma contagem de caracteres. */
  sobrescrito: Faixa[];
  /** Quanto da linha foi escrito em fonte de matemática, de 0 a 1. */
  mate: number;
  /** Espessura do traço da linha; 0 quando não foi medida. */
  traco: number;
};

/** Como a linha vai ser tratada. */
type Classe =
  | { tipo: "titulo"; nivel: 1 | 2 | 3 }
  | { tipo: "paragrafo" }
  | { tipo: "citacao" }
  | { tipo: "nota" }
  | { tipo: "codigo" }
  | { tipo: "formula" }
  | { tipo: "tabela" }
  | { tipo: "sumario" };

/**
 * Itens de texto da página → blocos, uma lista por coluna.
 *
 * O PDF não guarda parágrafos — guarda pedaços de texto com coordenadas. Aqui a
 * gente agrupa por linha, junta as linhas em parágrafos e desfaz a hifenização.
 * Heurística: acerta livro corrido, erra tabela e fórmula.
 */
export function remontarColunas(itens: Item[], pw: number): BlocoPosicionado[][] {
  return remontarPagina(itens, pw).colunas;
}

/**
 * O mesmo que `remontarColunas`, mas devolve junto o número impresso na página.
 *
 * São a mesma passagem porque é ela que sabe qual linha é mobília: separar isso
 * em duas funções faria a detecção de cabeçalho rodar duas vezes por página.
 */
export function remontarPagina(itens: Item[], pw: number): PaginaRemontada {
  const cheios = itens.filter((i) => !i.espaco);
  if (!cheios.length) return { colunas: [], folio: null };

  // Fonte do corpo = a que escreve mais caractere na página. Título costuma ser
  // outra fonte (negrito), e é esse contraste que identifica ele — mais confiável
  // que só o tamanho, porque tem livro com título só um tiquinho maior que o corpo.
  const fonteCorpo = maisFrequente(cheios);
  const corpo =
    mediana(cheios.filter((i) => i.fonte === fonteCorpo).map((i) => i.alt)) ||
    mediana(cheios.map((i) => i.alt)) ||
    10;

  // Peso do traço do texto comum — a régua contra a qual o negrito se destaca.
  // Sai 0 quando ninguém mediu, e aí a classificação segue sem esse sinal.
  //
  // A mediana é pesada por caractere pelo mesmo motivo que a fonte do corpo é: na
  // página de solução, quase toda linha é uma linha de código, mas quase toda
  // *letra* está nos poucos parágrafos de texto. Contando linha por linha, a
  // régua viraria o traço fino do monoespaçado, e aí a prosa comum passaria por
  // negrito.
  const tracoCorpo = medianaPesada(
    cheios.filter((i) => (i.traco ?? 0) > 0),
    (i) => i.traco ?? 0,
    (i) => i.texto.trim().length,
  );

  // O folio é um por página, não por coluna: vale o primeiro que aparecer.
  let folio: string | null = null;
  const colunas = separarColunas(itens, pw).map((col) => {
    const limpo = semCabecalho(agruparLinhas(col, corpo, fonteCorpo), corpo);
    folio ??= limpo.folio;
    return juntarParagrafos(limpo.linhas, corpo, tracoCorpo);
  });

  return { colunas, folio };
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

/** Mediana em que cada valor conta pelo peso que carrega, não por uma unidade. */
function medianaPesada<T>(
  itens: T[],
  valor: (i: T) => number,
  peso: (i: T) => number,
): number {
  const ord = [...itens].sort((a, b) => valor(a) - valor(b));
  const total = ord.reduce((n, i) => n + peso(i), 0);
  if (!total) return 0;

  let acumulado = 0;
  for (const i of ord) {
    acumulado += peso(i);
    if (acumulado * 2 >= total) return valor(i);
  }
  return valor(ord[ord.length - 1]);
}

/** O valor abaixo do qual está a fração `q` da amostra. */
function percentil(ns: number[], q: number): number {
  if (!ns.length) return 0;
  const ord = [...ns].sort((a, b) => a - b);
  return ord[Math.min(ord.length - 1, Math.floor(ord.length * q))];
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
      const emOrdem = semRepetidos([...g].sort((a, b) => a.x - b.x));
      const cheios = g.filter((i) => !i.espaco);
      const altLinha = mediana(cheios.map((i) => i.alt));
      // Linha de base do corpo da linha — a régua contra a qual se mede quem está
      // levantado. Sai só dos trechos em tamanho normal: a chamada de nota é
      // justamente a exceção, e deixá-la entrar puxaria a régua pra cima dela.
      const base = mediana(
        cheios.filter((i) => i.alt >= altLinha * 0.9).map((i) => i.y),
      );
      let texto = "";
      let anterior: Item | null = null;
      const negrito: Faixa[] = [];
      const italico: Faixa[] = [];
      const sobrescrito: Faixa[] = [];

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
        // Chamada de nota ("...ETL tool.²") e expoente: letra menor **e** levantada
        // acima da linha de base. O PDF não escreve isso em Unicode sobrescrito —
        // é um "2" comum desenhado mais alto, e sem esta medida ele ia parar
        // grudado na palavra, como se fosse parte dela ("tool.2").
        if (it.alt <= altLinha * 0.85 && it.y >= base + altLinha * 0.2) {
          marcar(sobrescrito, inicio, texto.length);
        }
      }
      while (/\s$/.test(texto)) texto = texto.slice(0, -1);

      const esq = Math.min(...cheios.map((i) => i.x));
      const letras = cheios.reduce((n, i) => n + i.texto.trim().length, 0);
      const emMate = cheios
        .filter((i) => i.matematica)
        .reduce((n, i) => n + i.texto.trim().length, 0);
      // Mediana, não média: um "1." de marcador ou um respingo de sujeira do
      // escaneado tem traço próprio e puxaria a média da linha inteira.
      const traco = mediana(
        cheios.map((i) => i.traco ?? 0).filter((t) => t > 0),
      );

      return {
        texto,
        negrito,
        italico,
        sobrescrito,
        mate: letras ? emMate / letras : 0,
        traco,
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
 * Tira o marcador de lista que o PDF desenha duas vezes.
 *
 * Tem gerador que escreve o "•" (ou o "2.") uma vez como marcador e de novo
 * junto do texto, os dois na mesma posição — um por cima do outro, invisível na
 * página. Na remontagem os dois viram texto, e a cópia aparece grudada onde
 * calhou de estar na ordem do arquivo: "...such as2." no fim da linha.
 *
 * Dois itens na mesma altura e no mesmo x estão literalmente desenhados um sobre
 * o outro; se um é começo do outro, é repetição. Fica o mais completo.
 */
function semRepetidos(itens: Item[]): Item[] {
  const saida: Item[] = [];

  for (const it of itens) {
    if (it.espaco) {
      saida.push(it);
      continue;
    }
    const igual = saida.findIndex(
      (a) =>
        !a.espaco &&
        Math.abs(a.x - it.x) <= Math.max(a.alt, it.alt) * 0.15 &&
        (a.texto.startsWith(it.texto) || it.texto.startsWith(a.texto)),
    );
    if (igual < 0) saida.push(it);
    else if (it.texto.length > saida[igual].texto.length) saida[igual] = it;
  }

  return saida;
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
function semCabecalho(
  linhas: Linha[],
  corpo: number,
): { linhas: Linha[]; folio: string | null } {
  if (linhas.length < 4) return { linhas, folio: null };
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
    // Mobília nunca é *bem* maior que o texto — é isso que protege o título curto
    // que abre um capítulo (ele é a primeira linha da página e seria descartado
    // sem essa trava). Um tiquinho maior acontece e não quer dizer título: no
    // livro digitalizado a altura vem da linha que o OCR mediu, e o cabeçalho
    // corrido sai uns 20~40% acima do corpo sem ser outra coisa que cabeçalho.
    if (l.alt > corpo * 1.45) return false;
    // E, acima do corpo, só passa a linha escrita na fonte do texto: título de
    // verdade troca de fonte, e é isso que separa ele do cabeçalho corrido que o
    // OCR mediu um pouco mais alto que as linhas do miolo.
    if (l.alt > corpo && l.soOutraFonte) return false;
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
    // Título corrido sem número nenhum na ponta — ou com ele, mas sem a barra que
    // o OCR do livro digitalizado costuma comer ("4 Cracking the Coding Interview,
    // 6th Edition", "Chapter 1 | Arrays and Strings"). Não é frase: cabe em pouco
    // mais de meia linha, tem poucas palavras e não termina em pontuação de fim.
    const titulete =
      l.dir - l.x < largura * 0.6 &&
      palavras(l.texto) <= 8 &&
      !/[.!?;:]$/.test(l.texto.trim());

    const desenho = curta || soNumero || numerada || comFolio || foraDaColuna;
    if (!desenho && !titulete) return false;

    const vizinho = i === 0 ? linhas[1] : linhas[i - 1];
    const branco = Math.abs(l.y - vizinho.y);
    // O desenho de mobília (número, barra, fora da coluna) já é sinal forte.
    // Quando o que se tem é só um titulete, o branco em volta precisa ser bem
    // maior: é ele que separa a mobília de um parágrafo de uma linha só no pé
    // da página.
    const fator = desenho ? 1.6 : 2.2;
    return branco > vaoTipico * fator;
  };

  const fora = new Set<number>();
  if (ehMobilia(0)) fora.add(0);
  if (ehMobilia(linhas.length - 1)) fora.add(linhas.length - 1);

  // O rodapé é o lugar mais comum do número, então ele tem preferência sobre o
  // topo — onde o que costuma estar é o título corrido.
  let folio: string | null = null;
  if (fora.has(linhas.length - 1)) folio = folioDaLinha(linhas[linhas.length - 1]);
  if (!folio && fora.has(0)) folio = folioDaLinha(linhas[0]);

  return { linhas: linhas.filter((_, i) => !fora.has(i)), folio };
}

/** Romano de verdade — trava contra palavra que por acaso só usa essas letras ("civil", "did"). */
const ROMANO = /^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/;

/**
 * O número que a linha de mobília imprime — "38", "xix" — ou `null`.
 *
 * Três formas cobrem quase todo livro: o número sozinho, o número numa ponta do
 * título corrido ("38 | Capítulo 2", "SEC. 1.1 USES OF NETWORKS 9"), e nada.
 * Romano só em minúscula: "I" e "MIX" em versalete são palavra muito mais vezes
 * que numeral, e a abertura do livro (onde o romano vive) é sempre em minúscula.
 */
export function folioDaLinha(l: Linha): string | null {
  const texto = l.texto.trim();

  const sozinho = texto.replace(/[\s.\-—–|[\]()]/g, "");
  if (/^\d{1,4}$/.test(sozinho)) return sozinho;
  if (ROMANO.test(sozinho)) return sozinho;

  const naPonta = texto.match(/^(\d{1,4})\s*[|·–—]/) ?? texto.match(/[|·–—]\s*(\d{1,4})$/);
  if (naPonta) return naPonta[1];

  // Sem separador: o número é a célula da ponta, destacada do resto por um vão.
  const cs = l.celulas;
  if (cs.length >= 2) {
    const folga = l.alt * 3;
    const ultima = cs[cs.length - 1];
    if (/^\d{1,4}$/.test(ultima.texto) && ultima.x - cs[cs.length - 2].dir > folga) {
      return ultima.texto;
    }
    if (/^\d{1,4}$/.test(cs[0].texto) && cs[1].x - cs[0].dir > folga) return cs[0].texto;
  }

  // Nem separador nem vão: o número sozinho numa ponta do titulete. É o caso do
  // livro digitalizado, onde o OCR come a barra ("4 | Cracking..." vira "4
  // Cracking...") e junta o resto numa tira só de texto, sem célula pra medir.
  const naBorda = texto.match(/^(\d{1,4})\s+\D/) ?? texto.match(/\D\s+(\d{1,4})$/);
  if (naBorda) return naBorda[1];

  return null;
}

/** Quantas palavras a linha tem — pontuação e barra solta não contam. */
function palavras(texto: string): number {
  return (texto.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

/**
 * O que cada linha é: título (e de que nível), citação recuada ou texto corrido.
 *
 * Título vem da fonte, não do tamanho: livro técnico costuma usar um negrito
 * pouco maior que o corpo (aqui, 13.65 contra 12.40 — só 10% a mais), então
 * exigir "bem maior" deixava passar direto. O nível sai da proporção.
 */
function classificar(l: Linha, regua: Regua): Classe {
  const { corpo, esquerda, largura } = regua;
  const proporcao = l.alt / corpo;

  // Linha inteira em fonte monoespaçada é código. Trecho solto de `código` no meio
  // da frase não conta — ali a linha é mista, e vira parágrafo normal.
  if (l.soMono) return { tipo: "codigo" };

  // Antes do título: equação destacada costuma ser curta, centrada e sem texto —
  // que é exatamente o desenho de um título.
  if (pareceFormula(l, esquerda, largura)) return { tipo: "formula" };

  if (l.soOutraFonte && proporcao >= 1.05) {
    return { tipo: "titulo", nivel: nivelDoTitulo(proporcao) };
  }

  // Nenhum título encosta na margem direita: o que enche a linha até o fim é
  // texto. É esta trava que segura os dois sinais abaixo, que fora dela pegariam
  // parágrafo com entrada em negrito. A régua é a margem, não a largura típica
  // da linha — numa página de código a linha típica é curta, e medir por ela
  // faria todo título passar por "linha cheia".
  const naLinhaCheia = l.dir > regua.direita - corpo;

  const nivel = nivelDoTitulo(Math.max(proporcao, 1.05));
  // Título sem palavra nenhuma só existe grande e curto: é o algarismo que abre
  // o capítulo ("6", "IV"). Do tamanho do texto, o que parece isso é número de
  // linha de código e rótulo de diagrama; comprido, é a tripa de símbolos que
  // sobra de uma tabela escaneada. Nenhum dos dois é título de coisa alguma.
  const semPalavra = !/\p{L}{2}/u.test(l.texto);
  const podeSerTitulo =
    !naLinhaCheia && (!semPalavra || (nivel === 1 && l.texto.trim().length <= 4));

  // A seta que o livro usa pra abrir seção ("► Why?"). Vale como título porque
  // este caractere, nesta página, só aparece abrindo linha — nunca no meio de
  // uma frase. Veja `marcadoresDeSecao`.
  if (podeSerTitulo && regua.marcadores.has(l.texto.trim()[0])) {
    return { tipo: "titulo", nivel };
  }

  // Negrito medido na folha: o título do livro digitalizado, que não tem fonte
  // própria pra denunciar ele. Ver `pdf-tinta.ts`.
  if (podeSerTitulo && regua.traco > 0 && l.traco >= regua.traco * PESO_TITULO) {
    return { tipo: "titulo", nivel };
  }

  // Epígrafe/citação: recuada e em corpo menor que o texto normal.
  if (proporcao <= 0.95 && l.x > esquerda + corpo * 0.8) {
    return { tipo: "citacao" };
  }

  return { tipo: "paragrafo" };
}

/** As medidas da coluna que a classificação usa como régua. */
type Regua = {
  /** Altura da letra do texto comum. */
  corpo: number;
  /** Margem esquerda e direita da coluna, em pt. */
  esquerda: number;
  direita: number;
  /** Largura típica da linha — serve pra saber o que está centrado. */
  largura: number;
  /** Peso do traço do texto comum; 0 quando ninguém mediu. */
  traco: number;
  /** Setas que, nesta coluna, abrem seção. Veja `marcadoresDeSecao`. */
  marcadores: Set<string>;
};

/** Quanto o traço precisa engordar em relação ao corpo pra linha virar título. */
const PESO_TITULO = 1.25;

/** Setas que livro usa pra abrir seção. Bala de lista ("•") não entra: é item. */
const SETA = /[►▶➤▸❯→➔]/;

function nivelDoTitulo(proporcao: number): 1 | 2 | 3 {
  return proporcao >= 1.7 ? 1 : proporcao >= 1.28 ? 2 : 3;
}

/**
 * Que setas, nesta página, são marcador de seção.
 *
 * O livro escolhe um caractere e usa ele pra abrir toda seção — "► Why?",
 * "► StringBuilder". É estrutura de graça, e sobrevive ao escaneado: o OCR
 * reconhece o desenho da seta mesmo sem saber que fonte é aquela.
 *
 * O que separa marcador de enfeite é o lugar: marcador **só** abre linha. Uma
 * seta que aparece no meio de uma frase ("a → b") é texto, e aí aquele caractere
 * inteiro fica de fora — melhor perder o título que rachar um parágrafo no meio.
 */
function marcadoresDeSecao(linhas: Linha[]): Set<string> {
  const abrindo = new Set<string>();
  const nomeio = new Set<string>();

  for (const l of linhas) {
    const texto = l.texto.trim();
    if (!texto) continue;
    const primeiro = texto[0];
    if (SETA.test(primeiro)) abrindo.add(primeiro);
    for (const c of texto.slice(1)) if (SETA.test(c)) nomeio.add(c);
  }

  for (const c of nomeio) abrindo.delete(c);
  return abrindo;
}

/**
 * Esta linha é uma equação destacada?
 *
 * O PDF não guarda fórmula: guarda glifo solto, com a fonte de matemática e a
 * posição de cada pedaço. Remontar isso como texto produz aquele amontoado
 * ("f(x)=�xi 2n") que não quer dizer nada — melhor mostrar o recorte da folha.
 *
 * O teste é de propósito **conservador**, porque o erro caro é o contrário:
 * trocar um parágrafo de verdade por uma imagem. Dois caminhos, os dois exigindo
 * que a linha quase não tenha palavra:
 *
 * 1. A linha foi escrita em fonte de matemática (o sinal mais confiável que
 *    existe — o gerador do PDF trocou de fonte justamente porque ali é fórmula).
 * 2. Sem essa pista, exige o **desenho** da equação destacada: centrada na
 *    coluna, curta, e cheia de sinal de operação.
 */
function pareceFormula(l: Linha, esquerda: number, largura: number): boolean {
  const semEspaco = l.texto.replace(/\s/g, "");
  if (semEspaco.length < 2) return false;

  // Palavra de verdade — o que uma fórmula quase não tem. ("de", "e" e afins
  // aparecem em legenda de fórmula, então o corte é em 4 letras.)
  const palavras = (l.texto.match(/[A-Za-zÀ-ÿ]{4,}/g) ?? []).length;
  if (palavras > 2) return false;

  if (l.mate >= 0.5) return true;

  const sinais = (l.texto.match(/[=+±∓×÷≤≥≠≈∝∞∫∑∏√∂∇⋅^_<>|]/g) ?? []).length;
  const gregas = (l.texto.match(/[α-ωΑ-Ωµπ]/g) ?? []).length;
  const meio = esquerda + largura / 2;
  const centrada =
    Math.abs((l.x + l.dir) / 2 - meio) < largura * 0.12 && l.dir - l.x < largura * 0.9;

  return (
    centrada && palavras <= 1 && sinais >= 1 && (sinais + gregas) / semEspaco.length >= 0.2
  );
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
 * Uma linha da página de sumário impressa: "Prefácio ......... xix".
 *
 * O que denuncia é o **guia** — a corrida de pontos que leva o olho até o número
 * do outro lado da linha. Guia só de espaço também existe, mas aí a linha fica
 * parecida demais com texto justificado, então ali exige número arábico e um vão
 * bem largo. O número pode ser romano: as páginas de abertura do livro são.
 */
const ENTRADA_SUMARIO = /^(.*?[^\s.·•…_-])([.·•…_\-–—\s]{3,})([\divxlcdm]{1,7})$/i;

/** O número da página como o livro imprime: 30 ou xix. */
function ehNumeroDePagina(s: string): boolean {
  return /^\d{1,4}$/.test(s) || /^[ivxlcdm]{1,7}$/i.test(s);
}

/** Título com miolo de verdade — ". . . . 30" sozinho não é entrada de nada. */
function temTitulo(s: string): boolean {
  return s.replace(/[^0-9A-Za-zÀ-ÿ]/g, "").length >= 2;
}

export function entradaDeSumario(
  texto: string,
): { titulo: string; pagina: string; pontilhada: boolean } | null {
  const achado = ENTRADA_SUMARIO.exec(texto.trim());
  if (!achado) return null;
  const [, titulo, guia, pagina] = achado;

  const pontos = (guia.match(/[.·•…_\-–—]/g) ?? []).length;
  if (!ehNumeroDePagina(pagina) || !temTitulo(titulo)) return null;
  if (pontos < 2) return null;

  return { titulo: titulo.trim(), pagina, pontilhada: true };
}

/**
 * A mesma entrada, quando o guia é só espaço em branco.
 *
 * Aqui o texto da linha não denuncia nada — a remontagem já colapsou o vão num
 * espaço só. Quem sabe do buraco é a divisão em células, a mesma que acha coluna
 * de tabela. Por isso esta forma nunca vale sozinha: só entra em leva que já tem
 * pelo menos uma linha pontilhada (ver `marcarSumario`), senão qualquer tabela
 * de duas colunas com número à direita viraria sumário.
 */
function entradaPorCelulas(
  l: Linha,
): { titulo: string; pagina: string; pontilhada: boolean } | null {
  if (l.celulas.length !== 2) return null;
  const [titulo, pagina] = l.celulas;
  if (pagina.x - titulo.dir < l.alt * 1.5) return null;
  if (!ehNumeroDePagina(pagina.texto) || !temTitulo(titulo.texto)) return null;
  return {
    titulo: titulo.texto.replace(/[\s.·•…_-]+$/, "").trim(),
    pagina: pagina.texto,
    pontilhada: false,
  };
}

/** Entrada de sumário nesta linha, pelo pontilhado ou pelo vão. */
function entradaDaLinha(l: Linha) {
  return entradaDeSumario(l.texto) ?? entradaPorCelulas(l);
}

/**
 * Marca as linhas que formam a página de sumário impressa no livro.
 *
 * Uma linha solta que acaba em número não é sumário (é o fim de um parágrafo com
 * uma citação numérica); o que denuncia é a **sequência** — três ou mais linhas
 * seguidas com o mesmo desenho. Uma linha sem número no meio da leva é a
 * continuação de um título comprido, e entra junto.
 */
function marcarSumario(linhas: Linha[], classes: Classe[]): void {
  const MINIMO = 3;
  const entradas = linhas.map((l) => entradaDaLinha(l));
  const corrido = (i: number) =>
    classes[i].tipo === "paragrafo" || classes[i].tipo === "citacao";
  // A linha de capítulo do sumário vem na fonte de destaque do livro, então
  // `classificar` já chamou ela de título. Ela entra assim mesmo — o que a
  // qualifica é ter pontilhado e número, e o título de verdade da página
  // ("Sumário") não tem nenhum dos dois, então continua de fora.
  const entrada = (i: number) =>
    !!entradas[i] && (corrido(i) || classes[i].tipo === "titulo");

  let i = 0;
  while (i < linhas.length) {
    if (!entrada(i)) {
      i++;
      continue;
    }
    let fim = i;
    while (fim + 1 < linhas.length) {
      if (entrada(fim + 1)) {
        fim++;
        continue;
      }
      // Linha sem número só entra se for continuação de um título comprido: a
      // de baixo volta a ser entrada, e ela mesma é texto corrido.
      if (corrido(fim + 1) && fim + 2 < linhas.length && entrada(fim + 2)) {
        fim += 2;
        continue;
      }
      break;
    }

    // Pelo menos uma linha pontilhada na leva: é o que separa sumário de tabela
    // de duas colunas com número à direita.
    let pontilhada = false;
    for (let k = i; k <= fim; k++) if (entradas[k]?.pontilhada) pontilhada = true;


    if (fim - i + 1 >= MINIMO && pontilhada) {
      for (let k = i; k <= fim; k++) classes[k] = { tipo: "sumario" };
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

/**
 * Linha que só continua a de cima não muda de classe.
 *
 * O recuo pendurado do item de lista ("• Analytical skills:" na margem e o resto
 * do item recuado embaixo) tem exatamente o desenho de uma citação: recuado e,
 * num livro digitalizado, com a altura que o OCR mede variando alguns por cento
 * de uma linha pra outra — o bastante pra cair no corte de "corpo menor".
 *
 * O mesmo vale pro título achado pelo peso do traço: o fim curto de um parágrafo,
 * numa página em que o corpo do texto é código miúdo, sobe acima do corte de
 * negrito sem ser título nenhum.
 *
 * O que desmente os dois é a linha de cima: ela vai até a margem direita e o
 * branco até aqui é o de dentro do parágrafo. Frase que não acabou não começa
 * nem citação nem título.
 */
function corrigirContinuacoes(
  linhas: Linha[],
  classes: Classe[],
  corpo: number,
  esquerda: number,
): void {
  const direita = Math.max(...linhas.map((l) => l.dir));

  for (let i = 1; i < linhas.length; i++) {
    if (classes[i].tipo !== "citacao" && classes[i].tipo !== "titulo") continue;
    const ant = linhas[i - 1];
    const l = linhas[i];
    // De margem a margem: a linha que só encosta numa das duas não é frase
    // atravessando — é a remissão alinhada à direita ("pgl24"), e o que vem
    // depois dela começa mesmo bloco novo.
    const cheia = ant.x <= esquerda + corpo * 1.5 && ant.dir > direita - corpo * 2;
    const colada = ant.y - l.y <= Math.max(ant.alt, l.alt) * 1.5;
    if (cheia && colada) classes[i] = classes[i - 1];
  }
}

function mesmaClasse(a: Classe, b: Classe): boolean {
  if (a.tipo !== b.tipo) return false;
  return a.tipo === "titulo" && b.tipo === "titulo" ? a.nivel === b.nivel : true;
}

/** Linhas → blocos. Quebra por espaçamento, recuo, ponto final ou mudança de classe. */
function juntarParagrafos(
  linhas: Linha[],
  corpo: number,
  tracoCorpo = 0,
): BlocoPosicionado[] {
  if (!linhas.length) return [];
  const esquerda = mediana(linhas.map((l) => l.x));
  const largura = mediana(linhas.map((l) => l.dir - l.x));
  const regua: Regua = {
    corpo,
    esquerda,
    // Margem direita da coluna. Percentil, não máximo: uma tabela larga ou um
    // desenho que passe da caixa de texto puxaria o máximo pra fora, e aí
    // nenhuma linha de prosa contaria como cheia.
    direita: percentil(
      linhas.map((l) => l.dir),
      0.9,
    ),
    largura,
    traco: tracoCorpo,
    marcadores: marcadoresDeSecao(linhas),
  };
  const classes = linhas.map((l) => classificar(l, regua));
  // Logo depois de classificar: desfaz a citação que na verdade era o meio de um
  // parágrafo, antes que tabela, sumário e nota decidam em cima dela.
  corrigirContinuacoes(linhas, classes, corpo, esquerda);
  // Antes da tabela: entrada de sumário também quebra em duas colunas, e sem
  // isto a página inteira de sumário viraria uma tabela de duas colunas.
  marcarSumario(linhas, classes);
  marcarTabelas(linhas, classes, corpo);
  // Depois da tabela: uma tabela no pé da página é tabela, não nota.
  marcarNotas(linhas, classes, corpo);

  // Onde cada item de lista começa. Um item ocupa várias linhas, e as de baixo
  // vêm recuadas (o "recuo pendurado"): sem saber disso, cada linha de um item
  // virava um parágrafo, com o espaçamento de parágrafo entre elas.
  const abreItem = linhas.map((l) => ABRE_ITEM.test(l.texto));

  const blocos: BlocoPosicionado[] = [];
  let atual: Linha[] = [];
  let classeAtual: Classe = { tipo: "paragrafo" };
  let xDoItem: number | null = null;
  const fechar = () => {
    if (atual.length) {
      blocos.push({ y: atual[0].y, bloco: montar(atual, classeAtual) });
    }
    atual = [];
  };

  linhas.forEach((l, i) => {
    if (abreItem[i]) xDoItem = l.x;
    else if (xDoItem !== null && l.x <= xDoItem + corpo * 0.3) xDoItem = null;
    // Continuação de item: recuada em relação ao marcador, e sem marcador próprio.
    const continuaItem = xDoItem !== null && !abreItem[i];

    const ant = linhas[i - 1];
    if (ant) {
      const vao = ant.y - l.y;
      // O branco entre um capítulo e outro dentro da página de sumário não abre
      // bloco novo: o nível de cada entrada é medido contra a margem da leva
      // inteira, e partir ela faria a primeira seção de cada pedaço virar
      // capítulo.
      const doisSumarios =
        classes[i].tipo === "sumario" && classes[i - 1].tipo === "sumario";
      const salto = !doisSumarios && vao > Math.max(ant.alt, l.alt) * 1.7;
      // Recuo só indica parágrafo novo no texto corrido — citação é recuada
      // inteira e item de lista tem recuo pendurado, senão cada linha deles
      // viraria um bloco.
      //
      // E recuo de parágrafo é da *primeira* linha: a de baixo volta pra margem.
      // Por isso a linha anterior também precisa estar mais à esquerda. Sem essa
      // parte, o corpo recuado de uma lista de definições ("Escalabilidade" em
      // itálico na margem, a explicação recuada embaixo) quebrava linha a linha,
      // cada uma virando um parágrafo — com o espaçamento de parágrafo entre elas.
      const recuo =
        classes[i].tipo === "paragrafo" &&
        !continuaItem &&
        l.x > esquerda + corpo * 0.9 &&
        ant.x < l.x - corpo * 0.3;
      // Só vale pra texto corrido: em código quase toda linha acaba em ; ou },
      // e em tabela toda célula acaba "curta" — sem isso cada linha viraria um bloco.
      const encerrou =
        classes[i].tipo === "paragrafo" &&
        !continuaItem &&
        ant.dir - ant.x < largura * 0.82 &&
        /[.!?:;"”')\]]$/.test(ant.texto);
      // Mudou de título pra texto (ou vice-versa) é sempre fim de bloco — é isso
      // que impede o título de ser engolido pelo parágrafo logo abaixo dele.
      const trocouClasse = !mesmaClasse(classes[i], classes[i - 1]);
      // Marcador novo é sempre item novo, mesmo colado no anterior.
      if (salto || recuo || encerrou || trocouClasse || abreItem[i]) fechar();
    }
    classeAtual = classes[i];
    atual.push(l);
  });
  fechar();

  return blocos;
}

/** Hífen no fim da linha: comum (-), tipográfico (‐ ‑) ou opcional (­). */
/**
 * Palavra cortada no fim da linha. O grupo é o traço, porque ele decide o que
 * fazer: hífen tipográfico é sempre quebra, hífen comum pode ser palavra composta.
 *
 * Exportado porque a busca (`busca.ts`) precisa juntar as mesmas linhas com a
 * mesma regra — procurar "continuação" tem que achar "conti-" + "nuação".
 */
export const HIFEN_FINAL = /[A-Za-zÀ-ÿ]([-‐‑­])$/;

/** A seta que abre a seção é desenho, não palavra — sai do texto do título. */
function semMarcador(texto: string): string {
  return SETA.test(texto.trim()[0] ?? "") ? texto.trim().slice(1).trimStart() : texto;
}

function montar(linhas: Linha[], classe: Classe): Bloco {
  // Código mantém a quebra de linha e o recuo — é o que dá sentido ao aninhamento.
  if (classe.tipo === "codigo") {
    const base = Math.min(...linhas.map((l) => l.recuo));
    const texto = linhas
      .map((l) => " ".repeat(Math.max(0, l.recuo - base)) + l.texto)
      .join("\n");
    return { tipo: "codigo", texto };
  }

  if (classe.tipo === "sumario") {
    // Nível pelo recuo: no sumário impresso o capítulo encosta na margem e as
    // seções vão entrando. O passo é ~1em, medido na própria linha.
    const base = Math.min(...linhas.map((l) => l.x));
    const entradas: EntradaSumario[] = [];
    for (const l of linhas) {
      const passo = Math.max(l.alt * 1.2, 1);
      const nivel = Math.min(3, Math.max(1, 1 + Math.round((l.x - base) / passo))) as
        | 1
        | 2
        | 3;
      const achado = entradaDaLinha(l);
      if (achado) {
        entradas.push({ texto: achado.titulo, pagina: achado.pagina, nivel });
        continue;
      }
      // Título que não coube numa linha só: emenda no de cima.
      const ultima = entradas[entradas.length - 1];
      if (ultima) ultima.texto += ` ${l.texto.trim()}`;
      else entradas.push({ texto: l.texto.trim(), pagina: "", nivel });
    }
    return { tipo: "sumario", entradas };
  }

  if (classe.tipo === "tabela") {
    return { tipo: "tabela", linhas: linhas.map((l) => l.celulas.map((c) => c.texto)) };
  }

  if (classe.tipo === "formula") {
    // A caixa sai com folga: expoente e índice ficam fora da altura da linha, e
    // um recorte apertado corta o topo do somatório.
    const x = Math.min(...linhas.map((l) => l.x));
    const dir = Math.max(...linhas.map((l) => l.dir));
    const topo = Math.max(...linhas.map((l) => l.y + l.alt * 1.35));
    const base = Math.min(...linhas.map((l) => l.y - l.alt * 0.5));
    return {
      tipo: "formula",
      texto: linhas.map((l) => l.texto).join(" "),
      caixa: { x, y: base, w: dir - x, h: topo - base },
    };
  }

  let texto = "";
  const negrito: Faixa[] = [];
  const italico: Faixa[] = [];
  const sobrescrito: Faixa[] = [];
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
    transportar(l.sobrescrito, sobrescrito);
  }

  // Título já é destacado por inteiro; marcar de novo por dentro seria redundante.
  if (classe.tipo === "titulo") {
    return { tipo: "titulo", nivel: classe.nivel, texto: semMarcador(texto) };
  }

  // O PDF guarda o endereço como texto comum; quem transforma em link é a leitura
  // do próprio texto. (No EPUB o <a href> vem escrito, e é ele que vale.)
  const links = acharLinks(texto);
  const destaques = { texto, negrito, italico, sobrescrito, links };
  if (classe.tipo === "citacao") return { tipo: "citacao", ...destaques };
  if (classe.tipo === "nota") return { tipo: "nota", ...destaques };
  return { tipo: "paragrafo", ...destaques };
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

/**
 * Começo de item de lista: "•", "2.", "3)", "a)" e parentes.
 *
 * Precisa do espaço depois do marcador pra não confundir com frase que começa em
 * número ("2020 foi o ano em que...").
 */
const ABRE_ITEM = /^\s*(?:[•‣▪◦∙·]|[-–—](?=\s)|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)])\s/;
