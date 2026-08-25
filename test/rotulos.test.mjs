/**
 * A numeração impressa do livro, conferida contra um PDF de mentira.
 *
 * O livro montado aqui é o caso que quebra na vida real: capa e rosto sem número
 * nenhum, abertura numerada em romano, e o "1" impresso só lá pela página 17 do
 * arquivo. O que se testa é justamente o encaixe — nenhuma dessas páginas é o
 * que o arquivo diz que é.
 *
 * Rode com `npm test` (o `pretest` compila `src/lib` pro node).
 */
import test from "node:test";
import assert from "node:assert/strict";

import { remontarPagina } from "../node_modules/.cache/teste/lib/pdf-blocos.mjs";
import {
  montarRotulos,
  numeracaoPropria,
  paginaDoRotulo,
  rotuloDaPagina,
} from "../node_modules/.cache/teste/lib/pdf-rotulos.mjs";

const LARGURA = 612;
const CORPO = 12;

/**
 * Uma página de livro: linhas de texto corrido e, opcionalmente, o número
 * impresso no pé — em corpo menor e separado do texto por um vão, que é
 * exatamente o que a detecção de mobília procura.
 */
function paginaFalsa({ folio = null, linhas = 22 } = {}) {
  const itens = [];
  for (let i = 0; i < linhas; i++) {
    itens.push({
      texto: `linha ${i} de texto corrido do miolo do livro que segue por aqui`,
      x: 72,
      y: 700 - i * 14,
      w: 430,
      alt: CORPO,
      fonte: "corpo",
      mono: false,
      italico: false,
      espaco: false,
    });
  }

  if (folio !== null) {
    itens.push({
      texto: String(folio),
      x: 300,
      y: 700 - (linhas - 1) * 14 - 46, // vão bem maior que o entrelinhas
      w: 14,
      alt: CORPO - 2,
      fonte: "corpo",
      mono: false,
      italico: false,
      espaco: false,
    });
  }

  return itens;
}

/**
 * O mínimo de `PDFDocumentProxy` que a varredura usa: contagem, viewport e texto.
 *
 * `quebrada` diz quais páginas estouram na leitura — é o PDF corrompido, ou a
 * rede caindo no meio do streaming.
 */
function docFalso(folioDe, numPages, { rotulosDeclarados = null, quebrada = () => false } = {}) {
  return {
    numPages,
    getPageLabels: async () => rotulosDeclarados,
    getPage: async (n) => ({
      getViewport: () => ({ width: LARGURA }),
      getTextContent: async () => ({
        styles: {},
        items: paginaFalsa({ folio: folioDe(n) }).map((i) => ({
          str: i.texto,
          transform: [1, 0, 0, i.alt, i.x, i.y],
          width: i.w,
          height: i.alt,
          fontName: i.fonte,
        })),
      }),
      // depois do normal, pra sobrescrever: página quebrada estoura na leitura
      ...(quebrada(n)
        ? {
            getTextContent: async () => {
              throw new Error("página não abriu");
            },
          }
        : {}),
    }),
  };
}

/**
 * O livro do teste: 1–4 sem número (capa, rosto, créditos), 5–16 em romano
 * (v a xvi), 17 em diante em arábico começando do 1.
 */
const folioDoLivro = (n) => {
  if (n <= 4) return null;
  if (n <= 16) return romano(n);
  return String(n - 16);
};

