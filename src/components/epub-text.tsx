"use client";

import { useEffect, useState } from "react";
import { CachePaginas } from "@/lib/pdf-cache";
import { abrirEpubDaUrl, blocosDoEpub } from "@/lib/epub-doc";
import type { Bloco } from "@/lib/pdf-blocos";
import LeitorTexto, { revogarBlocos } from "@/components/leitor-texto";
import { useI18n } from "@/lib/i18n/cliente";
import { textoDoErro } from "@/lib/erros";
import type { Highlight, HighlightColor, TextSpan } from "@/lib/types";

/**
 * Leitura de EPUB.
 *
 * Aqui não existe "página": o que vira número de página é o capítulo. Isso é o
 * que faz progresso, marcador, marcação e sumário continuarem funcionando sem
 * nenhum caso especial — o resto do app nunca precisa saber a diferença.
 */
const CAPITULOS_EM_CACHE = 4;

export default function EpubText({
  fileUrl,
  pageNumber,
  escala,
  highlights,
  onLoadSuccess,
  onAddHighlight,
  onDeleteHighlight,
  onSwipe,
}: {
  fileUrl: string;
  /** Número do capítulo, 1 em diante. */
  pageNumber: number;
  escala: number;
  highlights: Highlight[];
  onLoadSuccess: (numPages: number) => void;
  onAddHighlight: (
    spans: TextSpan[],
    text: string,
    color: HighlightColor,
  ) => Promise<void>;
  onDeleteHighlight: (id: string) => Promise<void>;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const { d, t } = useI18n();
  const [blocos, setBlocos] = useState<Bloco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);

  const [cache] = useState(
    () => new CachePaginas<Bloco[]>(CAPITULOS_EM_CACHE, revogarBlocos),
  );
  useEffect(() => () => cache.limpar(), [cache]);

  const alvo = `${fileUrl}#${pageNumber}`;
  const [alvoAnterior, setAlvoAnterior] = useState(alvo);
  if (alvoAnterior !== alvo) {
    setAlvoAnterior(alvo);
    setBlocos(cache.obter(alvo) ?? null);
    setErro(null);
    setProgresso(null);
  }

  useEffect(() => {
    let vivo = true;
    const chave = `${fileUrl}#${pageNumber}`;

    (async () => {
      try {
        const epub = await abrirEpubDaUrl(
          fileUrl,
          (fracao) => {
            if (vivo) setProgresso(Math.round(fracao * 100));
          },
          (n) => t(d.unit.chapterN, { n }),
        );
        if (!vivo) return;
        setProgresso(null);
        onLoadSuccess(epub.capitulos.length);
        if (pageNumber > epub.capitulos.length) return;
        if (cache.obter(chave)) return;

        const extraidos = await blocosDoEpub(epub, pageNumber);
        if (!vivo) {
          revogarBlocos(extraidos);
          return;
        }
        cache.definir(chave, extraidos);
        setBlocos(extraidos);
      } catch (e) {
        if (vivo) setErro(textoDoErro(d, e));
      }
    })();

    return () => {
      vivo = false;
    };
  }, [fileUrl, pageNumber, onLoadSuccess, cache, d, t]);

  return (
    <LeitorTexto
      chave={alvo}
      blocos={blocos}
      erro={erro}
      progresso={progresso}
      escala={escala}
      highlights={highlights}
      onAddHighlight={onAddHighlight}
      onDeleteHighlight={onDeleteHighlight}
      onSwipe={onSwipe}
      textoSemConteudo={d.text.emptyChapter}
    />
  );
}
