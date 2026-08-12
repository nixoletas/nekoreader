"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Preferência guardada no localStorage.
 *
 * `useSyncExternalStore` em vez de useEffect: o servidor renderiza o padrão e o
 * cliente troca pelo valor salvo sem descasar a hidratação.
 */
const ouvintes = new Set<() => void>();

function inscrever(ouvinte: () => void) {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

export function usePreferencia<T extends string | number>(
  chave: string,
  padrao: T,
  interpretar: (bruto: string) => T | null,
): [T, (valor: T) => void] {
  const valor = useSyncExternalStore(
    inscrever,
    () => {
      const bruto = localStorage.getItem(chave);
      const lido = bruto === null ? null : interpretar(bruto);
      return lido === null ? padrao : lido;
    },
    () => padrao,
  );

  const definir = useCallback(
    (novo: T) => {
      localStorage.setItem(chave, String(novo));
      for (const ouvinte of ouvintes) ouvinte();
    },
    [chave],
  );

  return [valor, definir];
}
