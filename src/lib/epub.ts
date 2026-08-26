/**
 * Leitura de EPUB.
 *
 * EPUB é um zip com um XML de índice (o OPF) apontando pra uma sequência de
 * arquivos XHTML. Cada arquivo desses é um "capítulo" — e é ele que faz o papel
 * de página aqui: progresso, marcador e marcação continuam sendo guardados por
 * número, só que o número agora é a posição no sumário do livro em vez da folha
 * do PDF.
 *
 * O que depende do navegador (DOMParser, object URL) entra por parâmetro, então
 * essa lógica pode ser conferida fora dele.
 */

import JSZip from "jszip";
import { ajustar, type ItemSumario } from "@/lib/sumario";
import { ERRO, ErroApp } from "@/lib/erros";

/** Converte texto XML/XHTML em documento. Injetado pra não amarrar no DOMParser. */
export type Analisador = (texto: string, tipo: "xml" | "xhtml") => Document;

export type Capitulo = {
  /** Caminho do arquivo dentro do zip, já resolvido. */
  href: string;
  id: string;
};

export type EpubAberto = {
  /** `null` quando o arquivo não declara título — aí quem chama usa o nome dele. */
  titulo: string | null;
  autor: string | null;
  /** Capítulos na ordem de leitura (a "lombada" do EPUB). */
  capitulos: Capitulo[];
  /** Sumário do livro, com a página apontando pro capítulo (1 = o primeiro). */
  sumario: ItemSumario[];
  /** Caminho da imagem de capa dentro do zip, se o livro declarar uma. */
  capa: string | null;
  /** Conteúdo de texto de um arquivo do zip. */
  lerTexto(caminho: string): Promise<string | null>;
  /** Conteúdo binário de um arquivo do zip (imagem, fonte...). */
  lerBinario(caminho: string, tipoMime?: string): Promise<Blob | null>;
  /** Tipo declarado no manifesto — serve pra montar o Blob da imagem. */
  tipoDe(caminho: string): string | undefined;
};

/**
 * Elementos pelo nome local, sem ligar pra prefixo nem namespace.
 *
 * EPUB no mundo real vem escrito de todo jeito: `<dc:title>` num livro,
 * `<title>` com xmlns padrão no outro, `<opf:item>` num terceiro. Procurar pelo
 * nome qualificado erra em metade deles; pelo nome local, acerta em todos.
 */
function porNome(raiz: Document | Element, nome: string): Element[] {
  const alvo = nome.toLowerCase();
  const saida: Element[] = [];

  // Caminhada manual em vez de getElementsByTagName("*"): o curinga tem suporte
  // irregular fora do navegador, e percorrer filho a filho funciona em todo lugar.
  const visitar = (el: Element) => {
    if (nomeLocal(el) === alvo) saida.push(el);
    for (const filho of Array.from(el.children)) visitar(filho);
  };

  const inicio = "documentElement" in raiz ? raiz.documentElement : raiz;
  if (inicio) visitar(inicio);
  return saida;
}

/** Nome da tag sem prefixo e em minúsculas — `dc:title`, `DC:Title` e `title` viram o mesmo. */
function nomeLocal(el: Element): string {
  return (el.localName || el.tagName || "").toLowerCase().replace(/^.*:/, "");
}

/**
 * Junta um caminho relativo a um caminho base, do jeito do zip: sem barra na
 * frente, com "." e ".." resolvidos. (`new URL` não serve — o zip não tem host.)
 */
export function resolverCaminho(base: string, relativo: string): string {
  if (!relativo) return "";
  const alvo = relativo.split("#")[0].split("?")[0];
  if (!alvo) return "";
  const pedacos = alvo.startsWith("/")
    ? alvo.slice(1).split("/")
    : [...base.split("/").slice(0, -1), ...alvo.split("/")];

  const pilha: string[] = [];
  for (const p of pedacos) {
    if (!p || p === ".") continue;
    if (p === "..") pilha.pop();
    else pilha.push(p);
  }
  return pilha.join("/").replace(/%20/g, " ");
}

