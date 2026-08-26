import Link from "next/link";
import type { Metadata } from "next";
import { i18nAtual } from "@/lib/i18n/servidor";
import SeletorIdioma from "@/components/seletor-idioma";
import BotaoTema from "@/components/botao-tema";
import PaginaDemo from "@/components/pagina-demo";

// Lê cookie e cabeçalho pra escolher o idioma — nada aqui dá pra congelar em build.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await i18nAtual();
  return { title: d.landing.metaTitle, description: d.landing.metaDescription };
}

/**
 * A porta de entrada, pra quem ainda não tem conta.
 *
 * Quem já entrou nunca vê esta tela: o guarda de rota manda direto pra estante.
 * Então aqui não existe estado, nem sessão, nem busca — é texto, um desenho e
 * dois botões, no idioma que o navegador pediu.
 *
 * A regra da escrita: nada de palavra de programador. "Camada de texto",
 * "OCR", "PWA" e "sincronizar" são o que o app faz por dentro; o que a pessoa
 * quer saber é que dá pra marcar um livro escaneado e continuar no celular.
 */
export default async function LandingPage() {
  const { d } = await i18nAtual();

  return (
    <div className="min-h-dvh">
      {/* ---------------- topo ---------------- */}
      <header className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-5 sm:px-8">
        <span className="display text-xl tracking-tight sm:text-2xl">{d.brand.name}</span>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <SeletorIdioma />
          <BotaoTema />
          <Link
            href="/login"
            className="tap rounded-xl px-3 text-sm font-medium text-muted transition hover:text-foreground"
          >
            {d.landing.navSignIn}
          </Link>
          <Link
            href="/login"
            className="tap hidden rounded-xl bg-accent px-4 text-sm font-semibold text-white shadow-[0_2px_0_0_rgba(0,0,0,0.12)] transition hover:brightness-110 sm:inline-flex"
          >
            {d.landing.navStart}
          </Link>
        </div>
      </header>

      {/* ---------------- promessa ---------------- */}
      <section className="relative overflow-hidden px-5 pb-4 pt-6 sm:px-8 sm:pt-12">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full opacity-[0.18] blur-3xl"
          style={{ background: "var(--accent)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 top-20 h-80 w-80 rounded-full opacity-[0.14] blur-3xl"
          style={{ background: "var(--gold)" }}
        />

        <div className="relative mx-auto grid max-w-5xl items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="sobe">
            <p className="text-xs uppercase tracking-[0.22em] text-accent">
              {d.brand.kicker}
            </p>
            <h1 className="display mt-3 text-4xl leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
              {d.landing.heroTitle}
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-muted sm:text-lg">
              {d.landing.heroLead}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="tap rounded-xl bg-accent px-6 text-[15px] font-semibold text-white shadow-[0_2px_0_0_rgba(0,0,0,0.12)] transition hover:brightness-110 active:translate-y-px"
              >
                {d.landing.heroCta}
              </Link>
              <span className="text-sm text-muted">{d.landing.heroNote}</span>
            </div>
          </div>

          <PaginaDemo alt={d.landing.heroAlt} />
        </div>
      </section>

      {/* ---------------- os três passos ---------------- */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="display text-2xl sm:text-3xl">{d.landing.stepsTitle}</h2>
        <div className="rule mb-8 mt-4" />

        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
          {d.landing.steps.map((passo, i) => (
            <li key={passo.title}>
              <span
                className="display flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-[15px] text-accent"
                aria-hidden
              >
                {i + 1}
              </span>
              <h3 className="display mt-3 text-lg leading-snug">{passo.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{passo.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- o que o app faz ---------------- */}
      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="display text-2xl sm:text-3xl">{d.landing.featuresTitle}</h2>
          <div className="rule mb-8 mt-4" />

          <div className="grid gap-x-10 gap-y-9 sm:grid-cols-2">
            {d.landing.features.map((f) => (
              <article key={f.title}>
                <h3 className="display text-lg leading-snug">{f.title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- o combinado ---------------- */}
      <section className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="display text-2xl sm:text-3xl">{d.landing.trustTitle}</h2>
        <div className="rule mb-8 mt-4" />

        <ul className="space-y-4">
          {d.landing.trust.map((linha) => (
            <li key={linha} className="flex gap-3 text-[15px] leading-relaxed">
              <span
                className="mt-[0.6rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                aria-hidden
              />
              <span className="text-muted">{linha}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------------- chamada final ---------------- */}
      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-surface p-8 text-center shadow-[var(--shadow)] sm:p-12">
          <h2 className="display text-2xl sm:text-3xl">{d.landing.ctaTitle}</h2>
          <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">
            {d.landing.ctaBody}
          </p>
          <Link
            href="/login"
            className="tap mt-7 inline-flex rounded-xl bg-accent px-7 text-[15px] font-semibold text-white shadow-[0_2px_0_0_rgba(0,0,0,0.12)] transition hover:brightness-110 active:translate-y-px"
          >
            {d.landing.ctaButton}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-7 text-sm text-muted sm:px-8">
          <span className="display text-foreground">{d.brand.name}</span>
          <span>{d.landing.footerRights}</span>
          <div className="ml-auto">
            <SeletorIdioma />
          </div>
        </div>
      </footer>
    </div>
  );
}
