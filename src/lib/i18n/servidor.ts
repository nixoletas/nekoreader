import { cookies, headers } from "next/headers";
import {
  COOKIE_IDIOMA,
  escolherLocale,
  idiomasDoCabecalho,
  type Locale,
} from "./config";
import { DICIONARIOS, type Dicionario } from "./dicionarios";

/**
 * O idioma deste pedido.
 *
 * A escolha explícita (cookie) ganha do palpite (`Accept-Language`), e o palpite
 * ganha do padrão. É a ordem que respeita quem trocou de idioma na mão: quem
 * pediu italiano num navegador em alemão pediu italiano de novo agora.
 */
export async function localeAtual(): Promise<Locale> {
  const escolhido = (await cookies()).get(COOKIE_IDIOMA)?.value;
  const doNavegador = idiomasDoCabecalho((await headers()).get("accept-language"));
  return escolherLocale([escolhido, ...doNavegador]);
}

/** Idioma + textos, pra quem monta a página no servidor. */
export async function i18nAtual(): Promise<{ locale: Locale; d: Dicionario }> {
  const locale = await localeAtual();
  return { locale, d: DICIONARIOS[locale] };
}
