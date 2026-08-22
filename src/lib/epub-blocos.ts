/**
 * XHTML de um capítulo de EPUB → os mesmos blocos do modo texto do PDF.
 *
 * A vantagem sobre o PDF é que aqui a estrutura já está escrita: `<h2>` é
 * título, `<blockquote>` é citação, `<pre>` é código. Nada de adivinhar por
 * fonte e coordenada. O trabalho é traduzir isso pro formato que o leitor já
 * sabe desenhar — e, de quebra, ganhar marcação, sumário e progresso de graça.
 */

import { acharLinks, type Bloco, type Elo, type Faixa } from "@/lib/pdf-blocos";

/** Texto de um trecho, com negrito, itálico e endereços clicáveis dentro dele. */
export type Destaques = {
  texto: string;
  negrito: Faixa[];
  italico: Faixa[];
  links: Elo[];
};

/** O que fazer com uma imagem: devolver a URL pra exibir, ou `null` pra ignorar. */
export type ResolvedorDeImagem = (src: string) => { url: string } | null;

/** Em que "moldura" o texto está: muda o tipo do bloco, não o conteúdo. */
type Contexto = "normal" | "citacao" | "nota";

/** Bloco de texto conforme a moldura em que ele apareceu. */
function tipoDe(contexto: Contexto): "paragrafo" | "citacao" | "nota" {
  return contexto === "normal" ? "paragrafo" : contexto;
}

/**
 * Nota de rodapé declarada pelo próprio livro.
 *
 * O EPUB 3 marca com `epub:type="footnote"` (ou endnote/rearnote) e o ARIA
 * equivalente é `role="doc-footnote"`. Vale a pena confiar nisso: é o autor do
 * livro dizendo o que é nota, sem precisar adivinhar por tamanho de letra como
 * no PDF.
 */
function ehNota(el: Element): boolean {
  const tipo = `${el.getAttribute("epub:type") ?? ""} ${el.getAttribute("type") ?? ""}`;
  if (/\b(foot|end|rear)note\b/.test(tipo)) return true;
  const papel = el.getAttribute("role") ?? "";
  return /\bdoc-(foot|end)note\b/.test(papel);
}

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

/** Peso: vira <strong> no reflow. */
const NEGRITO = new Set(["strong", "b", "mark"]);
/** Ênfase e nome de obra: viram <em>. */
const ITALICO = new Set(["em", "i", "cite", "var", "dfn", "address"]);

