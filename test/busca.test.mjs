/**
 * Procurar dentro do livro.
 *
 * O que se testa aqui é a tolerância: quem digita não repete o livro caractere
 * por caractere. Digita sem acento, digita minúsculo, e procura uma palavra que
 * no arquivo está partida em duas linhas por um hífen. Um casamento literal
 * devolveria "nada encontrado" nos três casos — num livro que tem a palavra.
 *
 * E o contrário também importa: o que **não** pode casar. Um termo de uma letra
 * casa com meio livro e não é resposta.
 *
 * Rode com `npm test` (o `pretest` compila `src/lib` pro node).
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_TERMO,
  acharNoTexto,
  normalizar,
  procurar,
  textoDosBlocos,
  trecho,
} from "../node_modules/.cache/teste/lib/busca.mjs";
import { remontarColunas } from "../node_modules/.cache/teste/lib/pdf-blocos.mjs";

/* ---------------------------------------------------------------- */
/* achatamento                                                       */
/* ---------------------------------------------------------------- */

test("acento, caixa e ligadura somem na hora de comparar", () => {
  assert.equal(normalizar("Coração"), "coracao");
  assert.equal(normalizar("DEFINIÇÃO"), "definicao");
  // A ligadura tipográfica que o PDF adora: um caractere só na folha, duas letras
  // pra quem digita.
  assert.equal(normalizar("aﬁm"), "afim");
  // Acento solto (a + til combinante) tem que dar no mesmo que o precomposto.
  assert.equal(normalizar("não"), normalizar("não"));
});

test("todo branco vira um espaço só — a frase atravessa a quebra de linha", () => {
  assert.equal(normalizar("uma   frase\nquebrada\tno meio"), "uma frase quebrada no meio");
  assert.equal(normalizar("  sobra  "), "sobra");
});

test("aspa curva e travessão casam com o que dá pra digitar", () => {
  assert.equal(normalizar("“aspas”"), '"aspas"');
  assert.equal(normalizar("meio—fim"), "meio-fim");
});

/* ---------------------------------------------------------------- */
/* casamento                                                         */
/* ---------------------------------------------------------------- */

test("procurar sem acento acha a palavra acentuada, e devolve como o livro escreveu", () => {
  const texto = "A definição de metadados aparece aqui.";
  const faixas = acharNoTexto(texto, "definicao");

  assert.equal(faixas.length, 1);
  assert.equal(texto.slice(faixas[0].inicio, faixas[0].fim), "definição");
});

test("o índice devolvido é o do texto original, não o da forma achatada", () => {
  // "ﬁ" ocupa 1 caractere no original e 2 na forma de comparar: sem o mapa de
  // volta, o recorte sairia deslocado a partir daqui.
  const texto = "o ﬁm do capítulo";
  const [faixa] = acharNoTexto(texto, "fim");

  assert.equal(texto.slice(faixa.inicio, faixa.fim), "ﬁm");
});

test("ocorrências que se sobrepõem contam todas", () => {
  assert.equal(acharNoTexto("aaa", "aa").length, 2);
});

test("termo curto demais não casa com nada", () => {
  assert.equal(MIN_TERMO, 2);
  assert.deepEqual(acharNoTexto("a arte da guerra", "a"), []);
  assert.deepEqual(acharNoTexto("a arte da guerra", ""), []);
});

test("o que não está no texto não é achado", () => {
  assert.deepEqual(acharNoTexto("a arte da guerra", "paz"), []);
});

/* ---------------------------------------------------------------- */
/* trecho mostrado                                                   */
/* ---------------------------------------------------------------- */

