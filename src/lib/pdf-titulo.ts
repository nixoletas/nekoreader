import type { PDFDocumentProxy } from "pdfjs-dist";
import type { Item } from "@/lib/pdf-blocos";
import { itensDaPagina } from "@/lib/pdf-itens";

/**
 * Descobrir como o livro se chama.
 *
 * O PDF quase nunca ajuda: o campo `Title` costuma vir vazio, ou pior — vem
 * "Microsoft Word - cap1_revisado_FINAL2.doc", que é o nome que o arquivo teve
 * numa vida passada. Por isso a busca tem três degraus, do mais barato pro mais
 * caro, e cada degrau só entra se o anterior não deu nada aproveitável:
 *
 * 1. Os metadados do arquivo, passados por um filtro de lixo.
 * 2. O texto da capa: numa capa, o título é literalmente a maior coisa escrita.
 * 3. O mesmo, mas com OCR — pro livro digitalizado, em que a capa é uma foto.
 *
 * Nada disso é definitivo: o que a pessoa escreveu à mão sempre ganha.
 */
export type TituloAchado = {
  titulo: string | null;
  autor: string | null;
  /** De onde veio — a interface diz isso, pra pessoa saber o quanto confiar. */
  fonte: "metadados" | "capa" | "ocr" | "nenhuma";
};

const VAZIO: TituloAchado = { titulo: null, autor: null, fonte: "nenhuma" };

/** Quantas páginas do começo entram na busca pela capa. */
const PAGINAS_DE_CAPA = 3;

export async function titulosDoPdf(
  doc: PDFDocumentProxy,
  {
    comOcr = false,
    sinal,
    idiomas,
  }: { comOcr?: boolean; sinal?: AbortSignal; idiomas?: string } = {},
): Promise<TituloAchado> {
  const dosMetadados = await metadadosDoPdf(doc);
  if (dosMetadados.titulo) return dosMetadados;

  for (let pagina = 1; pagina <= Math.min(PAGINAS_DE_CAPA, doc.numPages); pagina++) {
    if (sinal?.aborted) return VAZIO;
    const lido = await itensDaPagina(doc, pagina);
    const achado = lido && daCapa(lido.itens);
    // O autor pode não estar na capa; o título, se achou, já resolve.
    if (achado?.titulo) return { ...achado, autor: achado.autor ?? dosMetadados.autor, fonte: "capa" };
  }

  if (!comOcr) return { ...VAZIO, autor: dosMetadados.autor };

  // Capa digitalizada: não tem texto nenhum pra ler, só a foto da capa.
  try {
    const { remontarPorOcr } = await import("@/lib/pdf-ocr");
    for (let pagina = 1; pagina <= Math.min(2, doc.numPages); pagina++) {
      if (sinal?.aborted) return VAZIO;
      const { colunas } = await remontarPorOcr(doc, pagina, { sinal, idiomas });
      const linhas = colunas.flat().map((p) => p.bloco);
      const texto = linhas
        .map((b) => ("texto" in b ? b.texto : ""))
        .filter(Boolean);
      // A remontagem já classificou: o título da capa vira bloco de título.
      const titulo = linhas.find((b) => b.tipo === "titulo")?.texto ?? texto[0];
      if (titulo && limparTexto(titulo)) {
        return {
          titulo: limparTexto(titulo),
          autor: dosMetadados.autor ?? autorEntre(texto.slice(1, 6)),
          fonte: "ocr",
        };
      }
    }
  } catch {
    // OCR indisponível (sem rede na primeira vez) não pode derrubar o envio
  }

  return { ...VAZIO, autor: dosMetadados.autor };
}

/* ------------------------------------------------------- Metadados */

type InfoPdf = { Title?: unknown; Author?: unknown };

async function metadadosDoPdf(doc: PDFDocumentProxy): Promise<TituloAchado> {
  try {
    const { info } = (await doc.getMetadata()) as { info?: InfoPdf };
    return dosMetadados(info ?? {});
  } catch {
    return VAZIO;
  }
}

/** O `info` do PDF, já peneirado. Separado pra poder ser conferido sem abrir arquivo. */
export function dosMetadados(info: InfoPdf): TituloAchado {
  const titulo = tituloUtil(texto(info.Title));
  const autor = autorUtil(texto(info.Author));
  return {
    titulo,
    autor,
    fonte: titulo || autor ? "metadados" : "nenhuma",
  };
}

