/**
 * Como o livro se chama.
 *
 * Dois riscos opostos: aceitar lixo dos metadados ("Microsoft Word - cap1.doc")
 * vira um nome errado que ninguém desconfia que está errado; e ser exigente
 * demais joga fora o título bom. Os dois lados estão testados aqui.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  autorUtil,
  daCapa,
  dosMetadados,
  tituloUtil,
} from "../node_modules/.cache/teste/lib/pdf-titulo.mjs";

function item(texto, { x = 100, y, alt = 12 } = {}) {
  return {
    texto,
    x,
    y,
    w: texto.length * alt * 0.5,
    alt,
    fonte: `f${alt}`,
    mono: false,
    italico: false,
    espaco: false,
  };
}

test("título de verdade nos metadados é aproveitado", () => {
  assert.equal(tituloUtil("Fundamentals of Data Engineering"), "Fundamentals of Data Engineering");
  assert.equal(tituloUtil("  Dom  Casmurro "), "Dom Casmurro");
  assert.equal(tituloUtil("Refactoring"), "Refactoring");
});

test("lixo de metadado é recusado", () => {
  for (const lixo of [
    "Microsoft Word - cap1_revisado_FINAL2.doc",
    "untitled",
    "Sem título",
    "documento1",
    "miolo.indd",
    "tese_final.tex",
    "9788535920123456",
    "2011",
    "  ",
  ]) {
    assert.equal(tituloUtil(lixo), null, `devia recusar: ${lixo}`);
  }
});

test("autor recusa o dono do computador que gerou o PDF", () => {
  assert.equal(autorUtil("Machado de Assis"), "Machado de Assis");
  assert.equal(autorUtil("Windows User"), null);
  assert.equal(autorUtil("Administrador"), null);
  assert.equal(autorUtil("Adobe InDesign"), null);
});

test("metadados com título ruim mas autor bom devolvem só o autor", () => {
  const achado = dosMetadados({ Title: "untitled", Author: "Joe Reis" });
  assert.equal(achado.titulo, null);
  assert.equal(achado.autor, "Joe Reis");
  assert.equal(achado.fonte, "metadados");
});

test("capa: o título é o que está escrito maior, o autor vem abaixo", () => {
  const itens = [
    item("O Cortiço", { y: 600, alt: 34 }),
    item("romance", { y: 540, alt: 12 }),
    item("Aluísio Azevedo", { y: 300, alt: 18 }),
    item("Editora Exemplo", { y: 120, alt: 10 }),
  ];

  const achado = daCapa(itens);
  assert.equal(achado.titulo, "O Cortiço");
  assert.equal(achado.autor, "Aluísio Azevedo");
  assert.equal(achado.fonte, "capa");
});

test("capa: título de duas linhas é juntado", () => {
  const itens = [
    item("Fundamentals of", { y: 620, alt: 30 }),
    item("Data Engineering", { y: 580, alt: 30 }),
    item("Joe Reis", { y: 300, alt: 16 }),
  ];

  assert.equal(daCapa(itens).titulo, "Fundamentals of Data Engineering");
});

test("capa em caixa alta e com letra espaçada volta legível", () => {
  const itens = [
    item("D O M   C A S M U R R O", { y: 600, alt: 30 }),
    item("MACHADO DE ASSIS", { y: 300, alt: 14 }),
  ];

  const achado = daCapa(itens);
  assert.equal(achado.titulo, "Dom Casmurro");
  assert.equal(achado.autor, "Machado de Assis");
});

test("página de texto corrido não vira título nenhum", () => {
  // Sem hierarquia de tamanho não há capa: é miolo de livro.
  const itens = Array.from({ length: 12 }, (_, i) =>
    item(`linha ${i} de um parágrafo comum do miolo do livro`, { y: 600 - i * 14 }),
  );
  assert.equal(daCapa(itens), null);
});

test("ISBN e endereço de site não são confundidos com autor", () => {
  const itens = [
    item("Manual de Redação", { y: 600, alt: 30 }),
    item("www.exemplo.com.br", { y: 300, alt: 16 }),
    item("ISBN 978-85-359-2012-3", { y: 260, alt: 16 }),
    item("Paulo Coelho Neto", { y: 200, alt: 14 }),
  ];

  assert.equal(daCapa(itens).autor, "Paulo Coelho Neto");
});
