import Link from "next/link";
import type { Metadata } from "next";
import { i18nAtual, localeAtual } from "@/lib/i18n/servidor";
import { PRIVACIDADE } from "@/lib/legal";
import Marca from "@/components/marca";
import SeletorIdioma from "@/components/seletor-idioma";

// Lê cookie e cabeçalho pra escolher o idioma — nada aqui dá pra congelar em build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await localeAtual();
  return {
    title: `${PRIVACIDADE[locale].titulo} · Nekoreader`,
    description: PRIVACIDADE[locale].resumo,
  };
}

/**
 * A política de privacidade.
 *
 * Pública e sem sessão, porque é preciso poder lê-la **antes** de criar a conta —
 * e porque a tela de consentimento do Google exige um endereço que qualquer um
 * consiga abrir.
 *
 * O texto vem de `lib/legal.ts`, no idioma do pedido, pelo mesmo caminho que o
 * resto do app: quem escolhe é o servidor, uma vez, no cookie ou no
 * `Accept-Language`.
 */
export default async function PrivacidadePage() {
  const { locale, d } = await i18nAtual();
  const texto = PRIVACIDADE[locale];

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Marca id="privacidade" tamanho={28} />
            <span className="display text-lg tracking-tight">{d.brand.name}</span>
          </Link>
          <div className="ml-auto">
            <SeletorIdioma />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-12 sm:px-8">
        <h1 className="display text-3xl tracking-tight sm:text-4xl">{texto.titulo}</h1>
        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted">
          {texto.atualizadoEm}
        </p>

        <p className="mt-6 border-l-2 border-accent/40 pl-4 text-[15px] leading-relaxed">
          {texto.resumo}
        </p>

        <div className="mt-10 space-y-9">
          {texto.secoes.map((secao) => (
            <section key={secao.titulo}>
              <h2 className="display text-xl">{secao.titulo}</h2>
              <div className="mt-2 space-y-3">
                {secao.paragrafos.map((paragrafo, i) => (
                  <p key={i} className="text-[15px] leading-relaxed text-muted">
                    {paragrafo}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-14 border-t border-border pt-6">
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            ← {d.brand.name}
          </Link>
        </div>
      </main>
    </div>
  );
}
