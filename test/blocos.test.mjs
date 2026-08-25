/**
 * A mobília da página e a citação que não era citação.
 *
 * Os dois casos vêm do livro digitalizado, onde a altura de cada linha é a que o
 * OCR mediu — ela varia alguns por cento de uma linha pra outra, e nenhuma
 * medida de tamanho pode ser levada a ferro e fogo. É esse tremor que fazia o
 * meio de um item de lista virar citação, e que faz o cabeçalho corrido sair um
 * pouco mais alto que o corpo sem ser título.
 *
 * Rode com `npm test` (o `pretest` compila `src/lib` pro node).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { remontarPagina } from "../node_modules/.cache/teste/lib/pdf-blocos.mjs";

const LARGURA = 433;
const MARGEM = 13;
const DIREITA = 421;
const CORPO = 9.6;

function linha(
  texto,
  { x = MARGEM, y, w = DIREITA - MARGEM, alt = CORPO, fonte = "corpo", traco = 0.1 } = {},
) {
  return { texto, x, y, w, alt, fonte, mono: false, italico: false, espaco: false, traco };
}

/** Miolo de página: linhas cheias, encostando nas duas margens. */
function miolo(quantas, yInicial, { entrelinhas = 12 } = {}) {
  return Array.from({ length: quantas }, (_, i) =>
    linha(`linha ${i} do miolo do livro, que segue de margem a margem sem parar`, {
      y: yInicial - i * entrelinhas,
    }),
  );
}

const textos = (itens) =>
  remontarPagina(itens, LARGURA)
    .colunas.flat()
    .map((p) => p.bloco.texto ?? "");

test("o cabeçalho corrido sai, mesmo medido um pouco mais alto que o corpo", () => {
  const itens = [
    // "Chapter 1 | Arrays and Strings": sem número na ponta, na fonte do texto e
    // 35% mais alto que o miolo — como o OCR devolve.
    linha("Chapter 1 | Arrays and Strings", { y: 680, w: 159, alt: 13.1 }),
    ...miolo(12, 651),
  ];
  const { folio } = remontarPagina(itens, LARGURA);

  assert.ok(!textos(itens).some((t) => t.includes("Arrays and Strings")));
  assert.equal(folio, null, "cabeçalho sem número não inventa folio");
});

test("o título que abre o capítulo fica — ele é bem maior que o corpo", () => {
  const itens = [
    linha("The Interview Process", { y: 680, w: 139, alt: 15.5 }),
    ...miolo(12, 640),
  ];

  assert.ok(textos(itens).some((t) => t.includes("The Interview Process")));
});

test("o rodapé corrido dá o folio, com o número na ponta e sem barra nenhuma", () => {
  // O OCR come o "|" de "4 | Cracking the Coding Interview, 6th Edition" e
  // entrega a linha inteira como uma tira só de texto — sem célula pra medir vão.
  for (const [texto, esperado] of [
    ["4 Cracking the Coding Interview, 6th Edition", "4"],
    ["30 I Cracking the Coding Interview, 6th Edition", "30"],
    ["CrackingTheCodinglnterview.com 16th Edition 5", "5"],
    ["CrackingTheCodinglnterview.com | 6th Edition", null],
  ]) {
    const itens = [...miolo(12, 680), linha(texto, { x: 24, y: 500, w: 175, alt: 9.5 })];
    const { folio } = remontarPagina(itens, LARGURA);
    assert.equal(folio, esperado, texto);
    assert.ok(
      !textos(itens).some((t) => t.includes("Edition")),
      `o rodapé não pode sobrar no texto: ${texto}`,
    );
  }
});

test("o meio de um item de lista não vira citação por medir um tico menos", () => {
  // Recuo pendurado: o marcador na margem, o resto do item recuado embaixo. A
  // última linha sai 6% mais baixa que o corpo — puro tremor do OCR.
  const itens = [
    ...miolo(8, 680),
    linha("• Analytical skills: Did you need much help solving the problem? How", { y: 560, alt: 9.78 }),
    linha("long did it take you to arrive at a solution? If you had to design a new", { x: 26, y: 548, w: 395, alt: 10.24 }),
    linha("structure the problem well and think through the tradeoffs?", { x: 25.3, y: 536, w: 293, alt: 9.06 }),
    ...miolo(4, 518),
  ];

  const blocos = remontarPagina(itens, LARGURA).colunas.flat().map((p) => p.bloco);
  const item = blocos.find((b) => (b.texto ?? "").startsWith("• Analytical"));

  assert.ok(item, "o item de lista tem que existir");
  assert.equal(item.tipo, "paragrafo");
  assert.ok(item.texto.includes("tradeoffs?"), "a última linha continua no mesmo bloco");
  assert.ok(!blocos.some((b) => b.tipo === "citacao"), "nada aqui é citação");
});

