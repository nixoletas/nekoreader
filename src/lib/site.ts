/**
 * O endereço público do app.
 *
 * Existe porque metadata de rede social não aceita caminho relativo: o
 * `og:image` de um link compartilhado precisa da URL inteira, e sem ela o
 * WhatsApp e o Twitter mostram o link pelado. É daqui que saem o `metadataBase`,
 * o `robots.txt` e o `sitemap.xml`.
 *
 * A ordem tem um porquê:
 *
 * 1. `NEXT_PUBLIC_SITE_URL` — a palavra final, pra quando o domínio próprio
 *    chegar. Basta cadastrar a variável na Vercel; nada no código muda.
 * 2. `VERCEL_PROJECT_PRODUCTION_URL` — o domínio de produção do projeto, que a
 *    própria Vercel injeta. Note que é o **de produção**, e não o da build: numa
 *    preview, o link compartilhado continua apontando pro app de verdade, que é
 *    o que se quer.
 * 3. O endereço de hoje, escrito à mão, pra o app funcionar em qualquer clone
 *    sem configurar nada.
 */
const PADRAO = "https://nekoreader.vercel.app";

export function siteUrl(): string {
  const escolhido =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "") ||
    PADRAO;

  // Sem barra no fim: quem usa isto concatena caminho, e `//` em og:url é o tipo
  // de detalhe que só aparece depois de publicado.
  return escolhido.replace(/\/+$/, "");
}

/** A URL absoluta de um caminho do app. */
export function urlDoSite(caminho: string): string {
  return `${siteUrl()}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
