"use client";

import type { createClient } from "@/lib/supabase/client";
import { enfileirar, listarFila, removerDaFila, type OpFila } from "@/lib/offline-db";

type Supabase = ReturnType<typeof createClient>;

async function executar(supabase: Supabase, op: OpFila): Promise<void> {
  switch (op.tipo) {
    case "last_page": {
      const { error } = await supabase
        .from("books")
        .update({ last_page: op.page, last_read_at: op.lastReadAt })
        .eq("id", op.bookId);
      if (error) throw error;
      return;
    }
    case "highlight_add": {
      // 23505 = já existe (reenvio de uma sincronização anterior que caiu no meio) — ok, segue.
      const { error } = await supabase.from("highlights").insert(op.row);
      if (error && error.code !== "23505") throw error;
      return;
    }
    case "highlight_del": {
      const { error } = await supabase.from("highlights").delete().eq("id", op.id);
      if (error) throw error;
      return;
    }
    case "bookmark_add": {
      const { error } = await supabase.from("bookmarks").insert(op.row);
      if (error && error.code !== "23505") throw error;
      return;
    }
    case "bookmark_del": {
      const { error } = await supabase.from("bookmarks").delete().eq("id", op.id);
      if (error) throw error;
      return;
    }
  }
}

/**
 * Tenta executar a alteração na hora; se não tiver internet (ou a chamada falhar
 * por qualquer outro motivo de rede), guarda na fila local pra sincronizar depois.
 * É assim que toda escrita da leitura (progresso, marcação, página guardada) passa
 * a funcionar offline sem o usuário perceber diferença.
 */
export async function executarOuEnfileirar(
  supabase: Supabase,
  chave: string,
  op: OpFila,
): Promise<void> {
  if (!navigator.onLine) {
    await enfileirar(chave, op);
    return;
  }
  try {
    await executar(supabase, op);
  } catch {
    await enfileirar(chave, op);
  }
}

let sincronizando = false;

/**
 * Esvazia a fila local no Supabase, em ordem de criação. Para no primeiro erro
 * (rede caiu de novo, por exemplo) — o resto fica guardado pra próxima tentativa.
 * Reentrante-safe: só roda uma sincronização por vez.
 */
export async function sincronizarFila(supabase: Supabase): Promise<void> {
  if (sincronizando) return;
  sincronizando = true;
  try {
    const itens = await listarFila();
    for (const item of itens) {
      try {
        await executar(supabase, item.op);
        await removerDaFila(item.chave);
      } catch {
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
}
