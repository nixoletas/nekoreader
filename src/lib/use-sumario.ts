"use client";

import { useEffect, useRef, useState } from "react";
import { abrirDoc } from "@/lib/pdf";
import { montarSumario } from "@/lib/pdf-sumario";
import { obterSumario, salvarSumario } from "@/lib/offline-db";
import type { ItemSumario } from "@/lib/sumario";

export type EstadoSumario = {
  itens: ItemSumario[] | null;
  /** Fração já lida (0..1) enquanto varre o livro; `null` quando não está varrendo. */
  progresso: number | null;
  carregando: boolean;
  erro: string | null;
};

const PARADO: EstadoSumario = {
  itens: null,
  progresso: null,
  carregando: false,
  erro: null,
};

/**
 * Sumário do livro, montado sob demanda.
 *
 * Só começa quando `ativo` vira true (a pessoa abriu a aba) — livro sem destino
 * nos marcadores precisa de uma varredura no texto inteiro, e não faz sentido
 * pagar por isso em toda abertura. Depois de pronto fica guardado no aparelho,
 * então a espera acontece no máximo uma vez por livro.
 */
export function useSumario(
  bookId: string,
  fileUrl: string | null,
  ativo: boolean,
): EstadoSumario {
  const [estado, setEstado] = useState<EstadoSumario>(PARADO);
  // De qual livro/arquivo o trabalho já foi disparado — sem isso, cada abrir e
  // fechar da aba recomeçaria a varredura do zero.
  const feito = useRef<string | null>(null);

  useEffect(() => {
    if (!ativo || !fileUrl) return;
    const alvo = `${bookId}|${fileUrl}`;
    if (feito.current === alvo) return;
    feito.current = alvo;

    const controle = new AbortController();
    let vivo = true;

    void (async () => {
      setEstado({ ...PARADO, carregando: true });
      try {
        const guardado = await obterSumario(bookId);
        if (!vivo) return;
        if (guardado) {
          setEstado({ ...PARADO, itens: guardado });
          return;
        }

        const doc = await abrirDoc(fileUrl);
        if (!vivo) return;

        const itens = await montarSumario(doc, {
          sinal: controle.signal,
          aoProgredir: (fracao) => {
            if (vivo) setEstado((e) => ({ ...e, progresso: fracao }));
          },
        });
        if (!vivo) return;

        setEstado({ ...PARADO, itens });
        // Guardar é conveniência: se o armazenamento estiver cheio ou bloqueado,
        // o sumário já está na tela e só será remontado na próxima abertura.
        void salvarSumario(bookId, itens).catch(() => {});
      } catch (e) {
        if (!vivo) return;
        feito.current = null; // deixa tentar de novo
        setEstado({
          ...PARADO,
          erro: e instanceof Error ? e.message : "Não consegui ler o sumário.",
        });
      }
    })();

    return () => {
      vivo = false;
      controle.abort();
    };
  }, [ativo, fileUrl, bookId]);

  return estado;
}
