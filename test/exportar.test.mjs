/**
 * O livro saindo do app: Markdown e EPUB.
 *
 * O que se testa aqui é o que a conversão promete e a concorrência não entrega:
 * o destaque no lugar certo (as faixas são índice de caractere, e errar por um
 * desloca o negrito da frase inteira) e a numeração impressa sobrevivendo à
 * conversão, que é o que permite continuar citando "página 87" depois.
 */
import test from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import {
  paraEpub,
  paraMarkdown,
} from "../node_modules/.cache/teste/lib/exportar.mjs";

const META = { titulo: "Livro de Teste", autor: "Alguém" };

const semMarcas = { negrito: [], italico: [], sobrescrito: [], links: [] };

const paginas = [
  {
    pagina: 17,
    rotulo: "1",
    blocos: [
      { tipo: "titulo", nivel: 1, texto: "Primeiro capítulo" },
      {
        tipo: "paragrafo",
        texto: "O rato roeu a roupa do rei",
        negrito: [{ start: 2, end: 6 }],
        italico: [{ start: 14, end: 19 }],
        sobrescrito: [],
        links: [{ start: 23, end: 26, href: "https://exemplo.org" }],
      },
      { tipo: "citacao", texto: "Uma citação recuada", ...semMarcas },
      { tipo: "codigo", texto: "const x = 1;" },
      {
        tipo: "tabela",
        linhas: [
          ["Coluna A", "Coluna B"],
          ["1", "2"],
        ],
      },
    ],
  },
  {
    pagina: 18,
    rotulo: "2",
    blocos: [{ tipo: "paragrafo", texto: "Segunda página do livro", ...semMarcas }],
  },
];

test("markdown sai com estrutura e com o destaque no lugar", () => {
  const md = paraMarkdown(paginas, META);

  assert.match(md, /^# Livro de Teste/);
  assert.match(md, /## Primeiro capítulo/);
  assert.match(md, /O \*\*rato\*\* roeu a \*roupa\* do \[rei\]\(https:\/\/exemplo\.org\)/);
  assert.match(md, /> Uma citação recuada/);
  assert.match(md, /```\nconst x = 1;\n```/);
  assert.match(md, /\| Coluna A \| Coluna B \|/);
  assert.match(md, /\| --- \| --- \|/);
});

test("markdown anota a página do livro, e diz qual é a do arquivo", () => {
  const md = paraMarkdown(paginas, META);
  assert.match(md, /<!-- p\. 1 \(arquivo 17\) -->/);
  assert.match(md, /<!-- p\. 2 \(arquivo 18\) -->/);
});

test("markdown de página sem numeração própria não inventa parênteses", () => {
  const md = paraMarkdown([{ pagina: 5, rotulo: "5", blocos: paginas[1].blocos }], META);
  assert.match(md, /<!-- p\. 5 -->/);
  assert.ok(!md.includes("arquivo 5"));
});

test("epub é um zip válido, com mimetype primeiro e o texto dentro", async () => {
  const blob = await paraEpub(paginas, META);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  // A ordem importa: leitor de EPUB procura o mimetype como primeiro arquivo.
  assert.equal(Object.keys(zip.files)[0], "mimetype");
  assert.equal(await zip.file("mimetype").async("string"), "application/epub+zip");

  const container = await zip.file("META-INF/container.xml").async("string");
  assert.match(container, /OEBPS\/livro\.opf/);

  const opfXml = await zip.file("OEBPS/livro.opf").async("string");
  assert.match(opfXml, /<dc:title>Livro de Teste<\/dc:title>/);
  assert.match(opfXml, /<dc:creator>Alguém<\/dc:creator>/);

  const trecho = await zip.file("OEBPS/trecho-001.xhtml").async("string");
  assert.match(trecho, /<h2>Primeiro capítulo<\/h2>/);
  assert.match(trecho, /<strong>rato<\/strong>/);
  assert.match(trecho, /<em>roupa<\/em>/);
  assert.match(trecho, /<a href="https:\/\/exemplo\.org">rei<\/a>/);
  assert.match(trecho, /<blockquote><p>Uma citação recuada<\/p><\/blockquote>/);
});

test("epub leva a numeração do livro, não a do arquivo", async () => {
  const blob = await paraEpub(paginas, META);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const trecho = await zip.file("OEBPS/trecho-001.xhtml").async("string");
  // A página 17 do arquivo é a 1 do livro: é esse número que o leitor mostra.
  assert.match(trecho, /epub:type="pagebreak"[^>]*id="pg-17"[^>]*aria-label="1"/);

  const nav = await zip.file("OEBPS/nav.xhtml").async("string");
  assert.match(nav, /epub:type="page-list"/);
  assert.match(nav, /<a href="trecho-001\.xhtml#pg-17">1<\/a>/);
  assert.match(nav, /<a href="trecho-001\.xhtml">Primeiro capítulo<\/a>/);
});

test("texto com caractere de marcação não quebra nem o markdown nem o xhtml", async () => {
  const arriscado = [
    {
      pagina: 1,
      rotulo: null,
      blocos: [
        {
          tipo: "paragrafo",
          texto: "a < b & c * d _e_",
          negrito: [{ start: 0, end: 1 }],
          italico: [],
          sobrescrito: [],
          links: [],
        },
      ],
    },
  ];

  const md = paraMarkdown(arriscado, META);
  assert.match(md, /\*\*a\*\* < b & c \\\* d \\_e\\_/);

  const zip = await JSZip.loadAsync(await (await paraEpub(arriscado, META)).arrayBuffer());
  const trecho = await zip.file("OEBPS/trecho-001.xhtml").async("string");
  assert.match(trecho, /<strong>a<\/strong> &lt; b &amp; c \* d _e_/);
});
