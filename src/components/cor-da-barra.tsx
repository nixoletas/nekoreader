"use client";

import { useTema } from "@/lib/tema";

/**
 * Mantém a `<meta name="theme-color">` combinando com o tema, em toda página.
 *
 * Não desenha nada: existe só porque o `useTema` precisa de alguém que o chame.
 * Sem isso, a barra do navegador só ficaria certa nas telas que têm o botão de
 * tema — a leitura teria a cor certa e a de entrar, não.
 */
export default function CorDaBarra() {
  useTema();
  return null;
}
