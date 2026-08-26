import type JSZip from "jszip";
import type { Bloco, Elo, Faixa } from "@/lib/pdf-blocos";

/**
 * O livro remontado saindo do app — em Markdown ou em EPUB.
 *
 * A remontagem já sabe o que é título, parágrafo, citação, código e tabela; o
 * que faltava era deixar isso sair. É a diferença entre um leitor e uma
 * ferramenta: dá pra levar o livro pro Obsidian, pro Kindle, pro que for.
 *
 * O EPUB sai com marca de página (`epub:type="pagebreak"`) usando a numeração
 * impressa do livro — então citar "página 87" continua valendo depois de
 * converter, que é justamente o que se perde numa conversão comum.
 */
export type PaginaExportada = {
  /** Página do arquivo. */
  pagina: number;
  /** Número impresso no livro, quando ele tem. */
  rotulo: string | null;
  blocos: Bloco[];
};

export type MetaLivro = {
  titulo: string;
  autor: string | null;
  /**
   * Idioma do arquivo gerado (`dc:language`, `lang=`).
   *
   * Não é o idioma do livro — que a gente não sabe — e sim o de quem exportou.
   * É o palpite disponível, e é o que faz o leitor de EPUB hifenizar e ordenar
   * como a pessoa espera em vez de assumir inglês.
   */
  idioma: string;
  /** As poucas palavras que o próprio arquivo carrega, já traduzidas. */
  textos: {
    /** Título da navegação ("Sumário"). */
    sumario: string;
    /** Título da lista de páginas ("Páginas"). */
    paginas: string;
    /** Nome de um trecho sem título, com `{n}` no lugar do número. */
    trecho: string;
  };
};

/* ----------------------------------------------------------- Markdown */

/**
 * Livro inteiro em Markdown, com a página anotada como `[p. 87]`.
 *
 * A marca de página é o motivo de isto existir pra estudo: sem ela, o texto
 * exportado não serve pra citar nada. Ela vai em linha própria pra não sujar o
 * parágrafo em leitor que não entende.
 */
