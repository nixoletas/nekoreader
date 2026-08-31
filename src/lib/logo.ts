/**
 * A marca do Nekoreader: um gato atrás de um livro.
 *
 * Este arquivo é a **única** fonte do desenho. O ícone do PWA (`app/icons`), a
 * marca que aparece nas telas (`components/marca.tsx`) e os SVG soltos de
 * `public/` saem todos daqui — desenhar de novo em cada lugar é como o mesmo
 * logo acaba com três versões levemente diferentes.
 *
 * O livro é o que o ícone já era: lombada, folha e quatro linhas com a segunda
 * em dourado. O que faltava era o nome — "neko" é gato, e o ícone não tinha
 * nenhum. A cabeça aparece só uns oito pixels acima do livro, mas é a curva
 * entre as duas orelhas que faz o olho ler "gato atrás do livro" em vez de
 * "dois triângulos".
 *
 * Módulo puro, sem React e sem DOM: devolve texto. É o que permite usá-lo no
 * `ImageResponse` (que não tem DOM), num script de build e dentro de um
 * componente, sem três caminhos diferentes.
 */

export type PaletaMarca = {
  /** Fundo do quadrado. */
  papel: string;
  /** A folha do livro. */
  superficie: string;
  /** Lombada e gato. */
  acento: string;
  /** Dentro da orelha. */
  acentoSuave: string;
  /** As linhas de texto na folha. */
  linha: string;
  /** A linha marcada — o que o app faz. */
  dourado: string;
};

/**
 * Os valores do tema claro, escritos por extenso.
 *
 * Literal, e não `var(--accent)`, porque o `ImageResponse` e os arquivos de
 * `public/` são desenhados fora de qualquer página: ali não existe CSS pra
 * resolver variável nenhuma.
 */
export const MARCA_CLARA: PaletaMarca = {
  papel: "#f0e7d5",
  superficie: "#fffdf7",
  acento: "#a33f27",
  acentoSuave: "#c8734f",
  linha: "#d8cbb4",
  dourado: "#b78a34",
};

/**
 * O tema escuro, com uma diferença deliberada: a folha é `#2b241c`, e não o
 * `--surface` do tema (`#1e1a15`).
 *
 * Na interface o livro está cercado de outros elementos que o situam; aqui é
 * uma forma sozinha num quadrado, e com o valor literal do tema a folha some no
 * fundo — sobra a lombada flutuando.
 */
export const MARCA_ESCURA: PaletaMarca = {
  papel: "#14110d",
  superficie: "#2b241c",
  acento: "#e08a63",
  acentoSuave: "#c8734f",
  linha: "#4d4234",
  dourado: "#d8ab4e",
};

/**
 * A paleta em variáveis do CSS, pra marca desenhada **dentro** da página.
 *
 * Inline no DOM, o SVG enxerga as variáveis do tema — então a mesma marca
 * acompanha claro e escuro sozinha, sem duas cópias e sem JavaScript.
 */
export const MARCA_TOKENS: PaletaMarca = {
  papel: "var(--paper)",
  superficie: "var(--surface)",
  acento: "var(--accent)",
  acentoSuave: "var(--accent-soft)",
  linha: "var(--line)",
  dourado: "var(--gold)",
};

/** O lado da caixa em que a marca é desenhada. */
export const LADO = 128;

/**
 * O desenho, sem a tag `<svg>` em volta — pra quem monta o próprio invólucro
 * (o banner do README põe a marca ao lado do wordmark).
 *
 * `id` entra no `clipPath`: dois desenhos na mesma página com o mesmo id fariam
 * um recortar pelo outro.
 *
 * A ordem importa: rabo e cabeça vêm **antes** do livro, então o livro os cobre.
 * É só isso que põe o gato atrás dele — não há máscara nenhuma.
 */
export function marcaInterior(p: PaletaMarca, id = "marca"): string {
  return `<path d="M80 116 C102 122 118 116 114 99" fill="none" stroke="${p.acento}" stroke-width="5.5" stroke-linecap="round"/>
<path d="M40 48 C40 36 41 30 42.5 27 L46 5 L59 23 C62 22 66 22 69 23 L82 5 L85.5 27 C87 30 88 36 88 48 Z" fill="${p.acento}"/>
<path d="M45.7 22.5 L47.7 11.4 L54.3 20.4 Z" fill="${p.acentoSuave}"/>
<path d="M82.3 22.5 L80.3 11.4 L73.7 20.4 Z" fill="${p.acentoSuave}"/>
<clipPath id="${id}"><path d="M28 46 H94 A10 10 0 0 1 104 56 V104 A10 10 0 0 1 94 114 H28 A4 4 0 0 1 24 110 V50 A4 4 0 0 1 28 46 Z"/></clipPath>
<g clip-path="url(#${id})">
<rect x="24" y="46" width="80" height="68" fill="${p.superficie}"/>
<rect x="24" y="46" width="20" height="68" fill="${p.acento}"/>
<rect x="54" y="59" width="40" height="5" rx="2.5" fill="${p.linha}"/>
<rect x="54" y="71.5" width="40" height="5" rx="2.5" fill="${p.dourado}"/>
<rect x="54" y="84" width="40" height="5" rx="2.5" fill="${p.linha}"/>
<rect x="54" y="96.5" width="24" height="5" rx="2.5" fill="${p.linha}"/>
</g>`;
}

export type OpcoesMarca = {
  /**
   * O quadrado de fundo. `"arredondado"` é o ícone; `"reto"` é o maskable, que
   * o próprio sistema recorta; `"nenhum"` deixa a marca solta sobre a página.
   */
  fundo?: "arredondado" | "reto" | "nenhum";
  /**
   * Folga em volta, em fração do lado. O maskable precisa dela: o Android
   * recorta o ícone num círculo, e sem folga as orelhas são a primeira coisa
   * que ele corta fora.
   */
  folga?: number;
  id?: string;
  /** Lido por leitor de tela quando a marca é o próprio link pra casa. */
  titulo?: string;
  /** Lado do `<svg>` em px. O desenho é vetor: isto só muda o tamanho na tela. */
  tamanho?: number;
};

/** A marca inteira, pronta pra virar arquivo, `data:` URI ou nó do DOM. */
export function marcaSvg(p: PaletaMarca, opcoes: OpcoesMarca = {}): string {
  const { fundo = "arredondado", folga = 0, id = "marca", titulo, tamanho = LADO } = opcoes;

  const escala = 1 - folga * 2;
  const conteudo =
    escala === 1
      ? marcaInterior(p, id)
      : `<g transform="translate(${(LADO * folga).toFixed(2)} ${(LADO * folga).toFixed(
          2,
        )}) scale(${escala.toFixed(4)})">${marcaInterior(p, id)}</g>`;

  const quadrado =
    fundo === "nenhum"
      ? ""
      : `<rect width="${LADO}" height="${LADO}"${
          fundo === "arredondado" ? ' rx="26"' : ""
        } fill="${p.papel}"/>`;

  const acessivel = titulo
    ? ` role="img" aria-label="${titulo}"`
    : ' aria-hidden="true"';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}" width="${tamanho}" height="${tamanho}"${acessivel}>${quadrado}${conteudo}</svg>`;
}
