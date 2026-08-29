/**
 * Procurar uma palavra dentro do livro.
 *
 * Módulo puro de propósito — só recebe strings, sem pdf.js e sem DOM —, do mesmo
 * jeito que `pdf-blocos.ts` e `sumario.ts`. Quem lê o arquivo é o `pdf-busca.ts`;
 * aqui fica só a parte que dá pra conferir fora do navegador.
 *
 * A regra que manda em tudo: **procurar tem que ser mais tolerante que ler.**
 * Quem digita "cao" está procurando "coração", quem digita "definicao" quer achar
 * "definição". Casar caractere a caractere devolveria nada nesses casos, e "nada
 * encontrado" num livro que tem a palavra é pior que devolver demais.
 */

import type { Bloco } from "@/lib/pdf-blocos";

/** Uma ocorrência, já com o pedaço de frase em volta pra mostrar na lista. */
export type Achado = {
  /** Página do arquivo (1 = a primeira). No EPUB é o capítulo. */
  pagina: number;
  /** O que vem antes do trecho casado, com reticências quando foi cortado. */
  antes: string;
  /** O trecho como está escrito no livro — com acento, maiúscula e tudo. */
  casado: string;
  depois: string;
};

/** Menos que isto casa com meio livro e não ajuda ninguém. */
export const MIN_TERMO = 2;

/** Teto de ocorrências listadas. Passar disso é rolagem infinita, não resposta. */
export const MAX_ACHADOS = 300;

/* ------------------------------------------------------------------ */
/* Normalização                                                        */
/* ------------------------------------------------------------------ */

/**
 * Como cada caractere fica na hora de comparar, guardado entre chamadas.
 *
 * Um livro tem milhões de caracteres e algumas centenas de caracteres
 * *diferentes*. Sem esta tabela, cada busca chamaria `normalize()` uma vez por
 * letra do livro — que é a diferença entre a busca responder na hora e travar a
 * aba por alguns segundos.
 */
const tabela = new Map<string, string>();

/** Pontuação que o livro escreve bonito e a pessoa digita reto. */
const EQUIVALENTES: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "–": "-",
  "—": "-",
  "‐": "-",
  "‑": "-",
};

/** Todo branco vira o mesmo espaço: tabulação, quebra de linha, espaço fino, nbsp. */
const BRANCO = /[\s\u00a0\u2007\u202f\u200b]/;

/** Acentos e demais marcas combinantes — o que separa "cao" de "ção". */
const MARCAS = /[\u0300-\u036f]/g;

function dobrar(c: string): string {
  const pronto = tabela.get(c);
  if (pronto !== undefined) return pronto;

  const equivalente = EQUIVALENTES[c];
  let saida: string;

  if (c === "\u0000") {
    // O mesmo "fi" perdido que `saneiaLigaduras` conserta no texto de leitura.
    saida = "fi";
  } else if (c < "\u0020" || c === "\u007f") {
    saida = "";
  } else if (equivalente !== undefined) {
    saida = equivalente;
  } else {
    // NFKD desmonta o que é composto: a ligadura "ﬁ" vira "fi", e "ã"
    // vira "a" mais o til. O til (e todo acento) é caractere de marca e sai fora
    // — é isso que faz "cao" achar "ção".
    saida = c.normalize("NFKD").replace(MARCAS, "").toLowerCase();
  }

  tabela.set(c, saida);
  return saida;
}

/**
 * O texto do jeito que a comparação enxerga: sem acento, sem maiúscula, com a
 * pontuação uniformizada e com todo branco reduzido a um espaço só.
 *
 * `origem`, quando vem, recebe pra cada caractere da saída o índice do caractere
 * que o gerou na entrada. É ele que permite devolver o trecho **como está escrito
 * no livro** depois de ter casado na versão achatada.
 */
function dobrarTexto(texto: string, origem?: number[]): string {
  let saida = "";
  let brancoPendente = false;
  let inicioBranco = 0;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (BRANCO.test(c)) {
      // Branco repetido, quebra de linha e quebra de bloco viram um espaço só:
      // sem isso, uma frase que atravessa a quebra nunca casaria.
      if (!brancoPendente) {
        brancoPendente = true;
        inicioBranco = i;
      }
      continue;
    }

    if (brancoPendente) {
      brancoPendente = false;
      // Branco no começo do texto não vira nada — só separa o que já foi escrito.
      if (saida) {
        saida += " ";
        origem?.push(inicioBranco);
      }
    }

    const dobrado = dobrar(c);
    for (let k = 0; k < dobrado.length; k++) {
      saida += dobrado[k];
      origem?.push(i);
    }
  }

  return saida;
}

/** A forma comparável de um texto. Exportado pra poder ser conferido no teste. */
export function normalizar(texto: string): string {
  return dobrarTexto(texto);
}

/* ------------------------------------------------------------------ */
/* Casamento                                                           */
/* ------------------------------------------------------------------ */

