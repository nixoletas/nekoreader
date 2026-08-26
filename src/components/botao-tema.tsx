"use client";

import { Moon, MonitorCog, Sun } from "lucide-react";
import { useTema, type Tema } from "@/lib/tema";
import { useI18n } from "@/lib/i18n/cliente";
import type { Dicionario } from "@/lib/i18n/dicionarios";

const CICLO: Tema[] = ["sistema", "claro", "escuro"];

const ICONE = {
  sistema: MonitorCog,
  claro: Sun,
  escuro: Moon,
} as const;

function rotulo(d: Dicionario, t: Tema): string {
  return t === "claro" ? d.theme.lightLong : t === "escuro" ? d.theme.darkLong : d.theme.systemLong;
}

/**
 * O mesmo rótulo, na forma que cabe no meio de uma frase.
 *
 * Não dá pra baixar a caixa por conta própria: em alemão "Helles Design" vira
 * "helles Design", com o substantivo intacto — `toLowerCase()` estragaria.
 */
function rotuloNaFrase(d: Dicionario, t: Tema): string {
  return t === "claro" ? d.theme.lightLower : t === "escuro" ? d.theme.darkLower : d.theme.systemLower;
}

/**
 * Troca o tema num toque só, girando entre aparelho → claro → escuro.
 *
 * O rótulo diz pra onde o próximo toque leva, que é a única forma de um botão de
 * três estados não virar adivinhação.
 */
export default function BotaoTema({ className = "" }: { className?: string }) {
  const { tema, definir } = useTema();
  const { d, t } = useI18n();
  const proximo = CICLO[(CICLO.indexOf(tema) + 1) % CICLO.length];
  const Icone = ICONE[tema];

  const atual = rotulo(d, tema);
  const seguinte = rotuloNaFrase(d, proximo);

  return (
    <button
      onClick={() => definir(proximo)}
      title={t(d.theme.hint, { current: atual, next: seguinte })}
      aria-label={t(d.theme.aria, { current: atual, next: seguinte })}
      className={`tap rounded-xl text-muted transition hover:text-foreground ${className}`}
    >
      <Icone className="h-5 w-5" aria-hidden />
    </button>
  );
}
