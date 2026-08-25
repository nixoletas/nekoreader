"use client";

import { useEffect, useState } from "react";
import { obterRotulos, salvarRotulos, VERSAO_ROTULOS } from "@/lib/offline-db";
import { createClient } from "@/lib/supabase/client";
import type { Rotulos } from "@/lib/pdf-rotulos";
import type { BookFormat, RotulosSalvos } from "@/lib/types";

type Supabase = ReturnType<typeof createClient>;

/**
 * A numeração impressa do livro, descoberta em segundo plano.
 *
 * Roda sozinha assim que o arquivo abre — diferente do sumário, que só começa
 * quando a pessoa pede: aqui o resultado muda o que a barra mostra em toda
 * página, então esperar um clique deixaria o número piscando depois. Enquanto
 * não termina, o leitor mostra a página física, que é o que ele sempre mostrou.
 *
 * A numeração é do **arquivo**, não do aparelho: quem varre publica o resultado
 * em `books.page_labels`, e os outros aparelhos leem de lá em vez de varrer de
 * novo. Sem isso o mesmo livro mostrava "de 697" no celular (que já tinha
 * varrido) e "de 708" no computador (que ainda não).
 *
 * EPUB não entra: lá "página" quer dizer capítulo e não existe folio nenhum.
 *
 * Sem `fileUrl` nada é varrido — só se aproveita o que já foi descoberto, aqui
 * ou em outro aparelho. É o caso da estante e da página de marcações, que
 * mostram número de página mas nunca abrem o arquivo.
 */
export function useRotulos(
  bookId: string,
  fileUrl: string | null,
  formato: BookFormat,
  /** O que o servidor já sabe — `books.page_labels` da ficha do livro. */
  salvos?: RotulosSalvos | null,
): Rotulos | null {
  const [supabase] = useState(createClient);
  const [rotulos, setRotulos] = useState<Rotulos | null>(null);

  // A ficha do livro chega e rechega (recarga da estante, sincronização) com
  // objeto novo a cada vez, e o mesmo conteúdo dentro. Segurar a versão que
  // vale — e não o objeto — é o que impede o efeito de reiniciar a cada recarga
  // (ajuste de estado durante o render, como em `pdf-text.tsx`).
  const [salvosEmUso, setSalvosEmUso] = useState(salvos ?? null);
  if ((salvos?.versao ?? 0) !== (salvosEmUso?.versao ?? 0)) {
    setSalvosEmUso(salvos ?? null);
  }

  useEffect(() => {
    if (formato !== "pdf") return;

    const controle = new AbortController();
    let vivo = true;

    void (async () => {
      try {
        const local = await obterRotulos(bookId);
        if (!vivo) return;
        if (local.estado === "sabido") {
          setRotulos(local.rotulos);
          return;
        }

        // O que outro aparelho descobriu vale aqui inteiro: mesmo arquivo, mesma
        // dedução, mesma versão. Fica guardado local pra valer offline também.
        if (salvosEmUso && salvosEmUso.versao === VERSAO_ROTULOS) {
          setRotulos(salvosEmUso.rotulos);
          void salvarRotulos(bookId, salvosEmUso.rotulos).catch(() => {});
          return;
        }

        if (local.estado === "esperar") return; // varredura frustrada há pouco
        if (!fileUrl) return; // só leitura do que já foi descoberto

        const [{ abrirDoc }, { montarRotulos }] = await Promise.all([
          import("@/lib/pdf"),
          import("@/lib/pdf-rotulos"),
        ]);
        const doc = await abrirDoc(fileUrl);
        const varredura = await montarRotulos(doc, { sinal: controle.signal });
        if (!vivo || controle.signal.aborted) return;

        // Varredura que não terminou não é resposta: guarda só a tentativa (pra
        // espaçar a próxima) e segue mostrando a página física por enquanto.
        if (varredura.fim === "incompleta") {
          void salvarRotulos(bookId, null, false).catch(() => {});
          return;
        }

        const achados = varredura.fim === "achou" ? varredura.rotulos : null;
        setRotulos(achados);
        void salvarRotulos(bookId, achados).catch(() => {});
        void publicar(supabase, bookId, achados);
      } catch {
        // Numeração é um extra: sem ela o leitor segue mostrando a página física.
      }
    })();

    return () => {
      vivo = false;
      controle.abort();
    };
  }, [bookId, fileUrl, formato, salvosEmUso, supabase]);

  return rotulos;
}

/**
 * Manda o resultado pro servidor, pra ele valer nos outros aparelhos.
 *
 * Falha caladinho de propósito: sem rede, ou em banco que ainda não rodou a
 * migração da coluna, o aparelho que varreu segue com a numeração no cache
 * local — só os outros é que vão ter de varrer por conta própria.
 */
async function publicar(
  supabase: Supabase,
  bookId: string,
  rotulos: Rotulos | null,
): Promise<void> {
  const dado: RotulosSalvos = { versao: VERSAO_ROTULOS, rotulos };
  try {
    await supabase.from("books").update({ page_labels: dado }).eq("id", bookId);
  } catch {
    // ver acima
  }
}
