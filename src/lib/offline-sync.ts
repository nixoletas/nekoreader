"use client";

import type { createClient } from "@/lib/supabase/client";
import { enfileirar, listarFila, removerDaFila, type OpFila } from "@/lib/offline-db";
import type { Bookmark, Highlight } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

/**
 * O banco ainda não tem a tabela/coluna que esta operação usa — quer dizer que a
 * migração do `supabase/schema.sql` não rodou.
 *
 * Isso não pode virar erro de fila: ela para no primeiro que falha, e uma nota
 * (ou uma posição de leitura) seguraria marcação e progresso atrás dela pra
 * sempre. Melhor perder a novidade até a migração rodar do que travar o resto.
 *
 * 42P01/42703 = relação ou coluna inexistente (Postgres); PGRST204/205 = a mesma
 * coisa vista pelo cache de schema do PostgREST.
 */
function esquemaAusente(error: { code?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205"
  );
}

async function executar(supabase: Supabase, op: OpFila): Promise<void> {
  switch (op.tipo) {
    case "last_page": {
      const campos: Record<string, unknown> = {
        last_page: op.page,
        last_read_at: op.lastReadAt,
      };
      // Só manda se veio: item antigo da fila não tem esse campo, e escrever
      // `undefined` apagaria as posições já guardadas.
      if (op.positions) campos.positions = op.positions;
      const { error } = await supabase.from("books").update(campos).eq("id", op.bookId);
      if (error) throw error;
      return;
    }
    case "posicao": {
      // Uma linha por (livro, aparelho): reenviar só reescreve a posição dele.
      const { error } = await supabase.from("reading_positions").upsert(
        {
          book_id: op.bookId,
          user_id: op.userId,
          device_id: op.deviceId,
          device_name: op.deviceName,
          page: op.page,
          fraction: op.fraction,
          updated_at: op.updatedAt,
        },
        { onConflict: "book_id,device_id" },
      );
      if (error && !esquemaAusente(error)) throw error;
      return;
    }
    case "highlight_add": {
      // 23505 = já existe (reenvio de uma sincronização anterior que caiu no meio) — ok, segue.
      const { error } = await supabase.from("highlights").insert(op.row);
      if (error && error.code !== "23505") throw error;
      return;
    }
    case "highlight_title": {
      const { error } = await supabase
        .from("highlights")
        .update({ title: op.title })
        .eq("id", op.id);
      if (error) throw error;
      return;
    }
    case "highlight_note": {
      const { error } = await supabase
        .from("highlights")
        .update({ note: op.note })
        .eq("id", op.id);
      if (error && !esquemaAusente(error)) throw error;
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

/**
 * Aplica sobre um retrato (do servidor ou do cache offline) qualquer alteração
 * deste livro que ainda esteja esperando na fila local — sem isso, reabrir o
 * livro offline (ou logo após reconectar, antes da fila esvaziar) faria uma
 * marcação criada offline "sumir" até a próxima sincronização.
 */
export async function mesclarFilaLocal(
  bookId: string,
  highlights: Highlight[],
  bookmarks: Bookmark[],
): Promise<{ highlights: Highlight[]; bookmarks: Bookmark[] }> {
  const itens = await listarFila();
  let hl = highlights;
  let bm = bookmarks;

  for (const { op } of itens) {
    switch (op.tipo) {
      case "highlight_add": {
        const row = op.row as unknown as Highlight;
        if (row.book_id === bookId && !hl.some((h) => h.id === row.id)) hl = [...hl, row];
        break;
      }
      case "highlight_title":
        hl = hl.map((h) => (h.id === op.id ? { ...h, title: op.title } : h));
        break;
      case "highlight_note":
        hl = hl.map((h) => (h.id === op.id ? { ...h, note: op.note } : h));
        break;
      case "highlight_del":
        hl = hl.filter((h) => h.id !== op.id);
        break;
      case "bookmark_add": {
        const row = op.row as unknown as Bookmark;
        if (row.book_id === bookId && !bm.some((b) => b.id === row.id)) bm = [...bm, row];
        break;
      }
      case "bookmark_del":
        bm = bm.filter((b) => b.id !== op.id);
        break;
      case "last_page":
      case "posicao":
        break;
    }
  }

  return { highlights: hl, bookmarks: [...bm].sort((a, b) => a.page - b.page) };
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
