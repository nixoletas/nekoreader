"use client";

import { Languages } from "lucide-react";
import { LOCALES, NOME_DO_IDIOMA, type Locale } from "@/lib/i18n/config";
import { useI18n, useTrocarIdioma } from "@/lib/i18n/cliente";

/**
 * Troca de idioma.
 *
 * `<select>` de verdade em vez de um menu desenhado à mão: no celular ele vira a
 * roda nativa do sistema, funciona com teclado e leitor de tela sem nada escrito
 * aqui, e a lista de seis idiomas cabe nele sem ficar comprida.
 *
 * Cada idioma aparece escrito nele mesmo ("Deutsch", e não "Alemão"): quem está
 * numa tela em idioma que não entende procura a palavra que reconhece.
 */
export default function SeletorIdioma({
  className = "",
  compacto = false,
}: {
  className?: string;
  /** Só o ícone e a sigla — pra barra de cima, onde não sobra largura. */
  compacto?: boolean;
}) {
  const { locale, d } = useI18n();
  const trocar = useTrocarIdioma();

  return (
    <label
      className={`relative flex items-center gap-1.5 text-muted transition hover:text-foreground ${className}`}
      title={d.lang.change}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">{d.lang.label}</span>
      <select
        value={locale}
        onChange={(e) => trocar(e.target.value as Locale)}
        // `appearance-none` some com a setinha do sistema, que ficaria enorme ao
        // lado de um ícone de 16px; o campo continua sendo um select de verdade.
        className="cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium outline-none focus-visible:underline"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} className="bg-surface text-foreground">
            {compacto ? l.slice(0, 2).toUpperCase() : NOME_DO_IDIOMA[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
