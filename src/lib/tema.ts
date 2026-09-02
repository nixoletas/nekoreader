"use client";

import { useEffect } from "react";
import { usePreferencia } from "@/lib/prefs";

/**
 * Claro ou escuro, e mais nada.
 *
 * Não existe modo "acompanha o aparelho": o sistema decide só na primeira
 * abertura, e daí em diante vale a escolha da pessoa. Quem lê à noite quase
 * sempre quer o escuro o tempo todo, e não que o livro clareie sozinho de manhã.
 */
export type Tema = "claro" | "escuro";

export const CHAVE_TEMA = "neko:theme";

/** Cor do papel em cada tema — é ela que a barra do navegador copia.
 *  Tem que bater com `--paper` do `globals.css`, senão a barra destoa da página. */
const PAPEL: Record<Tema, string> = {
  claro: "#f0e7d5",
  escuro: "#000000",
};

/**
 * Script que roda no `<head>`, antes da primeira pintura.
 *
 * Faz o que o React não teria como fazer a tempo:
 *
 * 1. resolve o tema e marca o `<html>` — sem isso a página nasceria clara e
 *    piscaria pro escuro quando o React montasse;
 * 2. na primeira abertura, herda o tema do aparelho **e guarda** — é assim que o
 *    sistema entra na conta uma vez só, sem virar um modo permanente;
 * 3. cria a `<meta name="theme-color">` com a cor certa, pra barra do navegador
 *    (e a do PWA) já abrir combinando.
 *
 * Tudo dentro de try/catch: `localStorage` pode estar bloqueado (janela anônima,
 * cookies desligados) e um erro aqui deixaria a página em branco.
 */
export const SCRIPT_TEMA = `(function(){try{
var K=${JSON.stringify(CHAVE_TEMA)},P=${JSON.stringify(PAPEL)};
var t=null;try{t=localStorage.getItem(K)}catch(e){}
if(t!=="claro"&&t!=="escuro"){
t=matchMedia("(prefers-color-scheme: dark)").matches?"escuro":"claro";
try{localStorage.setItem(K,t)}catch(e){}
}
document.documentElement.dataset.tema=t;
var m=document.createElement("meta");m.name="theme-color";m.content=P[t];
document.head.appendChild(m);
}catch(e){}})();`;

/** O tema que o aparelho pede — só serve de ponto de partida. */
function temaDoAparelho(): Tema {
  if (typeof window === "undefined") return "claro";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/** Tema em vigor e como trocar. */
export function useTema(): { tema: Tema; definir: (t: Tema) => void } {
  // O padrão é o do aparelho, e não uma cor fixa: se o armazenamento estiver
  // bloqueado (janela anônima), o script do <head> não teve onde guardar, e o
  // padrão precisa combinar com o que ele pintou — senão a tela viraria sozinha
  // logo depois de abrir.
  const [tema, definir] = usePreferencia<Tema>(CHAVE_TEMA, temaDoAparelho(), (v) =>
    v === "claro" || v === "escuro" ? v : null,
  );

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    // A barra do navegador (e a do PWA) segue a mesma cor do papel.
    //
    // Cria a meta se ela não estiver lá: o React reconcilia o `<head>` na
    // hidratação e joga fora o que não veio da árvore dele — inclusive a que o
    // script do <head> tinha acabado de pôr. Aqui é depois da hidratação, então
    // o que for criado agora fica.
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = PAPEL[tema];
  }, [tema]);

  return { tema, definir };
}
