"use client";

import { useSyncExternalStore } from "react";
import { contagemFilaAtual, ouvirMudancas } from "@/lib/offline-db";

function inscreverOnline(ouvinte: () => void) {
  window.addEventListener("online", ouvinte);
  window.addEventListener("offline", ouvinte);
  return () => {
    window.removeEventListener("online", ouvinte);
    window.removeEventListener("offline", ouvinte);
  };
}

/** Conectividade — via evento do navegador (`online`/`offline`). */
export function useOnline(): boolean {
  return useSyncExternalStore(
    inscreverOnline,
    () => navigator.onLine,
    () => true, // no servidor não dá pra saber — corrige assim que hidrata no cliente
  );
}

/** Quantas alterações estão esperando pra sincronizar. */
export function useFilaPendente(): number {
  return useSyncExternalStore(ouvirMudancas, contagemFilaAtual, () => 0);
}