/** Abre o arquivo e lê o índice — o conteúdo dos capítulos vem depois, sob demanda. */
export async function abrirEpub(
  dado: ArrayBuffer | Blob | Uint8Array,
  analisar: Analisador,
  /**
   * Como chamar um capítulo quando o livro não traz sumário e nem título nenhum.
   *
   * Vem de fora porque este módulo é código puro — roda no teste, sem React e
   * sem dicionário. Quem abre o EPUB na tela passa a frase no idioma da pessoa;
   * o padrão em inglês é o mesmo padrão do app.
   */
  rotuloCapitulo: (n: number) => string = (n) => `Chapter ${n}`,
): Promise<EpubAberto> {
  const zip = await JSZip.loadAsync(dado as ArrayBuffer);

  const lerTexto = async (caminho: string): Promise<string | null> => {
    const arquivo = zip.file(caminho);
    return arquivo ? arquivo.async("string") : null;
  };

  const container = await lerTexto("META-INF/container.xml");
  if (!container) throw new ErroApp(ERRO.epubInvalido);

  const caminhoOpf = acharOpf(analisar(container, "xml"));
  if (!caminhoOpf) throw new Error("EPUB sem índice (OPF) declarado.");

  const opfBruto = await lerTexto(caminhoOpf);
  if (!opfBruto) throw new ErroApp(ERRO.epubSemOpf);

  const opf = lerOpf(analisar(opfBruto, "xml"), caminhoOpf);

  const sumario = await lerSumario(opf, lerTexto, analisar, rotuloCapitulo);

  return {
    titulo: opf.titulo,
    autor: opf.autor,
    capitulos: opf.capitulos,
    sumario: ajustar(sumario, opf.capitulos.length),
    capa: opf.capa,
    lerTexto,
    async lerBinario(caminho, tipoMime) {
      const arquivo = zip.file(caminho);
      if (!arquivo) return null;
      const dados = await arquivo.async("blob");
      const tipo = tipoMime ?? opf.tipos.get(caminho);
      return tipo ? new Blob([dados], { type: tipo }) : dados;
    },
    tipoDe: (caminho) => opf.tipos.get(caminho),
  };
}

