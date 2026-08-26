"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { LOCALES, NOME_DO_IDIOMA, type Locale } from "@/lib/i18n/config";
import { useI18n, useTrocarIdioma } from "@/lib/i18n/cliente";

/** Altura que a lista pede pra caber sem virar rolagem, em px. */
const ALTURA_LISTA = 6 * 40 + 16;

/**
 * Troca de idioma.
 *
 * Lista própria, e não um `<select>`: o menu que o `<select>` abre é desenhado
 * pelo sistema operacional, e CSS não chega nele — sai cinza do Windows por cima
 * da paleta de papel, com a fonte do sistema e sem a cor de destaque. As únicas
 * alavancas que existem ali são o `color-scheme` e a cor do `<option>`, e nenhuma
 * das duas faz o menu combinar com o resto do app.
 *
 * O preço é ter que escrever o que o `<select>` dava de graça — teclado, foco,
 * papéis de acessibilidade —, e é o que está abaixo: `listbox` com
 * `aria-activedescendant`, setas pra andar, Enter pra escolher, Esc pra fechar,
 * toque fora pra desistir.
 *
 * Cada idioma aparece escrito nele mesmo ("Deutsch", e não "Alemão"): quem caiu
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

  const [aberto, setAberto] = useState(false);
  /** Pra cima quando não há espaço embaixo — o caso do seletor no rodapé. */
  const [paraCima, setParaCima] = useState(false);
  const [ativo, setAtivo] = useState(() => Math.max(0, LOCALES.indexOf(locale)));

  const caixaRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);
  const idLista = useId();

  const fechar = useCallback(
    (devolverFoco = true) => {
      setAberto(false);
      if (devolverFoco) botaoRef.current?.focus();
    },
    [],
  );

  const abrir = useCallback(() => {
    const caixa = botaoRef.current?.getBoundingClientRect();
    // Decide o lado **antes** de aparecer: a lista subindo depois de já estar na
    // tela seria um pulo, e no rodapé ela nasceria cortada.
    setParaCima(!!caixa && window.innerHeight - caixa.bottom < ALTURA_LISTA);
    setAtivo(Math.max(0, LOCALES.indexOf(locale)));
    setAberto(true);
  }, [locale]);

  // Aberta, a lista fica com o foco: é ela que responde às setas.
  useEffect(() => {
    if (aberto) listaRef.current?.focus();
  }, [aberto]);

  // Tocar fora desiste da troca. `pointerdown` e não `click` pra fechar já no
  // encostar do dedo, como todo menu do sistema faz.
  useEffect(() => {
    if (!aberto) return;
    const aoApontar = (e: PointerEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("pointerdown", aoApontar);
    return () => document.removeEventListener("pointerdown", aoApontar);
  }, [aberto]);

  function escolher(l: Locale) {
    fechar();
    if (l !== locale) trocar(l);
  }

  function aoTeclarNaLista(e: React.KeyboardEvent) {
    const ultimo = LOCALES.length - 1;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setAtivo((i) => (i >= ultimo ? 0 : i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setAtivo((i) => (i <= 0 ? ultimo : i - 1));
        break;
      case "Home":
        e.preventDefault();
        setAtivo(0);
        break;
      case "End":
        e.preventDefault();
        setAtivo(ultimo);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        escolher(LOCALES[ativo]);
        break;
      case "Escape":
        e.preventDefault();
        fechar();
        break;
      case "Tab":
        // Tab sai do menu inteiro, e não pro próximo item: a lista é um controle
        // só na ordem de tabulação, como o `<select>` era.
        fechar(false);
        break;
    }
  }

  return (
    <div ref={caixaRef} className={`relative ${className}`}>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            abrir();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        aria-label={`${d.lang.label}: ${NOME_DO_IDIOMA[locale]}`}
        title={d.lang.change}
        className={`flex h-10 items-center gap-1.5 rounded-xl border bg-surface pl-2.5 pr-2 text-sm font-medium transition ${
          aberto
            ? "border-accent text-foreground"
            : "border-border text-muted hover:border-accent/50 hover:text-foreground"
        }`}
      >
        <Languages className="h-4 w-4 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">
          {compacto ? codigo(locale) : NOME_DO_IDIOMA[locale]}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${
            aberto ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>

      {aberto && (
        <ul
          ref={listaRef}
          id={idLista}
          role="listbox"
          tabIndex={-1}
          aria-label={d.lang.label}
          aria-activedescendant={`${idLista}-${ativo}`}
          onKeyDown={aoTeclarNaLista}
          className={`sobe absolute right-0 z-50 max-h-[min(18rem,60dvh)] min-w-[10.5rem] overflow-y-auto rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow)] outline-none ${
            paraCima ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {LOCALES.map((l, i) => {
            const escolhido = l === locale;
            return (
              <li
                key={l}
                id={`${idLista}-${i}`}
                role="option"
                aria-selected={escolhido}
                onClick={() => escolher(l)}
                onPointerEnter={() => setAtivo(i)}
                className={`flex h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-sm transition ${
                  i === ativo ? "bg-accent/10 text-accent" : "text-foreground"
                }`}
              >
                <Check
                  className={`h-4 w-4 shrink-0 ${escolhido ? "opacity-100" : "opacity-0"}`}
                  aria-hidden
                />
                <span className="whitespace-nowrap">{NOME_DO_IDIOMA[l]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** "pt-BR" → "PT" — a sigla que cabe na barra do leitor. */
function codigo(locale: Locale): string {
  return locale.slice(0, 2).toUpperCase();
}