/** Onde uma ocorrência começa e acaba, em índice de caractere do texto original. */
export type Faixa = { inicio: number; fim: number };

/**
 * Todas as ocorrências do termo no texto, em índice do **texto original**.
 *
 * O casamento acontece na forma achatada (sem acento, sem caixa); os índices
 * voltam pro original pelo mapa, porque o que se mostra na tela é a frase como o
 * livro escreveu, não a versão de comparar.
 */
export function acharNoTexto(texto: string, termo: string): Faixa[] {
  const alvo = normalizar(termo);
  if (alvo.length < MIN_TERMO) return [];

  const origem: number[] = [];
  const onde = dobrarTexto(texto, origem);

  const faixas: Faixa[] = [];
  let de = onde.indexOf(alvo);
  while (de !== -1) {
    faixas.push({ inicio: origem[de], fim: origem[de + alvo.length - 1] + 1 });
    // Avança um caractere só: "aa" tem que aparecer duas vezes em "aaa".
    de = onde.indexOf(alvo, de + 1);
  }
  return faixas;
}

/** Só quer saber se tem — sem montar o mapa de índices, que é a parte cara. */
function contem(texto: string, alvo: string): boolean {
  return dobrarTexto(texto).includes(alvo);
}

/* ------------------------------------------------------------------ */
/* Trecho pra mostrar                                                  */
/* ------------------------------------------------------------------ */

/** Quantos caracteres de contexto de cada lado da ocorrência. */
const FOLGA = 48;

/**
 * A ocorrência com um pedaço de frase de cada lado, cortado em espaço pra não
 * começar no meio de uma palavra. O "…" só aparece quando de fato cortou.
 */
export function trecho(
  texto: string,
  { inicio, fim }: Faixa,
  folga = FOLGA,
): { antes: string; casado: string; depois: string } {
  const de = Math.max(0, inicio - folga);
  let antes = texto.slice(de, inicio);
  if (de > 0) {
    const espaco = antes.indexOf(" ");
    antes = "…" + (espaco === -1 ? antes : antes.slice(espaco + 1));
  }

  const ate = Math.min(texto.length, fim + folga);
  let depois = texto.slice(fim, ate);
  if (ate < texto.length) {
    const espaco = depois.lastIndexOf(" ");
    depois = (espaco === -1 ? depois : depois.slice(0, espaco)) + "…";
  }

  return { antes, casado: texto.slice(inicio, fim), depois };
}

/* ------------------------------------------------------------------ */
/* O livro inteiro                                                     */
/* ------------------------------------------------------------------ */

/** O que sai da busca: as ocorrências e se a lista bateu no teto. */
export type Resultado = { achados: Achado[]; cortado: boolean };

/**
 * Procura o termo em todas as páginas. `paginas[0]` é a página 1 do arquivo.
 *
 * Duas passadas de propósito: a primeira só pergunta "tem?" (comparação de
 * string, sem montar mapa de índices), e só a página que tem paga a segunda, que
 * é a cara. Num livro de 700 páginas, quase nenhuma tem.
 */
export function procurar(
  paginas: string[],
  termo: string,
  limite = MAX_ACHADOS,
): Resultado {
  const alvo = normalizar(termo);
  if (alvo.length < MIN_TERMO) return { achados: [], cortado: false };

  const achados: Achado[] = [];
  for (let i = 0; i < paginas.length; i++) {
    const texto = paginas[i];
    if (!texto || !contem(texto, alvo)) continue;

    for (const faixa of acharNoTexto(texto, termo)) {
      if (achados.length >= limite) return { achados, cortado: true };
      achados.push({ pagina: i + 1, ...trecho(texto, faixa) });
    }
  }

  return { achados, cortado: false };
}

/* ------------------------------------------------------------------ */
/* Blocos → texto                                                      */
/* ------------------------------------------------------------------ */

/**
 * O texto de um bloco remontado, pra guardar e procurar depois.
 *
 * A remontagem (`remontarColunas`) já é quem junta linha em parágrafo e desfaz a
 * hifenização — procurar "continuação" acha "conti-" + "nuação" porque o
 * parágrafo chega aqui inteiro, não porque esta função saiba disso.
 *
 * Fórmula entra pelo texto embaralhado mesmo: é ruim de ler, mas às vezes é onde
 * está o nome que a pessoa procura. Imagem não tem texto nenhum.
 */
export function textoDoBloco(b: Bloco): string {
  switch (b.tipo) {
    case "imagem":
      return "";
    case "tabela":
      return b.linhas.map((linha) => linha.join(" ")).join("\n");
    case "sumario":
      return b.entradas.map((e) => e.texto).join("\n");
    default:
      return b.texto;
  }
}

/** O texto inteiro de uma página, na ordem em que ela é lida. */
export function textoDosBlocos(blocos: Bloco[]): string {
  return blocos.map(textoDoBloco).filter(Boolean).join("\n");
}
