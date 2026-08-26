"use client";

import type { createClient } from "@/lib/supabase/client";
import { ERRO, ErroApp } from "@/lib/erros";

type Supabase = ReturnType<typeof createClient>;

const BUCKET = "books";
const TTL_SEGUNDOS = 60 * 60 * 6; // 6h — mesmo prazo que já era usado
const MARGEM_SEGUNDOS = 60 * 20; // renova com 20min de folga, nunca expira no meio da leitura

type Cache = { url: string; expiraEm: number };

function chave(storagePath: string) {
  return `neko:pdfurl:${storagePath}`;
}

function lerCache(storagePath: string): Cache | null {
  try {
    const bruto = localStorage.getItem(chave(storagePath));
    if (!bruto) return null;
    const dado = JSON.parse(bruto) as Partial<Cache>;
    if (typeof dado.url !== "string" || typeof dado.expiraEm !== "number") return null;
    return { url: dado.url, expiraEm: dado.expiraEm };
  } catch {
    return null;
  }
}

function salvarCache(storagePath: string, dado: Cache) {
  try {
    localStorage.setItem(chave(storagePath), JSON.stringify(dado));
  } catch {
    // localStorage indisponível ou cheio — segue sem cache, só perde a otimização
  }
}

/**
 * URL assinada do PDF, reaproveitada entre visitas.
 *
 * Gerar uma URL nova a cada abertura (como era antes, no servidor) impedia o
 * navegador de aproveitar o cache HTTP — o livro inteiro baixava de novo toda
 * vez, mesmo pra reabrir o mesmo livro dali a um minuto. Aqui só pede uma URL
 * nova ao Supabase quando não tem cache ou quando a que tem está a menos de
 * 20min de expirar; o resto do tempo devolve a mesma URL de sempre, e o
 * navegador serve o PDF do cache local sem tocar na rede.
 */
export async function urlAssinadaDoLivro(
  supabase: Supabase,
  storagePath: string,
): Promise<string> {
  const emCache = lerCache(storagePath);
  if (emCache && emCache.expiraEm - Date.now() > MARGEM_SEGUNDOS * 1000) {
    return emCache.url;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, TTL_SEGUNDOS);

  if (error || !data?.signedUrl) {
    if (error?.message) throw new Error(error.message);
    throw new ErroApp(ERRO.urlNaoGerada);
  }

  salvarCache(storagePath, {
    url: data.signedUrl,
    expiraEm: Date.now() + TTL_SEGUNDOS * 1000,
  });
  return data.signedUrl;
}
