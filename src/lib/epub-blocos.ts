/**
 * XHTML de um capítulo de EPUB → os mesmos blocos do modo texto do PDF.
 *
 * A vantagem sobre o PDF é que aqui a estrutura já está escrita: `<h2>` é
 * título, `<blockquote>` é citação, `<pre>` é código. Nada de adivinhar por
 * fonte e coordenada. O trabalho é traduzir isso pro formato que o leitor já
 * sabe desenhar — e, de quebra, ganhar marcação, sumário e progresso de graça.
 */

import type { Bloco, Faixa } from "@/lib/pdf-blocos";

/** O que fazer com uma imagem: devolver a URL pra exibir, ou `null` pra ignorar. */
export type ResolvedorDeImagem = (src: string) => { url: string } | null;

const IGNORADAS = new Set([
  "script",
  "style",
  "head",
  "nav",
  "template",
  "svg",
  "audio",
  "video",
  "iframe",
  "form",
]);

const DESTAQUE = new Set(["strong", "b", "em", "i", "mark", "dfn"]);

/** Converte um capítulo inteiro em blocos, na ordem em que aparecem. */
export function blocosDoCapitulo(
  doc: Document,
  imagem: ResolvedorDeImagem,
): Bloco[] {
  const corpo = doc.getElementsByTagName("body")[0] ?? doc.documentElement;
  if (!corpo) return [];

  const blocos: Bloco[] = [];
  percorrer(corpo, blocos, imagem, false);
  return blocos.filter(
    (b) =>
      b.tipo === "imagem" ||
      b.tipo === "tabela" ||
      (b.texto.trim().length > 0),
  );
}

/** Elementos que valem por si — encerram o parágrafo corrente e viram bloco. */
const BLOCOS = new Set([
  "p", "div", "section", "article", "aside", "header", "footer", "main",
  "ul", "ol", "dl", "li", "dt", "dd", "blockquote", "pre", "table", "figure",
  "figcaption", "hr", "img", "image",
]);

function ehBloco(no: Node): boolean {
  if (no.nodeType !== 1) return false;
  const nome = (no as Element).tagName.toLowerCase();
  return /^h[1-6]$/.test(nome) || BLOCOS.has(nome);
}

/**
 * Percorre os nós na ordem em que aparecem, juntando o texto solto entre blocos.
 *
 * Anda por `childNodes`, não por `children`, de propósito: tem EPUB que escreve
 * `<div>Uma frase<p>Outra</p></div>`, e olhar só pros elementos perderia a
 * primeira frase sem avisar.
 */
function percorrer(
  el: Element,
  blocos: Bloco[],
  imagem: ResolvedorDeImagem,
  dentroDeCitacao: boolean,
) {
  let solto: Node[] = [];

  const fechar = () => {
    if (!solto.length) return;
    const { texto, negrito } = destaquesDeNos(solto);
    solto = [];
    if (texto) {
      blocos.push({ tipo: dentroDeCitacao ? "citacao" : "paragrafo", texto, negrito });
    }
  };

  for (const no of Array.from(el.childNodes)) {
    if (!ehBloco(no)) {
      solto.push(no);
      continue;
    }
    fechar();

    const filho = no as Element;
    const nome = filho.tagName.toLowerCase();
    if (IGNORADAS.has(nome)) continue;

    if (/^h[1-6]$/.test(nome)) {
      const texto = textoLimpo(filho);
      // h1..h3 viram os três níveis; h4+ continua sendo subtítulo (3).
      if (texto) blocos.push({ tipo: "titulo", nivel: nivelDe(nome), texto });
      continue;
    }

    if (nome === "hr") continue;

    if (nome === "pre") {
      const texto = (filho.textContent ?? "").replace(/\s+$/, "");
      if (texto.trim()) blocos.push({ tipo: "codigo", texto });
      continue;
    }

    if (nome === "table") {
      const tabela = lerTabela(filho);
      if (tabela) blocos.push(tabela);
      continue;
    }

    if (nome === "img" || nome === "image") {
      const bloco = lerImagem(filho, imagem);
      if (bloco) blocos.push(bloco);
      continue;
    }

    if (nome === "blockquote") {
      // A citação é o próprio recuo: o conteúdo dela entra marcado como citação.
      percorrer(filho, blocos, imagem, true);
      continue;
    }

    if (nome === "li") {
      lerItemDeLista(filho, blocos, imagem, dentroDeCitacao);
      continue;
    }

    if (nome === "dt") {
      // Termo de uma lista de definição: é o título da entrada, então vai em negrito.
      const { texto } = comDestaques(filho);
      if (texto) {
        blocos.push({
          tipo: dentroDeCitacao ? "citacao" : "paragrafo",
          texto,
          negrito: [{ start: 0, end: texto.length }],
        });
      }
      continue;
    }

    // Contêiner (div, section, figure, ul...) ou folha de texto (p, dt, figcaption).
    if (temBlocoDentro(filho)) percorrer(filho, blocos, imagem, dentroDeCitacao);
    else {
      const { texto, negrito } = comDestaques(filho);
      if (texto) {
        blocos.push({
          tipo: dentroDeCitacao ? "citacao" : "paragrafo",
          texto,
          negrito,
        });
      }
    }
  }

  fechar();
}

/**
 * Item de lista: o texto do próprio item ganha marcador na frente, e a sub-lista
 * segue depois — assim o aninhamento não vira uma pilha de parágrafos soltos.
 * (Só `<li>` chega aqui: `<dd>` é continuação de um termo e não leva marcador.)
 */