/** Converte um capítulo inteiro em blocos, na ordem em que aparecem. */
export function blocosDoCapitulo(
  doc: Document,
  imagem: ResolvedorDeImagem,
): Bloco[] {
  const corpo = doc.getElementsByTagName("body")[0] ?? doc.documentElement;
  if (!corpo) return [];

  const blocos: Bloco[] = [];
  percorrer(corpo, blocos, imagem, "normal");
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
  contexto: Contexto,
) {
  let solto: Node[] = [];

  const fechar = () => {
    if (!solto.length) return;
    const { texto, negrito, italico, links } = destaquesDeNos(solto);
    solto = [];
    if (texto) {
      blocos.push({ tipo: tipoDe(contexto), texto, negrito, italico, links });
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
      percorrer(filho, blocos, imagem, "citacao");
      continue;
    }

    if (nome === "li") {
      lerItemDeLista(filho, blocos, imagem, contexto);
      continue;
    }

    if (nome === "dt") {
      // Termo de uma lista de definição: é o título da entrada, então vai em negrito.
      const { texto, italico, links } = comDestaques(filho);
      if (texto) {
        blocos.push({
          tipo: tipoDe(contexto),
          texto,
          negrito: [{ start: 0, end: texto.length }],
          italico,
          links,
        });
      }
      continue;
    }

    // Nota declarada pelo livro vale mais que a moldura em que ela estiver.
    const aqui: Contexto = ehNota(filho) ? "nota" : contexto;

    // Contêiner (div, section, figure, ul...) ou folha de texto (p, dt, figcaption).
    if (temBlocoDentro(filho)) percorrer(filho, blocos, imagem, aqui);
    else {
      const { texto, negrito, italico, links } = comDestaques(filho);
      if (texto) blocos.push({ tipo: tipoDe(aqui), texto, negrito, italico, links });
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
  contexto: Contexto,
) {
  const proprios = Array.from(el.childNodes).filter(
    (n) => !(n.nodeType === 1 && ["ul", "ol", "dl"].includes((n as Element).tagName.toLowerCase())),
  );
  const { texto, negrito, italico, links } = destaquesDeNos(proprios);
  if (texto) {
    // O marcador entra na frente do texto, então as faixas andam dois caracteres.
    const desloca = <T extends Faixa>(f: T): T => ({ ...f, start: f.start + 2, end: f.end + 2 });
    blocos.push({
      tipo: tipoDe(contexto),
      texto: `• ${texto}`,
      negrito: negrito.map(desloca),
      italico: italico.map(desloca),
      links: links.map(desloca),
    });
  }
  for (const neto of Array.from(el.children)) {
    if (["ul", "ol", "dl"].includes(neto.tagName.toLowerCase())) {
      percorrer(neto, blocos, imagem, contexto);
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
export function comDestaques(el: Element): Destaques {
  return destaquesDeNos(Array.from(el.childNodes));
}

/** Mesma coisa, para uma sequência solta de nós (o texto entre dois blocos). */
export function destaquesDeNos(nos: Node[]): Destaques {
  let texto = "";
  const negrito: Faixa[] = [];
  const italico: Faixa[] = [];
  const links: Elo[] = [];

  // `jaEm` evita faixa dentro de faixa: <strong>a <em>b</em></strong> já está
  // todo em negrito, e abrir uma segunda faixa de negrito por dentro não muda nada.
  const visitar = (no: Node, jaEmNegrito: boolean, jaEmItalico: boolean) => {
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

    const ehNegrito = jaEmNegrito || NEGRITO.has(nome);
    const ehItalico = jaEmItalico || ITALICO.has(nome);
    const inicio = texto.length;
    for (const filho of Array.from(elemento.childNodes)) {
      visitar(filho, ehNegrito, ehItalico);
    }
    if (texto.length > inicio) {
      if (ehNegrito && !jaEmNegrito) negrito.push({ start: inicio, end: texto.length });
      if (ehItalico && !jaEmItalico) italico.push({ start: inicio, end: texto.length });
      if (nome === "a") {
        const href = hrefExterno(elemento.getAttribute("href"));
        if (href) links.push({ start: inicio, end: texto.length, href });
      }
    }
  };

  for (const no of nos) visitar(no, false, false);

  // Espaço do XHTML é livre: o que vale é o texto já normalizado, e as faixas
  // precisam andar junto com ele.
  return comAutolinks(normalizarEspacos(texto, negrito, italico, links));
}

/**
 * Junta os endereços escritos soltos aos que o livro já marcou com `<a>`.
 *
 * EPUB convertido de outro formato costuma deixar a URL como texto puro; sem
 * isso, o mesmo endereço seria clicável num livro e não no outro. O `<a>` de
 * verdade manda: só entra autolink onde não há link declarado por cima.
 */
function comAutolinks(d: Destaques): Destaques {
  const achados = acharLinks(d.texto).filter(
    (a) => !d.links.some((l) => a.start < l.end && l.start < a.end),
  );
  if (!achados.length) return d;
  return {
    ...d,
    links: [...d.links, ...achados].sort((a, b) => a.start - b.start),
  };
}

/**
 * Só endereço que sai do livro vira link.
 *
 * `#nota-3` e `cap4.xhtml` apontam pra dentro do próprio EPUB, e aqui não existe
 * o arquivo pra onde ir — clicar levaria a lugar nenhum. Esses continuam texto
 * comum, que é o que já eram.
 */
function hrefExterno(href: string | null): string | null {
  if (!href) return null;
  const limpo = href.trim();
  return /^(https?:|mailto:|tel:)/i.test(limpo) ? limpo : null;
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
  faixasNegrito: Faixa[],
  faixasItalico: Faixa[],
  faixasLinks: Elo[] = [],
): Destaques {
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

  const mover = <T extends Faixa>(faixas: T[]): T[] => {
    const saida: T[] = [];
    for (const f of faixas) {
      const start = mapa[Math.max(0, Math.min(bruto.length, f.start))];
      const end = mapa[Math.max(0, Math.min(bruto.length, f.end))];
      if (end > start) saida.push({ ...f, start, end });
    }
    return saida;
  };

  return {
    texto,
    negrito: mover(faixasNegrito),
    italico: mover(faixasItalico),
    links: mover(faixasLinks),
  };
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