function texto(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/**
 * O `Title` presta?
 *
 * O campo é preenchido pelo programa que gerou o PDF, não por quem escreveu o
 * livro — e o que mais aparece ali é o nome do arquivo de origem, o nome do
 * programa, ou "untitled". Aceitar isso é pior que não ter título nenhum: vira
 * um nome errado que a pessoa nem desconfia que está errado.
 */
export function tituloUtil(bruto: string): string | null {
  const t = limparTexto(bruto);
  if (!t || t.length < 3 || t.length > 200) return null;

  // "Microsoft Word - cap1.doc", "cap1.indd", "tese_final_v3.tex"
  if (/^(microsoft|adobe|acrobat|libreoffice|openoffice)\b/i.test(t)) return null;
  if (/\.(docx?|pptx?|xlsx?|pdf|indd|idml|tex|qxd|pmd|rtf|odt|pages)$/i.test(t)) return null;
  if (/^(untitled|sem\s*t[ií]tulo|documento?\d*|doc\d*|print|slide\d*|apresenta[çc][aã]o|presentation|book\d*|livro\d*)$/i.test(t)) {
    return null;
  }
  // Identificador de gráfica/repositório: uma palavra só, comprida e com números.
  if (!/\s/.test(t) && t.length >= 8 && /\d{3,}/.test(t)) return null;
  // Só pontuação/números ("2011", "01", "- -")
  if (!/\p{L}/u.test(t)) return null;

  return t;
}

/** O mesmo pro autor, que costuma vir com o dono do computador que gerou o PDF. */
export function autorUtil(bruto: string): string | null {
  const a = limparTexto(bruto);
  if (!a || a.length < 3 || a.length > 120) return null;
  if (/^(unknown|desconhecido|administrador|administrator|admin|usu[áa]rio|user|windows user|convidado|guest|owner|propriet[áa]rio)$/i.test(a)) {
    return null;
  }
  if (/^(microsoft|adobe|acrobat|calibre|pdftex|latex|word|writer)\b/i.test(a)) return null;
  if (!/\p{L}/u.test(a)) return null;
  return a;
}

/* ------------------------------------------------------------ Capa */

/** Uma linha da capa: o texto e o tamanho da letra. */
type LinhaCapa = { texto: string; alt: number; y: number };

/**
 * O título e o autor lidos do desenho da capa.
 *
 * Capa é o caso mais fácil de tipografia que existe: o título é o que está
 * escrito **maior**. Então em vez de adivinhar por conteúdo, a busca ordena as
 * linhas por corpo de letra e pega a maior — junto com as vizinhas do mesmo
 * tamanho, porque título de duas linhas é comum.
 *
 * O autor é a maior linha **abaixo** do título que se pareça com nome de gente:
 * poucas palavras, começando com maiúscula, sem ponto final.
 */
export function daCapa(itens: Item[]): TituloAchado | null {
  const linhas = agrupar(itens).filter((l) => aproveitavel(l.texto));
  if (!linhas.length) return null;

  const maior = Math.max(...linhas.map((l) => l.alt));
  const doTitulo = linhas.filter((l) => l.alt >= maior * 0.92);
  const resto = linhas.filter((l) => l.alt < maior * 0.92);

  // Capa tem título de uma a três linhas. Uma página em que **tudo** está no
  // maior tamanho é texto corrido, não capa — e chutar um título ali daria
  // errado mais vezes que certo.
  if (doTitulo.length > 3) return null;
  // Com outras linhas na página, o título precisa destoar delas: numa capa ele
  // é visivelmente maior que o subtítulo, o autor e o nome da editora.
  if (resto.length && maior < mediana(resto.map((l) => l.alt)) * 1.2) return null;

  const titulo = limparTexto(doTitulo.map((l) => l.texto).join(" "));
  if (!titulo || titulo.length < 3) return null;

  const abaixoDoTitulo = resto
    .filter((l) => l.y < Math.min(...doTitulo.map((d) => d.y)))
    .sort((a, b) => b.alt - a.alt)
    .map((l) => l.texto);

  return { titulo, autor: autorEntre(abaixoDoTitulo), fonte: "capa" };
}

/** A primeira linha que se parece com nome de pessoa. */
function autorEntre(textos: string[]): string | null {
  for (const bruto of textos) {
    const t = limparTexto(bruto.replace(/^(por|by)\s+/i, ""));
    if (!t || t.length < 5 || t.length > 80) continue;
    const palavras = t.split(/\s+/);
    if (palavras.length < 2 || palavras.length > 6) continue;
    if (/[.:;]$/.test(t)) continue;
    // Nome tem inicial maiúscula em quase toda palavra (as preposições ficam
    // de fora: "Machado de Assis", "Ana da Silva").
    const maiusculas = palavras.filter((p) => /^\p{Lu}/u.test(p)).length;
    if (maiusculas >= palavras.length - 2 && maiusculas >= 2) return t;
  }
  return null;
}

/** Linha que não serve nem de título nem de autor. */
function aproveitavel(texto: string): boolean {
  const t = texto.trim();
  if (t.length < 2 || t.length > 160) return false;
  if (!/\p{L}/u.test(t)) return false;
  if (/^(isbn|issn|doi|www\.|https?:)/i.test(t)) return false;
  if (/^\d+(\.\d+)*$/.test(t)) return false;
  return true;
}

/** Itens na mesma altura viram uma linha — a versão curta do que a remontagem faz. */
function agrupar(itens: Item[]): LinhaCapa[] {
  const cheios = itens.filter((i) => !i.espaco && i.texto.trim());
  if (!cheios.length) return [];

  const ordenados = [...cheios].sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: Item[][] = [];
  for (const it of ordenados) {
    const atual = grupos[grupos.length - 1];
    if (atual && Math.abs(atual[0].y - it.y) <= Math.max(atual[0].alt, it.alt) * 0.5) {
      atual.push(it);
    } else {
      grupos.push([it]);
    }
  }

  return grupos.map((g) => ({
    texto: limparTexto(g.map((i) => i.texto).join(" ")) ?? "",
    alt: mediana(g.map((i) => i.alt)),
    y: g[0].y,
  }));
}

function mediana(ns: number[]): number {
  if (!ns.length) return 0;
  const ord = [...ns].sort((a, b) => a - b);
  return ord[Math.floor(ord.length / 2)];
}

/**
 * Espaço a mais, espaço entre letras e maiúscula gritada.
 *
 * Capa adora "E S P A Ç A M E N T O" e TÍTULO TODO EM CAIXA ALTA; na estante
 * isso vira uma linha que ninguém lê. O tudo-em-caixa só é desfeito quando a
 * linha inteira é assim — sigla no meio da frase (PDF, IA) continua de pé.
 */
function limparTexto(bruto: string): string | null {
  const cru = bruto.replace(/ /g, " ").trim();
  if (!cru) return null;

  let t = cru.replace(/\s+/g, " ");

  // "D O M   C A S M U R R O" → "DOM CASMURRO". O que separa palavra ali é o
  // espaço **duplo**: por isso a junção acontece no texto cru, antes de os
  // espaços virarem um só — senão o título viraria uma palavra grudada.
  if (/^(\p{L}\s){3,}\p{L}$/u.test(t)) {
    t = cru
      .split(/\s{2,}/)
      .map((parte) => parte.replace(/\s+/g, ""))
      .join(" ");
  }

  if (t.length > 3 && t === t.toLocaleUpperCase("pt-BR") && /\p{L}{4,}/u.test(t)) {
    t = emCaixaDeTitulo(t);
  }

  return t.trim() || null;
}

/** Palavras que ficam minúsculas no meio do título ("Manual de Redação"). */
const ATONAS = /^(de|da|do|das|dos|e|em|no|na|nos|nas|a|o|as|os|para|por|com|of|the|and|in|on|for|to|a|an)$/i;

/** "MACHADO DE ASSIS" → "Machado de Assis". */
function emCaixaDeTitulo(bruto: string): string {
  return bruto
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((palavra, i) =>
      i > 0 && ATONAS.test(palavra)
        ? palavra
        : palavra.replace(/^([(«"'-]*)(\p{L})/u, (_, antes, letra: string) => antes + letra.toLocaleUpperCase("pt-BR")),
    )
    .join(" ");
}