function acharOpf(doc: Document): string | null {
  for (const r of porNome(doc, "rootfile")) {
    const caminho = r.getAttribute("full-path");
    if (caminho) return caminho.replace(/^\//, "");
  }
  return null;
}

type Opf = {
  titulo: string | null;
  autor: string | null;
  capitulos: Capitulo[];
  capa: string | null;
  /** Caminho do arquivo de sumário: o nav do EPUB 3 ou o NCX do EPUB 2. */
  nav: string | null;
  ncx: string | null;
  /** Caminho no zip → media-type declarado no manifesto. */
  tipos: Map<string, string>;
};

function lerOpf(doc: Document, caminhoOpf: string): Opf {
  const texto = (nome: string): string | null => {
    for (const el of porNome(doc, nome)) {
      const v = el.textContent?.trim();
      if (v) return v;
    }
    return null;
  };

  // manifesto: id → { href resolvido, media-type, properties }
  const porId = new Map<string, { href: string; tipo: string; props: string }>();
  const tipos = new Map<string, string>();
  for (const item of porNome(doc, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    const caminho = resolverCaminho(caminhoOpf, href);
    const tipo = item.getAttribute("media-type") ?? "";
    porId.set(id, { href: caminho, tipo, props: item.getAttribute("properties") ?? "" });
    if (tipo) tipos.set(caminho, tipo);
  }

  // lombada: a ordem de leitura
  const capitulos: Capitulo[] = [];
  for (const ref of porNome(doc, "itemref")) {
    const id = ref.getAttribute("idref");
    if (!id) continue;
    // linear="no" é material auxiliar (notas, propaganda) — fora da leitura corrida
    if (ref.getAttribute("linear") === "no") continue;
    const item = porId.get(id);
    if (item?.href) capitulos.push({ id, href: item.href });
  }

  // sumário: nav (EPUB 3) tem prioridade sobre NCX (EPUB 2)
  let nav: string | null = null;
  for (const item of porId.values()) {
    if (item.props.split(/\s+/).includes("nav")) nav = item.href;
  }
  let ncx: string | null = null;
  for (const el of porNome(doc, "spine")) {
    const id = el.getAttribute("toc");
    if (id && porId.has(id)) ncx = porId.get(id)!.href;
  }
  if (!ncx) {
    for (const item of porId.values()) {
      if (item.tipo === "application/x-dtbncx+xml") ncx = item.href;
    }
  }

  return {
    titulo: texto("title"),
    autor: texto("creator"),
    capitulos,
    capa: acharCapa(doc, porId),
    nav,
    ncx,
    tipos,
  };
}

function acharCapa(
  doc: Document,
  porId: Map<string, { href: string; tipo: string; props: string }>,
): string | null {
  // EPUB 3: o próprio item se declara capa
  for (const item of porId.values()) {
    if (item.props.split(/\s+/).includes("cover-image")) return item.href;
  }
  // EPUB 2: <meta name="cover" content="id-do-item">
  for (const meta of porNome(doc, "meta")) {
    if (meta.getAttribute("name") === "cover") {
      const alvo = porId.get(meta.getAttribute("content") ?? "");
      if (alvo) return alvo.href;
    }
  }
  // último recurso: primeira imagem cujo id ou arquivo se chama "capa"/"cover"
  for (const [id, item] of porId) {
    if (item.tipo.startsWith("image/") && /cover|capa/i.test(id + item.href)) {
      return item.href;
    }
  }
  return null;
}

/** Sumário do livro: tenta o nav do EPUB 3, cai pro NCX do EPUB 2. */
async function lerSumario(
  opf: Opf,
  lerTexto: (caminho: string) => Promise<string | null>,
  analisar: Analisador,
  rotuloCapitulo: (n: number) => string,
): Promise<ItemSumario[]> {
  const indice = new Map<string, number>();
  opf.capitulos.forEach((c, i) => indice.set(c.href, i + 1));

  if (opf.nav) {
    const bruto = await lerTexto(opf.nav);
    if (bruto) {
      const itens = lerNav(analisar(bruto, "xhtml"), opf.nav, indice);
      if (itens.length) return itens;
    }
  }
  if (opf.ncx) {
    const bruto = await lerTexto(opf.ncx);
    if (bruto) {
      const itens = lerNcx(analisar(bruto, "xml"), opf.ncx, indice);
      if (itens.length) return itens;
    }
  }
  // Sem sumário declarado, a lombada já é uma navegação: um item por capítulo.
  return opf.capitulos.map((c, i) => ({
    titulo: rotuloCapitulo(i + 1),
    nivel: 1,
    pagina: i + 1,
  }));
}

/** EPUB 3: `<nav epub:type="toc">` com listas aninhadas — o aninhamento dá o nível. */
export function lerNav(
  doc: Document,
  caminhoNav: string,
  indice: Map<string, number>,
): ItemSumario[] {
  const navs = porNome(doc, "nav");
  const toc =
    navs.find((n) =>
      (n.getAttribute("epub:type") ?? n.getAttribute("type") ?? "")
        .split(/\s+/)
        .includes("toc"),
    ) ?? navs[0];
  if (!toc) return [];

  const itens: ItemSumario[] = [];
  const percorrer = (lista: Element, nivel: number) => {
    for (const li of Array.from(lista.children)) {
      if (nomeLocal(li) !== "li") continue;
      const a = Array.from(li.children).find((c) => ["a", "span"].includes(nomeLocal(c)));
      const titulo = a?.textContent?.trim() ?? "";
      const href = a?.getAttribute("href") ?? "";
      if (titulo) {
        itens.push({
          titulo,
          nivel: Math.min(3, nivel),
          pagina: indice.get(resolverCaminho(caminhoNav, href)) ?? null,
        });
      }
      for (const filho of Array.from(li.children)) {
        if (["ol", "ul"].includes(nomeLocal(filho))) percorrer(filho, nivel + 1);
      }
    }
  };

  for (const lista of Array.from(toc.children)) {
    if (["ol", "ul"].includes(nomeLocal(lista))) percorrer(lista, 1);
  }
  return itens;
}

/** EPUB 2: NCX, com `<navPoint>` aninhado. */
export function lerNcx(
  doc: Document,
  caminhoNcx: string,
  indice: Map<string, number>,
): ItemSumario[] {
  const mapas = porNome(doc, "navMap");
  if (!mapas.length) return [];

  const itens: ItemSumario[] = [];
  const percorrer = (pai: Element, nivel: number) => {
    for (const ponto of Array.from(pai.children)) {
      if (nomeLocal(ponto) !== "navpoint") continue;
      // Só o rótulo do próprio ponto — sem isso, um navPoint aninhado emprestaria
      // o título do filho pro pai.
      const titulo = porNome(ponto, "text")[0]?.textContent?.trim() ?? "";
      const href = porNome(ponto, "content")[0]?.getAttribute("src") ?? "";
      if (titulo) {
        itens.push({
          titulo,
          nivel: Math.min(3, nivel),
          pagina: indice.get(resolverCaminho(caminhoNcx, href)) ?? null,
        });
      }
      percorrer(ponto, nivel + 1);
    }
  };

  percorrer(mapas[0], 1);
  return itens;
}

/** O analisador de verdade, no navegador. */
export function analisadorDoNavegador(): Analisador {
  const dp = new DOMParser();
  return (texto, tipo) =>
    dp.parseFromString(texto, tipo === "xml" ? "application/xml" : "application/xhtml+xml");
}
