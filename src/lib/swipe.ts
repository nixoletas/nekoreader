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
