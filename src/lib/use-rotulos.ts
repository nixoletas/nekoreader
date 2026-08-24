"use client";

import { useEffect, useState } from "react";
import { obterRotulos, salvarRotulos } from "@/lib/offline-db";
import type { Rotulos } from "@/lib/pdf-rotulos";
import type { BookFormat } from "@/lib/types";

/**
 * A numeração impressa do livro, descoberta em segundo plano.
 *
 * Roda sozinha assim que o arquivo abre — diferente do sumário, que só começa
 * quando a pessoa pede: aqui o resultado muda o que a barra mostra em toda
 * página, então esperar um clique deixaria o número piscando depois. Enquanto
 * não termina, o leitor mostra a página física, que é o que ele sempre mostrou.
 *
 * EPUB não entra: lá "página" quer dizer capítulo e não existe folio nenhum.
 *
 * Sem `fileUrl` só o que já está guardado é lido — é o caso da página de
 * marcações, que mostra número de página mas nunca abre o arquivo: ela aproveita
 * o que o leitor descobriu, e cai na página do arquivo se este aparelho ainda
 * não abriu o livro.
 */
export function useRotulos(
  bookId: string,
  fileUrl: string | null,
  formato: BookFormat,
): Rotulos | null {
  const [rotulos, setRotulos] = useState<Rotulos | null>(null);

  useEffect(() => {
    if (formato !== "pdf") return;

    const controle = new AbortController();
    let vivo = true;

    void (async () => {
      try {
        const guardado = await obterRotulos(bookId);
        if (!vivo) return;
        // `null` guardado quer dizer "já varri, este livro não tem" — não varre de novo.
        if (guardado !== undefined) {
          setRotulos(guardado);
          return;
        }
        if (!fileUrl) return; // só leitura do que já foi descoberto

        const [{ abrirDoc }, { montarRotulos }] = await Promise.all([
          import("@/lib/pdf"),
          import("@/lib/pdf-rotulos"),
        ]);
        const doc = await abrirDoc(fileUrl);
        const achados = await montarRotulos(doc, { sinal: controle.signal });
        if (!vivo || controle.signal.aborted) return;

        setRotulos(achados);
        void salvarRotulos(bookId, achados).catch(() => {});
      } catch {
        // Numeração é um extra: sem ela o leitor segue mostrando a página física.
      }
    })();

    return () => {
      vivo = false;
      controle.abort();
    };
  }, [bookId, fileUrl, formato]);

  return rotulos;
}
