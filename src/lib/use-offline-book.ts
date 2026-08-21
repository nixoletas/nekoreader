"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { urlAssinadaDoLivro } from "@/lib/pdf-url-cache";
import { obterPdfOffline, removerPdfOffline, salvarPdfOffline } from "@/lib/offline-db";
import { useAlert } from "@/components/dialog-provider";
import type { Book } from "@/lib/types";

type Status = "verificando" | "ausente" | "baixando" | "disponivel";

/** Baixa/gerencia a cópia local do PDF de um livro, pra ler sem internet. */
export function useOfflineBook(book: Pick<Book, "id" | "storage_path">) {
  const [status, setStatus] = useState<Status>("verificando");
  const [progresso, setProgresso] = useState<number | null>(null);
  const alertar = useAlert();

  useEffect(() => {
    let vivo = true;
    obterPdfOffline(book.id).then((dado) => {
      if (vivo) setStatus(dado ? "disponivel" : "ausente");
    });
    return () => {
      vivo = false;
    };
  }, [book.id]);

  const baixar = useCallback(async () => {
    setStatus("baixando");
    setProgresso(null); // null = indeterminado, até saber o tamanho total (ou nunca saber)
    try {
      const supabase = createClient();
      const url = await urlAssinadaDoLivro(supabase, book.storage_path);
      const resp = await fetch(url);
      if (!resp.ok || !resp.body) throw new Error("Falha ao baixar o arquivo.");

      const total = Number(resp.headers.get("content-length")) || 0;
      const reader = resp.body.getReader();
      const pedacos: BlobPart[] = [];
      let recebido = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          pedacos.push(value);
          recebido += value.length;
          if (total) setProgresso(Math.round((recebido / total) * 100));
        }
      }

      const blob = new Blob(pedacos, { type: "application/pdf" });
      await salvarPdfOffline({
        bookId: book.id,
        blob,
        storagePath: book.storage_path,
        sizeBytes: blob.size,
        savedAt: Date.now(),
      });
      // best-effort: pede pro navegador não descartar isso sob pressão de espaço.
      // Sem suporte ou negado, segue normalmente — só perde essa garantia extra.
      void navigator.storage?.persist?.().catch(() => {});
      setStatus("disponivel");
    } catch (e) {
      setStatus("ausente");
      await alertar({
        titulo: "Não consegui baixar o livro",
        mensagem: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setProgresso(null);
    }
  }, [book.id, book.storage_path, alertar]);

  const remover = useCallback(async () => {
    await removerPdfOffline(book.id);
    setStatus("ausente");
  }, [book.id]);

  return { status, progresso, baixar, remover };
}
