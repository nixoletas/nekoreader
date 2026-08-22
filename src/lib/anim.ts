"use client";

import { useEffect, type RefObject } from "react";

/** Mesma entrada da folha no modo texto — em passo e curva iguais. */
const DURACAO = 220;

/**
 * Anima a entrada de uma página quando `chave` muda.
 *
 * Aqui a animação é disparada por script, e não por CSS com `key`, porque trocar
 * a chave remontaria o `<Page>` do react-pdf e jogaria fora o canvas já
 * desenhado — a virada ficaria mais lenta, não mais suave.
 */
export function useEntradaDaFolha(alvo: RefObject<HTMLElement | null>, chave: unknown) {
  useEffect(() => {
    const el = alvo.current;
    if (!el || typeof el.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const animacao = el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: DURACAO, easing: "ease-out" },
    );
    return () => animacao.cancel();
  }, [alvo, chave]);
}