test("a citação de verdade continua sendo citação", () => {
  // Recuada, em corpo menor e — o que a separa da continuação — solta no branco:
  // a linha de cima acabou, não passou por baixo.
  const itens = [
    ...miolo(8, 680),
    linha("Só se vê bem com o coração; o essencial é invisível aos olhos,", { x: 45, y: 552, w: 330, alt: 8.4 }),
    linha("dizia a raposa ao principezinho antes da despedida.", { x: 45, y: 541, w: 300, alt: 8.4 }),
    ...miolo(4, 512),
  ];

  const blocos = remontarPagina(itens, LARGURA).colunas.flat().map((p) => p.bloco);
  assert.ok(blocos.some((b) => b.tipo === "citacao" && b.texto.includes("raposa")));
});

/* --- os dois sinais que devolvem o título ao livro digitalizado --- */

const blocos = (itens) => remontarPagina(itens, LARGURA).colunas.flat().map((p) => p.bloco);
const titulos = (itens) => blocos(itens).filter((b) => b.tipo === "titulo");

test("a seta que o livro usa pra abrir seção vira título, e some do texto", () => {
  const itens = [
    ...miolo(6, 680),
    linha("► Why?", { y: 590, w: 42, alt: 11.5 }),
    ...miolo(6, 570),
  ];

  const [t] = titulos(itens);
  assert.ok(t, "a linha da seta tem que virar título");
  assert.equal(t.texto, "Why?", "a seta é desenho, não palavra");
});

test("seta que aparece no meio de frase não é marcador de nada", () => {
  const itens = [
    ...miolo(6, 680),
    linha("► Why?", { y: 590, w: 42, alt: 11.5 }),
    // A mesma seta usada como texto desqualifica ela na página inteira.
    linha("o caminho a ► b percorre a lista toda antes de parar no fim dela", { y: 578 }),
    ...miolo(6, 560),
  ];

  assert.deepEqual(titulos(itens), []);
});

test("o negrito medido na folha vira título no livro sem contraste de fonte", () => {
  const itens = [
    ...miolo(6, 680),
    linha("Amortized Time", { y: 590, w: 90, traco: 0.16 }),
    ...miolo(6, 570),
  ];

  const [t] = titulos(itens);
  assert.ok(t, "linha de traço mais gordo é título");
  assert.equal(t.texto, "Amortized Time");
});

test("parágrafo que só começa em negrito continua parágrafo", () => {
  // Traço pesado, mas a linha vai de margem a margem: título nenhum faz isso.
  const itens = [
    ...miolo(6, 680),
    linha("Metadata. Metadata is data about data, and it lives em toda parte aqui", {
      y: 590,
      traco: 0.16,
    }),
    ...miolo(6, 570),
  ];

  assert.deepEqual(titulos(itens), []);
});

test("número solto do tamanho do texto não vira título por mais gordo que seja", () => {
  const itens = [
    ...miolo(6, 680),
    linha("37", { y: 590, w: 12, traco: 0.18 }),
    ...miolo(6, 570),
  ];

  assert.deepEqual(titulos(itens), []);
});

test("a régua do traço é a prosa, não a linha de código que é maioria", () => {
  // Página de solução: dezenas de linhas de código, finas e curtas, e dois
  // parágrafos de prosa. Contando linha por linha a régua viraria o código, e a
  // prosa toda passaria por negrito.
  const codigo = Array.from({ length: 14 }, (_, i) =>
    linha(`${i} for (int i = 0; i < n; i++) {`, { y: 660 - i * 11, w: 120, traco: 0.07 }),
  );
  const itens = [
    ...miolo(4, 680),
    ...codigo,
    linha("A prosa comum da página segue de margem a margem, com traço de corpo", {
      y: 490,
    }),
    linha("e continua por aqui sem nada de especial no peso da letra dela também", {
      y: 478,
    }),
    linha("Solution #2: Combinatorics", { y: 456, w: 120, traco: 0.155 }),
    ...miolo(4, 440),
  ];

  assert.deepEqual(
    titulos(itens).map((t) => t.texto),
    ["Solution #2: Combinatorics"],
  );
});

test("sem medida de traço nenhuma, a página sai como saía antes", () => {
  const itens = [
    ...miolo(6, 680).map((l) => ({ ...l, traco: 0 })),
    { ...linha("Amortized Time", { y: 590, w: 90 }), traco: 0 },
    ...miolo(6, 570).map((l) => ({ ...l, traco: 0 })),
  ];

  assert.deepEqual(titulos(itens), []);
});
