/**
 * Os SVG de `public/` continuam sendo o desenho de `src/lib/logo.ts`?
 *
 * Eles são gerados (`node scripts/gerar-logo.mjs`) e versionados, porque o
 * README e o `<link rel=icon>` precisam de arquivo, não de função. Arquivo
 * gerado e commitado envelhece calado: alguém mexe no desenho, o app muda, e o
 * logo do README fica sendo o antigo por meses sem ninguém notar.
 *
 * Este teste é o alarme. Se ele falhar, rode o gerador.
 *
 * Rode com `npm test` (o `pretest` compila `src/lib` pro node).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  MARCA_CLARA,
  MARCA_ESCURA,
  marcaInterior,
  marcaSvg,
} from "../node_modules/.cache/teste/lib/logo.mjs";
import { KICKER, WORDMARK } from "../node_modules/.cache/teste/lib/logo-wordmark.mjs";

const ler = (nome) => readFileSync(new URL(`../public/${nome}`, import.meta.url), "utf8");

const RECADO = "desenho mudou — rode `node scripts/gerar-logo.mjs`";

test("a marca clara em public/ é a do módulo", () => {
  const esperado = marcaSvg(MARCA_CLARA, { id: "nekoL", titulo: "Nekoreader" });
  assert.equal(ler("logo.svg").trim(), esperado.trim(), RECADO);
});

test("a marca escura em public/ é a do módulo", () => {
  const esperado = marcaSvg(MARCA_ESCURA, { id: "nekoD", titulo: "Nekoreader" });
  assert.equal(ler("logo-dark.svg").trim(), esperado.trim(), RECADO);
});

test("os banners trazem o mesmo desenho e o mesmo wordmark", () => {
  for (const [nome, paleta, id] of [
    ["logo-banner.svg", MARCA_CLARA, "nekoBL"],
    ["logo-banner-dark.svg", MARCA_ESCURA, "nekoBD"],
  ]) {
    const svg = ler(nome);
    assert.ok(svg.includes(marcaInterior(paleta, id)), `${nome}: ${RECADO}`);
    assert.ok(svg.includes(WORDMARK.d), `${nome}: wordmark fora de dia`);
    assert.ok(svg.includes(KICKER.d), `${nome}: kicker fora de dia`);
  }
});

test("a marca sem fundo não leva o quadrado — é a que vai dentro da página", () => {
  const solta = marcaSvg(MARCA_CLARA, { fundo: "nenhum", id: "x" });
  assert.ok(!solta.includes('rx="26"'));
  assert.ok(!solta.includes(`fill="${MARCA_CLARA.papel}"`));
  // O gato e o livro continuam lá.
  assert.ok(solta.includes(marcaInterior(MARCA_CLARA, "x")));
});

test("o maskable encolhe o desenho e deixa o fundo reto", () => {
  const mascara = marcaSvg(MARCA_CLARA, { fundo: "reto", folga: 0.14, id: "m" });
  assert.ok(!mascara.includes('rx="26"'), "quem arredonda é o sistema");
  // 1 - 0.14*2 = 0.72, dentro dos 80% centrais que o Android garante.
  assert.ok(mascara.includes("scale(0.7200)"), "sem folga o Android corta as orelhas");
});
