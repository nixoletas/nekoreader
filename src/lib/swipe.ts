"use client";

import { useRef } from "react";

/**
 * Deslizar o dedo na horizontal vira a página.
 * Ignora quando há texto selecionado ou quando `bloqueado`.
 */
export function useSwipe(onSwipe: (dir: 1 | -1) => void, bloqueado = false) {
  const toque = useRef<{ x: number; y: number; t: number } | null>(null);

  return {
    onTouchStart(e: React.TouchEvent) {
      // Dedo que começa dentro de um bloco de código ou tabela larga está lendo o
      // resto daquele bloco, não pedindo pra virar a página.
      if (rolaNaHorizontal(e.target)) {
        toque.current = null;
        return;
      }
      const t = e.touches[0];
      toque.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    },
    onTouchEnd(e: React.TouchEvent) {
      const ini = toque.current;
      toque.current = null;
      if (!ini || bloqueado) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;

      const t = e.changedTouches[0];
      const dx = t.clientX - ini.x;
      const dy = t.clientY - ini.y;
      if (Date.now() - ini.t > 700) return;
      if (Math.abs(dx) < 70 || Math.abs(dy) > 60) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
  };
}

/**
 * O toque caiu dentro de algo que rola pro lado?
 *
 * Sobe pelos pais até a raiz procurando alguém que **tenha** conteúdo sobrando na
 * horizontal (`scrollWidth > clientWidth`) **e** esteja configurado pra rolar.
 * As duas condições juntas importam: código curto que cabe na coluna não rola,
 * e continuar virando a página ali é o certo.
 */
function rolaNaHorizontal(alvo: EventTarget | null): boolean {
  let el = alvo instanceof Element ? alvo : null;

  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overflow = getComputedStyle(el).overflowX;
      if (overflow === "auto" || overflow === "scroll") return true;
    }
    el = el.parentElement;
  }

  return false;
}
