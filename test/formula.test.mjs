/**
 * Detecção de fórmula — e, principalmente, o que **não** é fórmula.
 *
 * O erro caro aqui é o falso positivo: trocar um parágrafo de verdade por um
 * recorte de imagem estraga a leitura e não tem volta pra quem lê. Por isso a
 * maior parte deste arquivo testa prosa, título e epígrafe continuando texto.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { remontarPagina } from "../node_modules/.cache/teste/lib/pdf-blocos.mjs";

const LARGURA = 612;
const CORPO = 12;
const X = 72;
const W = 430; // a coluna vai de 72 a 502; o meio dela é 287

function item(texto, { x = X, y, w = W, alt = CORPO, matematica = false } = {}) {
  return {
    texto,
    x,
    y,
    w,
    alt,
    fonte: matematica ? "mate" : "corpo",
    mono: false,
    italico: false,
    matematica,
    espaco: false,
  };
}

/** Página de texto corrido com uma linha diferente enfiada no meio. */
function paginaCom(linhaDoMeio) {
  const itens = [];
  for (let i = 0; i < 10; i++) {
    itens.push(item(`linha ${i} de texto corrido comum do miolo do livro aqui`, { y: 700 - i * 14 }));
  }
  itens.push(...linhaDoMeio);
  for (let i = 11; i < 20; i++) {
    itens.push(item(`linha ${i} de texto corrido comum do miolo do livro aqui`, { y: 700 - i * 14 }));
  }
  return itens;
}

const tipos = (itens) =>
  remontarPagina(itens, LARGURA)
    .colunas.flat()
    .map((p) => p.bloco.tipo);

test("equação centrada, curta e cheia de sinal vira fórmula", () => {
  const blocos = remontarPagina(
    paginaCom([item("y = ax2 + b", { x: 250, y: 700 - 10 * 14, w: 74 })]),
    LARGURA,
  ).colunas.flat().map((p) => p.bloco);

  const formula = blocos.find((b) => b.tipo === "formula");
  assert.ok(formula, "a linha da equação devia ter virado fórmula");
  assert.equal(formula.texto, "y = ax2 + b");

  // A caixa é o que vira recorte da folha: precisa cercar a linha com folga.
  assert.ok(formula.caixa.w >= 74, "a caixa cobre a largura da equação");
  assert.ok(formula.caixa.h > CORPO, "a caixa sobra pra cima e pra baixo da linha");
});

test("linha escrita em fonte de matemática vira fórmula mesmo sem estar centrada", () => {
  const blocos = tipos(
    paginaCom([item("xi n = 1", { y: 700 - 10 * 14, w: 120, matematica: true })]),
  );
  assert.ok(blocos.includes("formula"));
});

test("prosa com sinal de igual continua parágrafo", () => {
  const blocos = tipos(
    paginaCom([item("o resultado = a soma dos termos anteriores da série", { y: 700 - 10 * 14 })]),
  );
  assert.ok(!blocos.includes("formula"), "frase com palavras não é fórmula");
});

test("título curto e centrado não vira fórmula", () => {
  const blocos = tipos(paginaCom([item("Capítulo 3", { x: 250, y: 700 - 10 * 14, w: 74 })]));
  assert.ok(!blocos.includes("formula"));
});

test("epígrafe centrada não vira fórmula", () => {
  const blocos = tipos(
    paginaCom([item("— Machado de Assis", { x: 240, y: 700 - 10 * 14, w: 95 })]),
  );
  assert.ok(!blocos.includes("formula"));
});

test("número de página solto não vira fórmula", () => {
  const blocos = tipos(paginaCom([item("87", { x: 280, y: 700 - 10 * 14, w: 14 })]));
  assert.ok(!blocos.includes("formula"));
});