function lerItemDeLista(
  el: Element,
  blocos: Bloco[],
  imagem: ResolvedorDeImagem,
  dentroDeCitacao: boolean,
) {
  const proprios = Array.from(el.childNodes).filter(
    (n) => !(n.nodeType === 1 && ["ul", "ol", "dl"].includes((n as Element).tagName.toLowerCase())),
  );
  const { texto, negrito } = destaquesDeNos(proprios);
  if (texto) {
    blocos.push({
      tipo: dentroDeCitacao ? "citacao" : "paragrafo",
      texto: `• ${texto}`,
      negrito: negrito.map((f) => ({ start: f.start + 2, end: f.end + 2 })),
    });
  }
  for (const neto of Array.from(el.children)) {
    if (["ul", "ol", "dl"].includes(neto.tagName.toLowerCase())) {
      percorrer(neto, blocos, imagem, dentroDeCitacao);
    }
  }
}

function nivelDe(tag: string): 1 | 2 | 3 {
  const n = Number(tag.slice(1));
  return (n <= 1 ? 1 : n === 2 ? 2 : 3) as 1 | 2 | 3;
}

/** Tem filho que já é bloco por si? Então esse elemento é só um contêiner. */
function temBlocoDentro(el: Element): boolean {
  return Array.from(el.children).some(ehBloco);
}

/**
 * Texto do elemento com os trechos em destaque anotados por posição.
 *
 * O leitor guarda marcação por índice de caractere dentro do bloco, então
 * `negrito` precisa cair exatamente sobre o texto que sai daqui.
 */
export function comDestaques(el: Element): { texto: string; negrito: Faixa[] } {
  return destaquesDeNos(Array.from(el.childNodes));
}

/** Mesma coisa, para uma sequência solta de nós (o texto entre dois blocos). */
export function destaquesDeNos(nos: Node[]): { texto: string; negrito: Faixa[] } {
  let texto = "";
  const negrito: Faixa[] = [];

  const visitar = (no: Node, destacando: boolean) => {
    if (no.nodeType === 3) {
      texto += no.nodeValue ?? "";
      return;
    }
    if (no.nodeType !== 1) return;

    const elemento = no as Element;
    const nome = elemento.tagName.toLowerCase();
    if (IGNORADAS.has(nome)) return;
    if (nome === "br") {
      texto += " ";
      return;
    }

    const destaque = destacando || DESTAQUE.has(nome);
    const inicio = texto.length;
    for (const filho of Array.from(elemento.childNodes)) visitar(filho, destaque);
    if (destaque && !destacando && texto.length > inicio) {
      negrito.push({ start: inicio, end: texto.length });
    }
  };

  for (const no of nos) visitar(no, false);

  // Espaço do XHTML é livre: o que vale é o texto já normalizado, e as faixas
  // precisam andar junto com ele.
  return normalizarEspacos(texto, negrito);
}

/**
 * Junta espaço repetido e apara as pontas, corrigindo as faixas de destaque pra
 * continuarem apontando pros mesmos caracteres.
 *
 * No XHTML a quebra de linha do arquivo é só formatação do código-fonte; sem
 * essa normalização, "Data <strong>Management</strong>" viraria um bloco cheio
 * de espaço solto e o negrito cairia no lugar errado.
 */
export function normalizarEspacos(
  bruto: string,
  faixas: Faixa[],
): { texto: string; negrito: Faixa[] } {
  // mapa[i] = onde o caractere i do texto bruto foi parar no texto final
  const mapa = new Int32Array(bruto.length + 1);
  let texto = "";
  let espacoPendente = false;

  for (let i = 0; i < bruto.length; i++) {
    const c = bruto[i];
    if (/\s/.test(c)) {
      mapa[i] = texto.length;
      // Espaço antes de qualquer letra é margem do arquivo, não do texto.
      espacoPendente = texto.length > 0;
      continue;
    }
    if (espacoPendente) {
      texto += " ";
      espacoPendente = false;
    }
    mapa[i] = texto.length;
    texto += c;
  }
  mapa[bruto.length] = texto.length;
  // Espaço pendente no fim nunca é escrito, então `texto` já sai aparado dos dois lados.

  const negrito: Faixa[] = [];
  for (const f of faixas) {
    const start = mapa[Math.max(0, Math.min(bruto.length, f.start))];
    const end = mapa[Math.max(0, Math.min(bruto.length, f.end))];
    if (end > start) negrito.push({ start, end });
  }

  return { texto, negrito };
}

function textoLimpo(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function lerTabela(el: Element): Bloco | null {
  const linhas: string[][] = [];
  for (const tr of Array.from(el.getElementsByTagName("tr"))) {
    const celulas: string[] = [];
    for (const c of Array.from(tr.children)) {
      const nome = c.tagName.toLowerCase();
      if (nome === "td" || nome === "th") celulas.push(textoLimpo(c));
    }
    if (celulas.some((c) => c)) linhas.push(celulas);
  }
  return linhas.length ? { tipo: "tabela", linhas } : null;
}

function lerImagem(el: Element, imagem: ResolvedorDeImagem): Bloco | null {
  const src =
    el.getAttribute("src") ??
    el.getAttribute("xlink:href") ??
    el.getAttribute("href") ??
    "";
  if (!src) return null;
  const achada = imagem(src);
  if (!achada) return null;

  // Largura/altura declaradas são só uma dica: o CSS já limita a imagem à
  // coluna de leitura, então zero aqui não quebra nada.
  return {
    tipo: "imagem",
    url: achada.url,
    largura: Number(el.getAttribute("width")) || 0,
    altura: Number(el.getAttribute("height")) || 0,
  };
}
