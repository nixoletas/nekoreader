import type { Locale } from "./config";
import type { Plural } from "./dicionarios/tipo";

export type Valores = Record<string, string | number>;

/**
 * `"página {n} de {total}"` + `{ n: 12, total: 431 }` → `"página 12 de 431"`.
 *
 * Chave que ninguém passou fica como está (`{total}` aparece na tela) em vez de
 * sumir: um buraco visível na frase é achado na primeira olhada, um pedaço
 * faltando passa despercebido.
 */
export function fmt(modelo: string, valores: Valores = {}): string {
  return modelo.replace(/\{(\w+)\}/g, (inteiro, chave: string) =>
    chave in valores ? String(valores[chave]) : inteiro,
  );
}

/**
 * A forma certa da frase pra uma contagem, no idioma certo.
 *
 * `Intl.PluralRules` é quem sabe que o francês trata 0 como singular e que o
 * inglês não; escrever isso na mão daria errado em pelo menos um dos seis.
 * Só guardamos `one` e `other` porque nenhum dos seis idiomas precisa de mais —
 * um idioma com `few`/`many` (russo, polonês) exigiria ampliar o tipo `Plural`.
 */
export function plural(
  locale: Locale,
  n: number,
  formas: Plural,
  valores: Valores = {},
): string {
  let regra: Intl.LDMLPluralRule = n === 1 ? "one" : "other";
  try {
    regra = new Intl.PluralRules(locale).select(n);
  } catch {
    // Ambiente sem os dados do idioma: o palpite acima serve.
  }
  const modelo = regra === "one" ? formas.one : formas.other;
  return fmt(modelo, { n, ...valores });
}
