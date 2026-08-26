import type { en } from "./en";

/**
 * O mesmo formato do dicionário inglês, com os textos soltos de volta em `string`.
 *
 * O `as const` do `en.ts` é o que faz cada chave existir no tipo; sem alargar os
 * literais depois, nenhuma tradução caberia (o tipo exigiria a frase em inglês,
 * palavra por palavra). Assim o TypeScript cobra **as chaves** de cada idioma e
 * ignora **o conteúdo** — que é exatamente a divisão de trabalho que se quer.
 */
type Alargado<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Alargado<U>[]
    : { readonly [K in keyof T]: Alargado<T[K]> };

export type Dicionario = Alargado<typeof en>;

/** Frase que muda com a contagem. `Intl.PluralRules` escolhe a forma. */
export type Plural = { readonly one: string; readonly other: string };
