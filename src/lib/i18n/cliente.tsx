"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  COOKIE_IDIOMA,
  COOKIE_IDIOMA_MAX_AGE,
  LOCALE_PADRAO,
  type Locale,
} from "./config";
import type { Dicionario, Plural } from "./dicionarios";
import { fmt, plural, type Valores } from "./formato";

type Contexto = {
  locale: Locale;
  d: Dicionario;
};

const I18nContext = createContext<Contexto | null>(null);

/**
 * O idioma e os textos, vindos prontos do servidor.
 *
 * O dicionário chega como prop e não é buscado aqui: assim o navegador baixa um
 * idioma só (o escolhido), e a primeira pintura já sai na língua certa — sem o
 * lampejo de inglês que um carregamento no cliente daria.
 */
export function I18nProvider({
  locale,
  dicionario,
  children,
}: {
  locale: Locale;
  dicionario: Dicionario;
  children: React.ReactNode;
}) {
  const valor = useMemo(() => ({ locale, d: dicionario }), [locale, dicionario]);
  return <I18nContext.Provider value={valor}>{children}</I18nContext.Provider>;
}

function useContexto(): Contexto {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT precisa estar dentro de <I18nProvider>");
  return ctx;
}

/** Os textos do idioma em vigor: `const d = useT(); d.common.save`. */
export function useT(): Dicionario {
  return useContexto().d;
}

export function useLocale(): Locale {
  return useContexto().locale;
}

/**
 * Textos + as duas ferramentas que quase todo texto acaba precisando.
 *
 * `t` preenche `{chaves}`; `p` escolhe entre singular e plural. Vêm daqui, e não
 * de um import solto, porque os dois dependem do idioma em vigor.
 */
export function useI18n(): {
  locale: Locale;
  d: Dicionario;
  t: (modelo: string, valores?: Valores) => string;
  p: (formas: Plural, n: number, valores?: Valores) => string;
} {
  const { locale, d } = useContexto();
  const p = useCallback(
    (formas: Plural, n: number, valores?: Valores) => plural(locale, n, formas, valores),
    [locale],
  );
  return { locale, d, t: fmt, p };
}

/**
 * Troca o idioma: grava o cookie e pede a página de novo.
 *
 * Cookie e não `localStorage` porque quem escolhe o dicionário é o servidor —
 * é isso que faz o `<html lang>` e o texto da landing já nascerem certos, em vez
 * de trocarem depois que o React monta.
 */
export function useTrocarIdioma(): (novo: Locale) => void {
  const router = useRouter();
  return useCallback(
    (novo: Locale) => {
      try {
        document.cookie = `${COOKIE_IDIOMA}=${novo}; path=/; max-age=${COOKIE_IDIOMA_MAX_AGE}; samesite=lax`;
      } catch {
        // Cookies bloqueados: a escolha não sobrevive à próxima visita, mas o
        // refresh abaixo ainda não teria como aplicá-la — nada a fazer aqui.
      }
      router.refresh();
    },
    [router],
  );
}

export { LOCALE_PADRAO };
