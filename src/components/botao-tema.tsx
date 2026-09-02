"use client";

import { Moon, Sun } from "lucide-react";
import { useTema, type Tema } from "@/lib/tema";
import { useI18n } from "@/lib/i18n/cliente";
import type { Dicionario } from "@/lib/i18n/dicionarios";

function rotulo(d: Dicionario, t: Tema): string {
  return t === "claro" ? d.theme.lightLong : d.theme.darkLong;
}

/**
 * O mesmo rótulo, na forma que cabe no meio de uma frase.
 *
 * Não dá pra baixar a caixa por conta própria: em alemão "Helles Design" vira
 * "helles Design", com o substantivo intacto — `toLowerCase()` estragaria.
 */
function rotuloNaFrase(d: Dicionario, t: Tema): string {
  return t === "claro" ? d.theme.lightLower : d.theme.darkLower;
}

/** Interruptor de dois estados: o ícone mostra pra onde o toque leva. */
export default function BotaoTema({ className = "" }: { className?: string }) {
  const { tema, definir } = useTema();
  const { d, t } = useI18n();
  const proximo: Tema = tema === "escuro" ? "claro" : "escuro";
  // O ícone é o do destino, não o do estado atual: num interruptor de dois
  // estados é o destino que a pessoa procura.
  const Icone = proximo === "escuro" ? Moon : Sun;

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