export function paraMarkdown(paginas: PaginaExportada[], meta: MetaLivro): string {
  const partes: string[] = [`# ${meta.titulo}`];
  if (meta.autor) partes.push(`*${meta.autor}*`);

  for (const p of paginas) {
    if (!p.blocos.length) continue;
    partes.push(`\n<!-- ${marcaDePagina(p)} -->`);
    for (const b of p.blocos) partes.push(blocoMarkdown(b));
  }

  return partes.join("\n\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function marcaDePagina(p: PaginaExportada): string {
  return p.rotulo && p.rotulo !== String(p.pagina)
    ? `p. ${p.rotulo} (arquivo ${p.pagina})`
    : `p. ${p.pagina}`;
}

function blocoMarkdown(b: Bloco): string {
  switch (b.tipo) {
    case "titulo":
      return `${"#".repeat(b.nivel + 1)} ${escaparMd(b.texto)}`;
    case "paragrafo":
      return inline(b, "md");
    case "citacao":
      return inline(b, "md")
        .split("\n")
        .map((l) => `> ${l}`)
        .join("\n");
    case "nota":
      return `> [!nota]\n> ${inline(b, "md")}`;
    case "codigo":
      return "```\n" + b.texto + "\n```";
    case "formula":
      // O texto de fórmula sai embaralhado do PDF: vai como bloco próprio, pra
      // não se misturar com a prosa e pra ficar claro que ali era uma equação.
      return "```math\n" + b.texto + "\n```";
    case "tabela":
      return tabelaMarkdown(b.linhas);
    case "sumario":
      return b.entradas
        .map((e) => `${"  ".repeat(e.nivel - 1)}- ${escaparMd(e.texto)}${e.pagina ? ` — ${e.pagina}` : ""}`)
        .join("\n");
    case "imagem":
      // A imagem vive num object URL desta aba: num arquivo de texto ela não
      // sobrevive, então fica o lugar onde ela estava.
      return "*[imagem]*";
  }
}

function tabelaMarkdown(linhas: string[][]): string {
  if (!linhas.length) return "";
  const colunas = Math.max(...linhas.map((l) => l.length));
  const completa = (l: string[]) =>
    `| ${Array.from({ length: colunas }, (_, i) => escaparMd(l[i] ?? "").replace(/\|/g, "\\|")).join(" | ")} |`;

  const [cabecalho, ...resto] = linhas;
  return [
    completa(cabecalho),
    `| ${Array.from({ length: colunas }, () => "---").join(" | ")} |`,
    ...resto.map(completa),
  ].join("\n");
}

/** Só o que atrapalha de verdade — escapar tudo deixa o texto ilegível na fonte. */
function escaparMd(s: string): string {
  return s.replace(/([\\`*_[\]])/g, "\\$1");
}

/* --------------------------------------------------------------- EPUB */

/**
 * O livro em EPUB 3, reflowable de verdade.
 *
 * Um arquivo por trecho (cortado nos títulos de primeiro nível), imagens
 * embutidas, sumário navegável e a lista de páginas do livro — que é o que faz
 * o leitor de EPUB mostrar "página 87" igual ao papel.
 */
export async function paraEpub(
  paginas: PaginaExportada[],
  meta: MetaLivro,
): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  // O mimetype tem que ser o primeiro arquivo e não pode ser comprimido — é
  // assim que o leitor reconhece o zip como EPUB.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/livro.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
  );

  const imagens = new Map<string, string>(); // object URL → nome dentro do EPUB
  const trechos = cortarEmTrechos(paginas);
  const paginasDoLivro: { rotulo: string; arquivo: string; id: string }[] = [];

  const arquivos = await Promise.all(
    trechos.map(async (trecho, i) => {
      const nome = `trecho-${String(i + 1).padStart(3, "0")}.xhtml`;
      const corpo: string[] = [];

      for (const p of trecho.paginas) {
        const rotulo = p.rotulo ?? String(p.pagina);
        const id = `pg-${p.pagina}`;
        // A marca de página: invisível na leitura, e é dela que sai o "ir para a
        // página 87" do leitor de EPUB.
        corpo.push(
          `<span epub:type="pagebreak" role="doc-pagebreak" id="${id}" aria-label="${escaparXml(rotulo)}"/>`,
        );
        paginasDoLivro.push({ rotulo, arquivo: nome, id });

        for (const b of p.blocos) {
          corpo.push(await blocoXhtml(b, zip, imagens));
        }
      }

      zip.file(
        `OEBPS/${nome}`,
        paginaXhtml(trecho.titulo ?? meta.titulo, corpo.join("\n"), meta.idioma),
      );
      return { nome, titulo: trecho.titulo, id: `t${i + 1}` };
    }),
  );

  zip.file("OEBPS/estilo.css", CSS_EPUB);
  zip.file("OEBPS/nav.xhtml", navXhtml(meta, arquivos, paginasDoLivro));
  zip.file(
    "OEBPS/livro.opf",
    opf(meta, arquivos, [...imagens.values()]),
  );

  return zip.generateAsync({ type: "blob", mimeType: "application/epub+zip" });
}

/**
 * Onde cortar o livro em arquivos.
 *
 * Corta nos títulos de primeiro nível — que é o capítulo — e, no livro que não
 * tem nenhum, a cada punhado de páginas: um EPUB de arquivo único trava leitor
 * fraco, e um por página perde a leitura corrida.
 */
const PAGINAS_POR_TRECHO = 20;

function cortarEmTrechos(
  paginas: PaginaExportada[],
): { titulo: string | null; paginas: PaginaExportada[] }[] {
  const trechos: { titulo: string | null; paginas: PaginaExportada[] }[] = [];
  let atual: { titulo: string | null; paginas: PaginaExportada[] } | null = null;

  for (const p of paginas) {
    const abreCapitulo = p.blocos.some((b) => b.tipo === "titulo" && b.nivel === 1);
    if (!atual || abreCapitulo || atual.paginas.length >= PAGINAS_POR_TRECHO) {
      const titulo = p.blocos.find((b) => b.tipo === "titulo" && b.nivel === 1);
      atual = { titulo: titulo?.tipo === "titulo" ? titulo.texto : null, paginas: [] };
      trechos.push(atual);
    }
    atual.paginas.push(p);
  }

  return trechos.length ? trechos : [{ titulo: null, paginas: [] }];
}

async function blocoXhtml(
  b: Bloco,
  zip: JSZip,
  imagens: Map<string, string>,
): Promise<string> {
  switch (b.tipo) {
    case "titulo": {
      const nivel = Math.min(6, b.nivel + 1);
      return `<h${nivel}>${escaparXml(b.texto)}</h${nivel}>`;
    }
    case "paragrafo":
      return `<p>${inline(b, "html")}</p>`;
    case "citacao":
      return `<blockquote><p>${inline(b, "html")}</p></blockquote>`;
    case "nota":
      return `<p class="nota">${inline(b, "html")}</p>`;
    case "codigo":
      return `<pre><code>${escaparXml(b.texto)}</code></pre>`;
    case "formula": {
      // O recorte da folha é a fórmula de verdade; o texto vira a descrição,
      // que é o que o leitor de tela e a busca do aparelho enxergam.
      const nome = b.url ? await guardarImagem(b.url, zip, imagens) : null;
      if (!nome) return `<p class="formula">${escaparXml(b.texto)}</p>`;
      return `<div class="figura formula"><img src="${nome}" alt="${escaparXml(b.texto)}"/></div>`;
    }
    case "tabela":
      return `<table>${b.linhas
        .map((l) => `<tr>${l.map((c) => `<td>${escaparXml(c)}</td>`).join("")}</tr>`)
        .join("")}</table>`;
    case "sumario":
      return `<ul class="sumario">${b.entradas
        .map((e) => `<li class="n${e.nivel}">${escaparXml(e.texto)}${e.pagina ? ` <span class="pag">${escaparXml(e.pagina)}</span>` : ""}</li>`)
        .join("")}</ul>`;
    case "imagem": {
      const nome = await guardarImagem(b.url, zip, imagens);
      if (!nome) return "";
      return `<div class="figura"><img src="${nome}" alt=""/></div>`;
    }
  }
}

/** Traz a imagem de volta do object URL pro zip; devolve o nome dentro do EPUB. */
async function guardarImagem(
  url: string,
  zip: JSZip,
  imagens: Map<string, string>,
): Promise<string | null> {
  const jaTem = imagens.get(url);
  if (jaTem) return jaTem;

  try {
    const blob = await (await fetch(url)).blob();
    const nome = `img/${String(imagens.size + 1).padStart(4, "0")}.jpg`;
    zip.file(`OEBPS/${nome}`, blob);
    imagens.set(url, nome);
    return nome;
  } catch {
    // Imagem que não volta (aba trocou de livro, memória liberada) não impede o
    // livro inteiro de sair.
    return null;
  }
}

function paginaXhtml(titulo: string, corpo: string, idioma: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escaparXml(idioma)}">
<head>
  <title>${escaparXml(titulo)}</title>
  <link rel="stylesheet" type="text/css" href="estilo.css"/>
</head>
<body>
${corpo}
</body>
</html>`;
}

function navXhtml(
  meta: MetaLivro,
  arquivos: { nome: string; titulo: string | null; id: string }[],
  paginas: { rotulo: string; arquivo: string; id: string }[],
): string {
  const toc = arquivos
    .map(
      (a, i) =>
        `<li><a href="${a.nome}">${escaparXml(
          a.titulo ?? meta.textos.trecho.replace("{n}", String(i + 1)),
        )}</a></li>`,
    )
    .join("\n      ");

  // A lista de páginas é o que deixa o leitor de EPUB dizer "página 87" do jeito
  // que o papel diz.
  const lista = paginas
    .map((p) => `<li><a href="${p.arquivo}#${p.id}">${escaparXml(p.rotulo)}</a></li>`)
    .join("\n      ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escaparXml(meta.idioma)}">
<head><title>${escaparXml(meta.titulo)}</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escaparXml(meta.textos.sumario)}</h1>
    <ol>
      ${toc}
    </ol>
  </nav>
  <nav epub:type="page-list" id="paginas" hidden="hidden">
    <h1>${escaparXml(meta.textos.paginas)}</h1>
    <ol>
      ${lista}
    </ol>
  </nav>
</body>
</html>`;
}

function opf(
  meta: MetaLivro,
  arquivos: { nome: string; id: string }[],
  imagens: string[],
): string {
  const itens = arquivos
    .map((a) => `<item id="${a.id}" href="${a.nome}" media-type="application/xhtml+xml"/>`)
    .join("\n    ");
  const itensImagem = imagens
    .map((nome, i) => `<item id="img${i + 1}" href="${nome}" media-type="image/jpeg"/>`)
    .join("\n    ");
  const spine = arquivos.map((a) => `<itemref idref="${a.id}"/>`).join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <dc:title>${escaparXml(meta.titulo)}</dc:title>
    <dc:language>${escaparXml(meta.idioma)}</dc:language>
    ${meta.autor ? `<dc:creator>${escaparXml(meta.autor)}</dc:creator>` : ""}
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
    <meta property="source-of-pagination">PDF</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="estilo.css" media-type="text/css"/>
    ${itens}
    ${itensImagem}
  </manifest>
  <spine>
    ${spine}
  </spine>
</package>`;
}

const CSS_EPUB = `body { line-height: 1.6; margin: 0 1em; }
h1, h2, h3, h4 { line-height: 1.25; margin: 1.6em 0 0.6em; }
p { margin: 0 0 0.9em; text-align: justify; }
blockquote { margin: 1em 1.5em; font-style: italic; }
pre { white-space: pre-wrap; font-size: 0.85em; background: #f4f1ea; padding: 0.7em; }
table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
td { border: 1px solid #ccc; padding: 0.3em 0.5em; }
.nota { font-size: 0.85em; color: #555; }
.figura { text-align: center; margin: 1.2em 0; }
.figura img { max-width: 100%; }
.formula { text-align: center; margin: 1.1em 0; }
.sumario { list-style: none; padding-left: 0; }
.sumario .n2 { padding-left: 1em; }
.sumario .n3 { padding-left: 2em; }
.sumario .pag { color: #777; }`;

/* ------------------------------------------------- Texto com destaque */

type ComMarcas = {
  texto: string;
  negrito: Faixa[];
  italico: Faixa[];
  sobrescrito: Faixa[];
  links: Elo[];
};

/**
 * Devolve o texto com negrito, itálico, expoente e link no lugar certo.
 *
 * As faixas são índices de caractere, então as marcas entram **de trás pra
 * frente**: inserir do começo mexeria em todos os índices seguintes.
 */
function inline(b: ComMarcas, estilo: "md" | "html"): string {
  const marcas: { pos: number; texto: string; ordem: number }[] = [];

  const par = (f: Faixa, abre: string, fecha: string) => {
    marcas.push({ pos: f.start, texto: abre, ordem: 1 });
    marcas.push({ pos: f.end, texto: fecha, ordem: 0 });
  };

  const md = estilo === "md";
  for (const f of b.negrito) par(f, md ? "**" : "<strong>", md ? "**" : "</strong>");
  for (const f of b.italico) par(f, md ? "*" : "<em>", md ? "*" : "</em>");
  for (const f of b.sobrescrito) par(f, "<sup>", "</sup>");
  for (const l of b.links) {
    if (md) {
      marcas.push({ pos: l.start, texto: "[", ordem: 1 });
      marcas.push({ pos: l.end, texto: `](${l.href})`, ordem: 0 });
    } else {
      marcas.push({ pos: l.start, texto: `<a href="${escaparXml(l.href)}">`, ordem: 1 });
      marcas.push({ pos: l.end, texto: "</a>", ordem: 0 });
    }
  }

  const escapar = md ? escaparMd : escaparXml;
  if (!marcas.length) return escapar(b.texto);

  // O escape mexe no comprimento do texto, e as faixas são do texto cru: por
  // isso o texto é fatiado cru e cada pedaço é escapado na hora de juntar.
  marcas.sort((a, b2) => b2.pos - a.pos || a.ordem - b2.ordem);

  let saida = "";
  let fim = b.texto.length;
  for (const m of marcas) {
    const pos = Math.max(0, Math.min(b.texto.length, m.pos));
    saida = m.texto + escapar(b.texto.slice(pos, fim)) + saida;
    fim = pos;
  }
  return escapar(b.texto.slice(0, fim)) + saida;
}

function escaparXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
