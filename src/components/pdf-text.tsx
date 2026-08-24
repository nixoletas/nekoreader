"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abrirDoc } from "@/lib/pdf";
import { CachePaginas } from "@/lib/pdf-cache";
import { extrairBlocos } from "@/lib/pdf-text";
import { obterOcr, salvarOcr } from "@/lib/offline-db";
import type { Bloco } from "@/lib/pdf-blocos";
import LeitorTexto, { revogarBlocos } from "@/components/leitor-texto";
import type { Highlight, HighlightColor, TextSpan } from "@/lib/types";

// Quantas páginas já remontadas (com os recortes de imagem) ficam guardadas — folhear
// pra trás e pra frente não reprocessa. Cada entrada pode carregar algumas imagens em
// memória, então o tamanho fica moderado de propósito.
const PAGINAS_EM_CACHE = 8;

/** Modo texto do PDF: remonta a página em blocos e entrega pro leitor comum. */
export default function PdfText({
  fileUrl,
  bookId,
  pageNumber,
  escala,
  highlights,
  onLoadSuccess,
  onAddHighlight,
  onDeleteHighlight,
  onSwipe,
  onModoPagina,
}: {
  fileUrl: string;
  /** Identifica o livro pra guardar o que o OCR reconhecer. */
  bookId: string;
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
  onModoPagina: () => void;
}) {
  const [blocos, setBlocos] = useState<Bloco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  /** Reconhecimento de página digitalizada em andamento. */
  const [lendoImagem, setLendoImagem] = useState(false);
  const ocrEmCurso = useRef<AbortController | null>(null);

  // Páginas já remontadas — o cache é dono dos object URL das imagens que guarda.
  const [cache] = useState(
    () => new CachePaginas<Bloco[]>(PAGINAS_EM_CACHE, revogarBlocos),
  );
  useEffect(() => () => cache.limpar(), [cache]);

  // Trocar de página limpa o texto antigo — ou já mostra o que tava em cache, sem
  // piscar o esqueleto de carregamento à toa (ajuste de estado durante o render).
  const alvo = `${fileUrl}#${pageNumber}`;
  const [alvoAnterior, setAlvoAnterior] = useState(alvo);
  if (alvoAnterior !== alvo) {
    setAlvoAnterior(alvo);
    setBlocos(cache.obter(alvo) ?? null);
    setErro(null);
    setProgresso(null);
    setLendoImagem(false);
  }

  useEffect(() => {
    let vivo = true;
    const chave = `${fileUrl}#${pageNumber}`;

    (async () => {
      try {
        const doc = await abrirDoc(fileUrl, (fracao) => {
          if (vivo) setProgresso(Math.round(fracao * 100));
        });
        if (!vivo) return;
        setProgresso(null);
        onLoadSuccess(doc.numPages);
        if (pageNumber > doc.numPages) return;
        if (cache.obter(chave)) return; // já em cache — nada a reprocessar

        const extraidos = await extrairBlocos(doc, pageNumber);
        if (!vivo) {
          revogarBlocos(extraidos);
          return;
        }

        // Página digitalizada: se o OCR já rodou nela alguma vez, o texto
        // reconhecido entra no lugar do nada que o PDF tem a oferecer.
        const semTexto = !extraidos.some((b) => b.tipo !== "imagem");
        const guardado = semTexto ? await obterOcr(bookId, pageNumber) : undefined;
        if (!vivo) {
          revogarBlocos(extraidos);
          return;
        }

        const finais = guardado ?? extraidos;
        cache.definir(chave, finais);
        setBlocos(finais);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Falhou ao ler o PDF.");
      }
    })();

    return () => {
      vivo = false;
      // Virar a página no meio de um OCR joga fora o reconhecimento: ele é da
      // página que saiu da tela.
      ocrEmCurso.current?.abort();
    };
  }, [fileUrl, bookId, pageNumber, onLoadSuccess, cache]);

  /**
   * Lê a página digitalizada com OCR, a pedido.
   *
   * Nunca automático: são segundos de processador por página e, na primeira vez,
   * o download do dicionário do idioma. Quem decide pagar isso é a pessoa — e o
   * resultado fica guardado, então ela paga uma vez por página.
   */
  const rodarOcr = useCallback(async () => {
    ocrEmCurso.current?.abort();
    const meu = new AbortController();
    ocrEmCurso.current = meu;
    setLendoImagem(true);
    setErro(null);

    try {
      const { blocosPorOcr } = await import("@/lib/pdf-ocr");
      const doc = await abrirDoc(fileUrl);
      const lidos = await blocosPorOcr(doc, pageNumber, { sinal: meu.signal });
      if (meu.signal.aborted) return;

      cache.definir(`${fileUrl}#${pageNumber}`, lidos);
      setBlocos(lidos);
      void salvarOcr(bookId, pageNumber, lidos).catch(() => {});
    } catch (e) {
      if (meu.signal.aborted) return;
      setErro(
        e instanceof Error && e.message
          ? `Não consegui reconhecer o texto: ${e.message}`
          : "Não consegui reconhecer o texto desta página.",
      );
    } finally {
      if (!meu.signal.aborted) setLendoImagem(false);
    }
  }, [fileUrl, bookId, pageNumber, cache]);

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
      onModoPagina={onModoPagina}
      onOcr={() => void rodarOcr()}
      lendoImagem={lendoImagem}
      textoSemConteudo="Esta página não tem camada de texto — é digitalizada. Dá pra reconhecer o texto dela aqui mesmo, no seu aparelho."
    />
  );
}
