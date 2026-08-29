"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { obterTextoBusca, salvarTextoBusca } from "@/lib/offline-db";
import { MIN_TERMO, procurar, type Achado } from "@/lib/busca";
import type { BookFormat } from "@/lib/types";
import { useI18n } from "@/lib/i18n/cliente";

export type EstadoBusca = {
  /** `null` = ainda não há livro lido pra procurar. */
  achados: Achado[] | null;
  /** A lista bateu no teto e não mostra tudo o que existe. */
  cortado: boolean;
  /** Fração já lida (0..1) enquanto lê o livro; `null` quando não está lendo. */
  progresso: number | null;
  carregando: boolean;
  /** O livro foi lido inteiro e não tem texto nenhum — é digitalizado. */
  semTexto: boolean;
  erro: string | null;
};

/** Espera depois da última tecla antes de procurar de novo. */
const ESPERA_DIGITACAO = 300;

/**
 * A busca dentro do livro.
 *
 * Duas fases bem separadas, e é isso que faz a busca parecer instantânea:
 *
 * 1. **Ler o livro** — uma vez por livro, quando a pessoa abre a aba. Custa uma
 *    varredura no arquivo inteiro, então o resultado fica guardado no aparelho
 *    (`salvarTextoBusca`). Da segunda vez em diante, nem o arquivo é aberto.
 * 2. **Procurar** — em memória, no texto já lido. É rápido o bastante pra rodar
 *    a cada palavra digitada, com um respiro de {@link ESPERA_DIGITACAO}ms pra
 *    não procurar cinco vezes enquanto alguém escreve uma palavra de cinco letras.
 *
 * Mesmo desenho do `use-sumario`: só começa quando `ativo` vira true, cancela a
 * leitura ao desmontar, e guardar é conveniência — se falhar, a busca já está na
 * tela e só será refeita na próxima abertura.
 */
export function useBusca(
  bookId: string,
  fileUrl: string | null,
  formato: BookFormat,
  ativo: boolean,
  termo: string,
): EstadoBusca {
  const { d } = useI18n();
  const [paginas, setPaginas] = useState<string[] | null>(null);
  const [lendo, setLendo] = useState<{ progresso: number | null; erro: string | null }>({
    progresso: null,
    erro: null,
  });
  const [aplicado, setAplicado] = useState("");

  // De qual livro/arquivo a leitura já foi disparada — sem isso, cada abrir e
  // fechar da aba recomeçaria a varredura do zero.
  const feito = useRef<string | null>(null);

  /* ---------- fase 1: ler o livro ---------- */
  useEffect(() => {
    if (!ativo) return;
    const alvo = `${bookId}|${fileUrl ?? ""}`;
    if (feito.current === alvo) return;

    const controle = new AbortController();
    let vivo = true;

    void (async () => {
      try {
        const guardado = await obterTextoBusca(bookId);
        if (!vivo) return;
        if (guardado) {
          feito.current = alvo;
          setPaginas(guardado);
          return;
        }

        // Sem texto guardado só dá pra ler com o arquivo em mãos. Offline, e sem
        // ter lido antes, a busca fica esperando o arquivo aparecer.
        if (!fileUrl) return;
        feito.current = alvo;

        setLendo({ progresso: null, erro: null });
        const { paginas: lidas, completo } = await varrer(formato, fileUrl, bookId, {
          sinal: controle.signal,
          aoProgredir: (fracao) => {
            if (vivo) setLendo({ progresso: fracao, erro: null });
          },
        });
        if (!vivo) return;

        setPaginas(lidas);
        setLendo({ progresso: null, erro: null });
        // Varredura interrompida no meio não vira cache: guardada, o livro
        // ficaria com metade do texto pra sempre e a busca mentiria calada.
        if (completo) void salvarTextoBusca(bookId, lidas).catch(() => {});
        else feito.current = null;
      } catch (e) {
        if (!vivo) return;
        feito.current = null; // deixa tentar de novo
        setLendo({
          progresso: null,
          erro: e instanceof Error ? e.message : d.search.failed,
        });
      }
    })();

    return () => {
      vivo = false;
      controle.abort();
    };
  }, [ativo, fileUrl, bookId, formato, d]);

  /* ---------- fase 2: procurar ---------- */
  useEffect(() => {
    const id = setTimeout(() => setAplicado(termo), ESPERA_DIGITACAO);
    return () => clearTimeout(id);
  }, [termo]);

  const resultado = useMemo(() => {
    if (!paginas || aplicado.trim().length < MIN_TERMO) return null;
    return procurar(paginas, aplicado.trim());
  }, [paginas, aplicado]);

  return {
    achados: resultado?.achados ?? null,
    cortado: resultado?.cortado ?? false,
    progresso: lendo.progresso,
    carregando: !paginas && !lendo.erro,
    semTexto: !!paginas && paginas.every((p) => !p.trim()),
    erro: lendo.erro,
  };
}

/**
 * No PDF, ler é remontar o texto de cada página; no EPUB, é abrir cada capítulo
 * do zip. Mesma divisão que o `use-sumario` faz — os dois formatos chegam aqui
 * como uma lista de textos, e daí pra frente a busca não sabe a diferença.
 */
async function varrer(
  formato: BookFormat,
  fileUrl: string,
  bookId: string,
  opcoes: { sinal: AbortSignal; aoProgredir: (fracao: number) => void },
): Promise<{ paginas: string[]; completo: boolean }> {
  if (formato === "epub") {
    const { abrirEpubDaUrl, varrerTextoEpub } = await import("@/lib/epub-doc");
    return varrerTextoEpub(await abrirEpubDaUrl(fileUrl), opcoes);
  }

  const [{ abrirDoc }, { varrerTextoPdf }] = await Promise.all([
    import("@/lib/pdf"),
    import("@/lib/pdf-busca"),
  ]);
  return varrerTextoPdf(await abrirDoc(fileUrl), bookId, opcoes);
}
