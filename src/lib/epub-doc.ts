"use client";

import {
  abrirEpub,
  analisadorDoNavegador,
  resolverCaminho,
  type EpubAberto,
} from "@/lib/epub";
import { blocosDoCapitulo } from "@/lib/epub-blocos";
import type { Bloco } from "@/lib/pdf-blocos";

/**
 * Camada de navegador em cima do `epub.ts`: baixa o arquivo, guarda um aberto
 * por vez e transforma capítulo em blocos prontos pro leitor.
 *
 * Mesmo desenho do `abrirDoc` do PDF — inclusive na regra de fechar o anterior
 * ao abrir outro livro, pra não segurar dois zips inteiros em memória.
 */

const abertos = new Map<string, Promise<EpubAberto>>();

export function abrirEpubDaUrl(
  url: string,
  aoProgredir?: (fracao: number) => void,
): Promise<EpubAberto> {
  const jaAberto = abertos.get(url);
  if (jaAberto) return jaAberto;

  abertos.clear();

  const promessa = (async () => {
    const dados = await baixar(url, aoProgredir);
    return abrirEpub(dados, analisadorDoNavegador());
  })();

  abertos.set(url, promessa);
  promessa.catch(() => abertos.delete(url));
  return promessa;
}

/** Baixa o arquivo relatando o quanto já veio — o EPUB inteiro precisa estar em mãos. */
async function baixar(
  url: string,
  aoProgredir?: (fracao: number) => void,
): Promise<ArrayBuffer> {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`Não consegui baixar o livro (${resposta.status}).`);

  const total = Number(resposta.headers.get("content-length") ?? 0);
  if (!aoProgredir || !total || !resposta.body) return resposta.arrayBuffer();

  const leitor = resposta.body.getReader();
  const pedacos: Uint8Array[] = [];
  let lido = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    pedacos.push(value);
    lido += value.length;
    aoProgredir(Math.min(1, lido / total));
  }

  const junto = new Uint8Array(lido);
  let pos = 0;
  for (const p of pedacos) {
    junto.set(p, pos);
    pos += p.length;
  }
  return junto.buffer;
}

/**
 * Blocos de um capítulo, com as imagens do zip já viradas em object URL.
 *
 * Quem chama vira dono das URLs e precisa revogar quando descartar os blocos —
 * é o mesmo contrato do modo texto do PDF.
 */
export async function blocosDoEpub(
  epub: EpubAberto,
  capitulo: number,
): Promise<Bloco[]> {
  const alvo = epub.capitulos[capitulo - 1];
  if (!alvo) return [];

  const bruto = await epub.lerTexto(alvo.href);
  if (!bruto) return [];

  const doc = analisadorDoNavegador()(bruto, "xhtml");

  // As imagens do capítulo saem do zip antes de montar os blocos: o conversor é
  // síncrono e precisa da URL na mão na hora que encontra o <img>.
  const urls = await carregarImagens(epub, doc, alvo.href);
  return blocosDoCapitulo(doc, (src) => {
    const url = urls.get(resolverCaminho(alvo.href, src));
    return url ? { url } : null;
  });
}

async function carregarImagens(
  epub: EpubAberto,
  doc: Document,
  base: string,
): Promise<Map<string, string>> {
  const caminhos = new Set<string>();
  for (const img of Array.from(doc.getElementsByTagName("img"))) {
    const src = img.getAttribute("src");
    if (src) caminhos.add(resolverCaminho(base, src));
  }
  for (const img of Array.from(doc.getElementsByTagName("image"))) {
    const src = img.getAttribute("xlink:href") ?? img.getAttribute("href");
    if (src) caminhos.add(resolverCaminho(base, src));
  }

  const urls = new Map<string, string>();
  await Promise.all(
    Array.from(caminhos, async (caminho) => {
      try {
        const blob = await epub.lerBinario(caminho);
        if (blob) urls.set(caminho, URL.createObjectURL(blob));
      } catch {
        // imagem quebrada não impede a leitura do capítulo
      }
    }),
  );
  return urls;
}
