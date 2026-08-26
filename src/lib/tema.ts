"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { usePreferencia } from "@/lib/prefs";

export type Tema = "sistema" | "claro" | "escuro";
export type TemaResolvido = "claro" | "escuro";

export const CHAVE_TEMA = "neko:theme";

/** Cor do papel em cada tema — é ela que a barra do navegador copia. */
const PAPEL: Record<TemaResolvido, string> = {
  claro: "#f4eee2",
  escuro: "#15120e",
};

/**
 * Script que roda no `<head>`, antes da primeira pintura.
 *
 * Faz três coisas que o React não teria como fazer a tempo:
 *
 * 1. resolve o tema e marca o `<html>` — sem isso a página nasceria clara e
 *    piscaria pro escuro quando o React montasse;
 * 2. cria a `<meta name="theme-color">` com a cor certa, pra barra do navegador
 *    (e a do PWA) já abrir combinando;
 * 3. fica ouvindo o sistema, pra quem escolheu "aparelho" ver a virada acontecer
 *    mesmo numa tela onde o seletor de tema não existe (login, por exemplo).
 *
 * Tudo dentro de try/catch: `localStorage` pode estar bloqueado (janela anônima,
 * cookies desligados) e um erro aqui deixaria a página em branco.
 */
export const SCRIPT_TEMA = `(function(){try{
var K=${JSON.stringify(CHAVE_TEMA)},P=${JSON.stringify(PAPEL)};
var mq=matchMedia("(prefers-color-scheme: dark)");
var m=document.createElement("meta");m.name="theme-color";
document.head.appendChild(m);
function ap(){
var t=null;try{t=localStorage.getItem(K)}catch(e){}
var r=t==="escuro"||(t!=="claro"&&mq.matches)?"escuro":"claro";
document.documentElement.dataset.tema=r;m.content=P[r];
}
ap();mq.addEventListener("change",ap);
}catch(e){}})();`;

/** Assina o `prefers-color-scheme` do sistema. */
function assinarSistema(aoMudar: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

function sistemaEscuro() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Tema escolhido, tema em vigor e como trocar.
 *
 * "sistema" acompanha o aparelho e continua acompanhando: se o celular virar pro
 * modo escuro à noite no meio da leitura, a página vira junto.
 */
export function useTema(): {
  tema: Tema;
  resolvido: TemaResolvido;
  definir: (t: Tema) => void;
} {
  const [tema, definirTema] = usePreferencia<Tema>(CHAVE_TEMA, "sistema", (v) =>
    v === "claro" || v === "escuro" || v === "sistema" ? v : null,
  );

  const escuroNoSistema = useSyncExternalStore(
    assinarSistema,
    sistemaEscuro,
    () => false, // no servidor não dá pra saber; o script do <head> corrige antes de pintar
  );

  const resolvido: TemaResolvido =
    tema === "sistema" ? (escuroNoSistema ? "escuro" : "claro") : tema;

  useEffect(() => {
    document.documentElement.dataset.tema = resolvido;
    // A barra do navegador (e a do PWA) segue a mesma cor do papel.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", PAPEL[resolvido]);
  }, [resolvido]);

  const definir = useCallback((t: Tema) => definirTema(t), [definirTema]);

  return { tema, resolvido, definir };
}
