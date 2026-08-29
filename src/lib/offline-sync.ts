"use client";

import type { createClient } from "@/lib/supabase/client";
import {
  enfileirar,
  listarFila,
  marcarTentativa,
  removerDaFila,
  type OpFila,
} from "@/lib/offline-db";
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

/**
 * Esta operação nunca vai dar certo, por mais que se tente.
 *
 * O caso que importa: alguém apaga um livro num aparelho enquanto o outro ainda
 * tem marcações dele na fila. O `insert` bate na chave estrangeira (23503) toda
 * vez, e como a fila para no primeiro erro, tudo o que foi feito depois — em
 * qualquer livro — fica preso atrás dela pra sempre, sem aviso nenhum.
 *
 * Descartar é a saída certa: a operação perdeu o objeto, e o resto da fila não
 * tem nada a ver com isso.
 *
 * Só entram códigos que falam do **dado**, nunca de permissão: sessão vencida
 * também devolve "não autorizado", e descartar por causa dela jogaria fora a
 * marcação de alguém que só precisava entrar de novo. Esse caso fica pro teto de
 * tentativas, que espera muito mais antes de desistir.
 *
 * 23503 chave estrangeira · 23514 check · 22P02/22003 valor inválido.
 */
function permanente(error: { code?: string }): boolean {
  return (
    error.code === "23503" ||
    error.code === "23514" ||
    error.code === "22P02" ||
    error.code === "22003"
  );
}

/**
 * Teto de tentativas antes de desistir de uma operação.
 *
 * A lista de códigos acima cobre o que dá pra prever; isto cobre o resto. Vinte
 * sincronizações seguidas falhando na mesma operação, enquanto o app claramente
 * tem internet pra tentar, é uma operação quebrada — não uma rede instável.
 */
const TETO_TENTATIVAS = 20;

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
 * Esvazia a fila local no Supabase, em ordem de criação.
 *
 * Erro de rede para a sincronização — o resto fica guardado pra próxima vez, que
 * é o comportamento certo pra quem só perdeu o sinal. O que **não** pode parar a
 * fila é uma operação que nunca vai dar certo (`permanente`) ou que já falhou
 * vezes demais: essa é descartada e a fila segue, senão uma marcação órfã
 * seguraria pra sempre todo o progresso feito depois dela.
 *
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
      } catch (e) {
        const erro = (e ?? {}) as { code?: string };
        const tentativas = (item.tentativas ?? 0) + 1;
        if (permanente(erro) || tentativas >= TETO_TENTATIVAS) {
          await removerDaFila(item.chave);
          continue;
        }
        await marcarTentativa(item.chave, tentativas);
        break;
      }
    }
  } finally {
    sincronizando = false;
  }
}
