/**
 * Que idiomas o app fala, e como ele decide qual usar.
 *
 * Nada aqui importa React nem `next/headers`: este módulo é lido pelo servidor
 * (pra escolher o idioma do pedido) e pelo cliente (pra trocar de idioma na
 * mão), e uma dependência de qualquer um dos dois lados quebraria o outro.
 */

export const LOCALES = ["en", "pt-BR", "es", "fr", "de", "it"] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * Inglês é o padrão, e também o fallback de tradução.
 *
 * Não é o idioma de quem escreveu o app; é o idioma que mais gente consegue ler
 * quando o palpite do navegador não bate com nenhum dicionário nosso.
 */
export const LOCALE_PADRAO: Locale = "en";

/** Onde a escolha fica guardada. Cookie, e não localStorage, porque o servidor precisa ler. */
export const COOKIE_IDIOMA = "neko_lang";

/** Um ano — trocar de idioma é decisão que não se repete toda semana. */
export const COOKIE_IDIOMA_MAX_AGE = 60 * 60 * 24 * 365;

/** Como cada idioma se chama no próprio idioma — é assim que o seletor lista. */
export const NOME_DO_IDIOMA: Record<Locale, string> = {
  en: "English",
  "pt-BR": "Português",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
};

/**
 * Idiomas do tesseract, pro OCR de página digitalizada.
 *
 * Sempre com `eng` junto: livro técnico em qualquer idioma vem cheio de termo,
 * nome próprio e trecho de código em inglês, e o dicionário do idioma sozinho
 * erra neles.
 */
export const IDIOMAS_OCR: Record<Locale, string> = {
  en: "eng",
  "pt-BR": "por+eng",
  es: "spa+eng",
  fr: "fra+eng",
  de: "deu+eng",
  it: "ita+eng",
};

const POR_PREFIXO: Record<string, Locale> = {
  en: "en",
  pt: "pt-BR",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
};

/**
 * "PT-br", "pt", "pt-PT", "en-US" → um dos nossos, ou `null`.
 *
 * O prefixo basta porque só temos uma variante de cada idioma: quem pede
 * `pt-PT` prefere português brasileiro a inglês, e quem pede `en-GB` prefere
 * inglês americano a nada.
 */
export function normalizarLocale(bruto: string | undefined | null): Locale | null {
  if (!bruto) return null;
  const limpo = bruto.trim().toLowerCase();
  if (!limpo) return null;

  const exato = LOCALES.find((l) => l.toLowerCase() === limpo);
  if (exato) return exato;

  return POR_PREFIXO[limpo.split(/[-_]/)[0]] ?? null;
}

/**
 * O primeiro idioma da lista que a gente fala.
 *
 * A lista costuma vir do `Accept-Language` ou do `navigator.languages`, já em
 * ordem de preferência — então "o primeiro que serve" é literalmente a resposta
 * certa, sem precisar pesar qualidade (`q=`).
 */
export function escolherLocale(candidatos: readonly (string | undefined | null)[]): Locale {
  for (const c of candidatos) {
    const achado = normalizarLocale(c);
    if (achado) return achado;
  }
  return LOCALE_PADRAO;
}

/**
 * `Accept-Language: pt-BR,pt;q=0.9,en;q=0.8` → `["pt-BR", "pt", "en"]`.
 *
 * Ordena pelo `q` de verdade em vez de confiar na ordem de escrita: navegador
 * costuma mandar já ordenado, mas o cabeçalho não obriga.
 */
export function idiomasDoCabecalho(cabecalho: string | undefined | null): string[] {
  if (!cabecalho) return [];
  return cabecalho
    .split(",")
    .map((parte) => {
      const [tag, ...params] = parte.trim().split(";");
      const q = params
        .map((p) => /^\s*q=([\d.]+)\s*$/i.exec(p))
        .find(Boolean)?.[1];
      return { tag: tag.trim(), q: q === undefined ? 1 : Number(q) || 0 };
    })
    .filter((x) => x.tag && x.tag !== "*")
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
}