function romano(n) {
  const tabela = [
    [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"],
    [100, "c"], [90, "xc"], [50, "l"], [40, "xl"],
    [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
  ];
  let resto = n;
  let saida = "";
  for (const [valor, letra] of tabela) {
    while (resto >= valor) {
      saida += letra;
      resto -= valor;
    }
  }
  return saida;
}

test("o número impresso é lido do pé da página, e não vira parágrafo", () => {
  const { colunas, folio } = remontarPagina(paginaFalsa({ folio: 37 }), LARGURA);
  assert.equal(folio, "37");

  const texto = colunas.flat().map((p) => p.bloco.texto ?? "");
  assert.ok(!texto.includes("37"), "o folio não pode sobrar no meio do texto");
});

test("página sem número impresso não inventa nenhum", () => {
  assert.equal(remontarPagina(paginaFalsa({ folio: null }), LARGURA).folio, null);
});

test("o deslocamento do livro é descoberto pela varredura", async () => {
  const varredura = await montarRotulos(docFalso(folioDoLivro, 200));
  assert.equal(varredura.fim, "achou");
  const { rotulos } = varredura;

  assert.ok(rotulos, "devia ter achado a numeração");
  assert.equal(rotulos.fonte, "texto");
  assert.equal(rotulos.inicioArabico, 17, "o 1 impresso está na página 17 do arquivo");

  // O encaixe: o que o livro chama de 1 e de 84.
  assert.equal(rotuloDaPagina(rotulos, 17), "1");
  assert.equal(rotuloDaPagina(rotulos, 100), "84");
  // E a abertura continua em romano.
  assert.equal(rotuloDaPagina(rotulos, 5), "v");
  assert.equal(rotuloDaPagina(rotulos, 16), "xvi");

  // O caminho de volta é o que o campo "ir para a página" usa.
  assert.equal(paginaDoRotulo(rotulos, "84"), 100);
  assert.equal(paginaDoRotulo(rotulos, "xvi"), 16);
  assert.equal(paginaDoRotulo(rotulos, "9999"), null);

  assert.equal(numeracaoPropria(rotulos), true);
});

test("número solto em página avulsa não desloca o livro inteiro", async () => {
  // Uma página do miolo com um número que não é folio (ano numa tabela, nota).
  const comRuido = (n) => (n === 60 ? "1987" : folioDoLivro(n));
  const { rotulos } = await montarRotulos(docFalso(comRuido, 200));

  assert.ok(rotulos);
  assert.equal(rotulos.inicioArabico, 17, "a moda da amostra ignora o número solto");
  assert.equal(rotuloDaPagina(rotulos, 100), "84");
});

test("livro em que o arquivo já bate com a numeração não vira caso especial", async () => {
  const { rotulos } = await montarRotulos(docFalso((n) => String(n), 120));
  // Achou (o deslocamento é zero), mas não é "numeração própria" — a tela segue
  // mostrando um número só.
  assert.equal(numeracaoPropria(rotulos), false);
});

test("livro sem número nenhum impresso não inventa numeração", async () => {
  const varredura = await montarRotulos(docFalso(() => null, 120));
  assert.equal(varredura.fim, "sem-numeracao", "varreu inteiro: é resposta, e final");
});

test("varredura cancelada no meio não vira 'este livro não numera'", async () => {
  const controle = new AbortController();
  controle.abort();
  const varredura = await montarRotulos(docFalso(folioDoLivro, 200), {
    sinal: controle.signal,
  });

  // A diferença que importa: `incompleta` não é resposta, então não fica
  // guardada como final — quem cancelou vai varrer de novo na próxima abertura.
  assert.equal(varredura.fim, "incompleta");
});

test("amostra que não deu pra ler não vira 'este livro não numera'", async () => {
  // Metade das páginas estourando: a dedução até chegaria a "sem numeração",
  // mas a evidência não existe — foi o que fazia o mesmo livro contar 708
  // páginas num aparelho e 697 no outro.
  const varredura = await montarRotulos(
    docFalso(folioDoLivro, 200, { quebrada: (n) => n % 2 === 0 }),
  );

  assert.equal(varredura.fim, "incompleta");
});

test("os rótulos declarados pelo PDF ganham da varredura", async () => {
  const declarados = Array.from({ length: 30 }, (_, i) =>
    i < 10 ? romano(i + 1) : String(i - 9),
  );
  const { rotulos } = await montarRotulos(docFalso(folioDoLivro, 30, {
    rotulosDeclarados: declarados,
  }));

  assert.equal(rotulos.fonte, "pdf");
  assert.equal(rotulos.inicioArabico, 11);
  assert.equal(rotuloDaPagina(rotulos, 11), "1");
});
