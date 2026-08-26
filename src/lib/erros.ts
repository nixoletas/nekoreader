import type { Dicionario } from "@/lib/i18n/dicionarios";
import { fmt } from "@/lib/i18n/formato";

/**
 * Falhas que a pessoa vê, ditas por código em vez de frase.
 *
 * Quem descobre a falha (`epub.ts`, `trocar-capa.ts`) é código puro, sem React e
 * sem dicionário — não tem como saber em que idioma a tela está. Então ele joga
 * um código, e a tela, que sabe, traduz na hora de mostrar.
 *
 * Vale só pro que a pessoa precisa entender e resolver. Erro de rede ou do
 * Supabase continua passando cru: um inglês obscuro do servidor ainda diz mais
 * que um "algo deu errado" nosso.
 */
export const ERRO = {
  epubSemCapitulos: "epub-sem-capitulos",
  epubInvalido: "epub-invalido",
  epubSemOpf: "epub-sem-opf",
  baixarLivro: "baixar-livro",
  urlNaoGerada: "url-nao-gerada",
  capaNaoImagem: "capa-nao-imagem",
  capaGrande: "capa-grande",
  capaFalhou: "capa-falhou",
} as const;

export type CodigoErro = (typeof ERRO)[keyof typeof ERRO];

export class ErroApp extends Error {
  constructor(
    readonly codigo: CodigoErro,
    /** O que o mundo lá fora disse: um status HTTP, um limite. */
    readonly detalhe?: string,
  ) {
    super(codigo);
    this.name = "ErroApp";
  }
}

/** O texto que vai pra tela: traduzido quando é nosso, cru quando é de fora. */
export function textoDoErro(d: Dicionario, e: unknown): string {
  if (e instanceof ErroApp) {
    switch (e.codigo) {
      case ERRO.epubSemCapitulos:
        return d.fail.epubNoChapters;
      case ERRO.epubInvalido:
        return d.fail.epubInvalid;
      case ERRO.epubSemOpf:
        return d.fail.epubNoOpf;
      case ERRO.baixarLivro:
        return fmt(d.fail.bookDownload, { detail: e.detalhe ?? "" }).trim();
      case ERRO.urlNaoGerada:
        return d.reader.urlFailed;
      case ERRO.capaNaoImagem:
        return d.fail.coverNotImage;
      case ERRO.capaGrande:
        return fmt(d.fail.coverTooBig, { max: e.detalhe ?? "" });
      case ERRO.capaFalhou:
        return d.fail.coverProcess;
    }
  }
  if (e instanceof Error && e.message) return e.message;
  return d.fail.generic;
}
