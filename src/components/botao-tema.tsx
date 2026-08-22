"use client";

import { Moon, MonitorCog, Sun } from "lucide-react";
import { useTema, type Tema } from "@/lib/tema";

const CICLO: Tema[] = ["sistema", "claro", "escuro"];

const ROTULO: Record<Tema, string> = {
  sistema: "Tema do aparelho",
  claro: "Tema claro",
  escuro: "Tema escuro",
};

const ICONE = {
  sistema: MonitorCog,
  claro: Sun,
  escuro: Moon,
} as const;

/**
 * Troca o tema num toque só, girando entre aparelho → claro → escuro.
 *
 * O rótulo diz pra onde o próximo toque leva, que é a única forma de um botão de
 * três estados não virar adivinhação.
 */
export default function BotaoTema({ className = "" }: { className?: string }) {
  const { tema, definir } = useTema();
  const proximo = CICLO[(CICLO.indexOf(tema) + 1) % CICLO.length];
  const Icone = ICONE[tema];

  return (
    <button
      onClick={() => definir(proximo)}
      title={`${ROTULO[tema]} · tocar para ${ROTULO[proximo].toLowerCase()}`}
      aria-label={`${ROTULO[tema]}. Mudar para ${ROTULO[proximo].toLowerCase()}`}
      className={`tap rounded-xl text-muted transition hover:text-foreground ${className}`}
    >
      <Icone className="h-5 w-5" aria-hidden />
    </button>
  );
}
