import type { Locale } from "../config";
import type { Dicionario } from "./tipo";
import { en } from "./en";
import { ptBR } from "./pt-BR";
import { es } from "./es";
import { fr } from "./fr";
import { de } from "./de";
import { it } from "./it";

/**
 * Todos os idiomas, importados de uma vez.
 *
 * Import estático e não dinâmico de propósito: quem monta a página é o servidor,
 * e lá o custo de ter os seis na memória é irrelevante. O navegador não recebe
 * nenhum deles — recebe só o objeto do idioma escolhido, serializado junto com
 * o resto da página.
 */
export const DICIONARIOS: Record<Locale, Dicionario> = {
  en,
  "pt-BR": ptBR,
  es,
  fr,
  de,
  it,
};

export type { Dicionario, Plural } from "./tipo";