test("o trecho corta em espaço e avisa com reticências", () => {
  const texto =
    "Muito antes disso, quando ninguém ainda escrevia sobre o assunto, " +
    "a palavra metadados apareceu num relatório interno que ninguém leu até o fim.";
  const [faixa] = acharNoTexto(texto, "metadados");
  const { antes, casado, depois } = trecho(texto, faixa, 20);

  assert.equal(casado, "metadados");
  assert.ok(antes.startsWith("…"), "cortou à esquerda, então avisa");
  assert.ok(depois.endsWith("…"), "cortou à direita, então avisa");
  assert.ok(!antes.includes("Muito"), "não trouxe o começo do parágrafo inteiro");
  // Cortar em espaço: o pedaço de contexto não começa no meio de uma palavra.
  assert.ok(!/^…\S*\s/.test(antes) || antes.slice(1, 2) !== " ");
  assert.ok(texto.includes(antes.replace("…", "").trim()));
});

test("trecho que não foi cortado não ganha reticências", () => {
  const texto = "curto e direto";
  const [faixa] = acharNoTexto(texto, "direto");
  const { antes, depois } = trecho(texto, faixa, 40);

  assert.equal(antes, "curto e ");
  assert.equal(depois, "");
});

/* ---------------------------------------------------------------- */
/* o livro inteiro                                                   */
/* ---------------------------------------------------------------- */

const PAGINAS = [
  "Capa do livro",
  "Sumário: a definição de metadados .... 12",
  "Nada aqui.",
  "A definição vem antes do exemplo. Outra definição vem depois.",
];

test("a página devolvida é a do arquivo, contando de 1", () => {
  const { achados } = procurar(PAGINAS, "definicao");

  assert.deepEqual(
    achados.map((a) => a.pagina),
    [2, 4, 4],
  );
  assert.equal(achados[0].casado, "definição");
});

test("página vazia e página sem o termo são puladas sem estourar", () => {
  const { achados } = procurar(["", null ?? "", "só aqui: alfa"], "alfa");
  assert.equal(achados.length, 1);
  assert.equal(achados[0].pagina, 3);
});

test("a lista para no teto e diz que parou", () => {
  const { achados, cortado } = procurar(["alfa alfa alfa alfa"], "alfa", 2);

  assert.equal(achados.length, 2);
  assert.equal(cortado, true);
});

test("termo curto não devolve o livro inteiro", () => {
  const { achados, cortado } = procurar(PAGINAS, "a");
  assert.deepEqual(achados, []);
  assert.equal(cortado, false);
});

/* ---------------------------------------------------------------- */
/* palavra partida entre duas linhas                                 */
/* ---------------------------------------------------------------- */

const LARGURA = 433;
const MARGEM = 13;
const DIREITA = 421;
const CORPO = 9.6;

function linha(texto, { y, w = DIREITA - MARGEM, alt = CORPO } = {}) {
  return {
    texto,
    x: MARGEM,
    y,
    w,
    alt,
    fonte: "corpo",
    mono: false,
    italico: false,
    espaco: false,
    traco: 0.1,
  };
}

/**
 * O caso que justifica passar pela remontagem em vez de só juntar as linhas: o
 * arquivo guarda "conti-" numa linha e "nuação" na outra, e a palavra que a
 * pessoa procura não existe em lugar nenhum do texto cru.
 */
test("procurar a palavra inteira acha a que estava partida com hífen", () => {
  const itens = [
    linha("O trabalho seguiu sem pressa até a conti-", { y: 700 }),
    linha("nuação do capítulo, que veio meses depois e mudou tudo o que", { y: 688 }),
    linha("tinha sido escrito antes, de margem a margem, sem parar por nada", { y: 676 }),
  ];

  const blocos = remontarColunas(itens, LARGURA)
    .flat()
    .map((p) => p.bloco);
  const texto = textoDosBlocos(blocos);

  assert.ok(texto.includes("continuação"), texto);
  assert.equal(procurar([texto], "continuacao").achados.length, 1);
});

test("bloco sem texto não quebra a extração", () => {
  const vazio = textoDosBlocos([
    { tipo: "imagem", url: "blob:x", largura: 10, altura: 10 },
    { tipo: "tabela", linhas: [["a", "b"], ["c", "d"]] },
    { tipo: "sumario", entradas: [{ texto: "Prefácio", pagina: "xix", nivel: 1 }] },
  ]);

  assert.equal(vazio, "a b\nc d\nPrefácio");
});
