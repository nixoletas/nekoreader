import Link from "next/link";
import type { Metadata } from "next";
import { i18nAtual } from "@/lib/i18n/servidor";
import SeletorIdioma from "@/components/seletor-idioma";
import BotaoTema from "@/components/botao-tema";
import { VitrineEstante, VitrineLeitor } from "@/components/prints-app";
import Marca from "@/components/marca";

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
 * Então aqui não existe estado, nem sessão, nem busca — é texto, duas telas do
 * app e dois botões, no idioma que o navegador pediu.
 *
 * A regra da escrita: nada de palavra de programador. "Camada de texto",
 * "OCR", "PWA" e "sincronizar" são o que o app faz por dentro; o que a pessoa
 * quer saber é que dá pra marcar um livro escaneado e continuar no celular.
 *
 * A regra do desenho: a página alterna faixas de papel e de superfície, para o
 * olho ter onde descansar entre um assunto e outro. Sem isso as cinco seções
 * saem com a mesma forma — título, régua, grade de texto — e a página vira uma
 * lista comprida em que nada se destaca.
 */
export default async function LandingPage() {
  const { d } = await i18nAtual();

  return (
    <div className="min-h-dvh">
      {/* ---------------- topo ---------------- */}
      {/* Fixo: a página ficou longa, e o botão de entrar é o motivo dela existir. */}
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-4 sm:px-8">
          <span className="flex items-center gap-2">
            <Marca id="topo" tamanho={30} />
            <span className="display text-xl tracking-tight sm:text-[1.4rem]">
              {d.brand.name}
            </span>
          </span>

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
        </div>
      </header>

      {/* ---------------- promessa ---------------- */}
      <section className="relative overflow-hidden px-5 pb-6 pt-14 sm:px-8 sm:pt-20">
        {/* Um calor vindo do alto, como a luz numa página aberta. Substituiu duas
            bolas borradas de cor: mancha difusa é o fundo de qualquer SaaS, e
            este app quer parecer papel. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] opacity-70"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, color-mix(in srgb, var(--gold) 22%, transparent), transparent 70%)",
          }}
        />

        <div className="sobe relative mx-auto flex max-w-3xl flex-col items-center text-center">
          <p className="text-xs uppercase tracking-[0.22em] text-accent">{d.brand.kicker}</p>
          <h1 className="display mt-4 text-[2.6rem] leading-[1.04] tracking-tight text-balance sm:text-6xl lg:text-[4.2rem]">
            {d.landing.heroTitle}
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-[17px] leading-relaxed text-muted sm:text-lg">
            {d.landing.heroLead}
          </p>

          <div className="mt-9 flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="tap rounded-xl bg-accent px-8 text-base font-semibold text-white shadow-[0_2px_0_0_rgba(0,0,0,0.12)] transition hover:brightness-110 active:translate-y-px"
            >
              {d.landing.heroCta}
            </Link>
            <span className="text-sm text-muted">{d.landing.heroNote}</span>
          </div>
        </div>

        {/* A prova, logo abaixo da promessa e do tamanho que ela merece. */}
        <div className="relative mt-14 sm:mt-20">
          <VitrineLeitor
            altWeb={d.landing.heroAltWeb}
            altCelular={d.landing.heroAltCelular}
          />
        </div>
      </section>

      {/* ---------------- os três passos ---------------- */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="display text-2xl text-balance sm:text-3xl">{d.landing.stepsTitle}</h2>
        <div className="rule mb-10 mt-4" />

        <ol className="relative grid gap-9 sm:grid-cols-3 sm:gap-7">
          {/* O fio que liga os três números: eles são uma sequência de verdade
              (subir, marcar, continuar), e a linha diz isso sem precisar de texto. */}
          <div
            aria-hidden
            className="absolute left-4 right-4 top-[19px] hidden h-px bg-border sm:block"
          />

          {d.landing.steps.map((passo, i) => (
            <li key={passo.title} className="relative">
              <span
                className="display relative flex h-10 w-10 items-center justify-center rounded-full bg-background text-[15px] text-accent ring-1 ring-inset ring-accent/35"
                aria-hidden
              >
                {i + 1}
              </span>
              <h3 className="display mt-4 text-lg leading-snug">{passo.title}</h3>
              <p className="mt-2 text-pretty text-[15px] leading-relaxed text-muted">
                {passo.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- a estante ---------------- */}
      {/* Numa faixa própria: a estante é uma tela inteira do app, não um adereço
          da seção anterior, e a mudança de fundo é o que dá a ela essa moldura. */}
      <section className="border-y border-border bg-surface/70">
        {/* Mesma largura da vitrine do hero: as duas mostram uma tela inteira do
            app, e uma sair menor que a outra lê como descuido, não hierarquia. */}
        <div className="px-5 py-14 sm:px-8 sm:py-16">
          <VitrineEstante
            altWeb={d.landing.shelfAltWeb}
            altCelular={d.landing.shelfAltCelular}
          />
        </div>
      </section>

      {/* ---------------- o que o app faz ---------------- */}
      <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-24">
        <h2 className="display text-2xl text-balance sm:text-3xl">{d.landing.featuresTitle}</h2>
        <div className="rule mb-10 mt-4" />

        <div className="grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {d.landing.features.map((f) => (
            <article key={f.title} className="border-t border-border/70 pt-5">
              <h3 className="display text-lg leading-snug">{f.title}</h3>
              <p className="mt-2 text-pretty text-[15px] leading-relaxed text-muted">
                {f.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- o combinado ---------------- */}
      <section className="border-y border-border bg-surface/70">
        {/* Mesma caixa das outras seções, pra margem esquerda dos títulos não
            dançar de uma pra outra; só a lista é que fica na medida de leitura. */}
        <div className="mx-auto max-w-5xl px-5 py-16 sm:px-8 sm:py-20">
          <h2 className="display text-2xl text-balance sm:text-3xl">{d.landing.trustTitle}</h2>
          <div className="rule mb-8 mt-4" />

          <ul className="max-w-3xl space-y-4">
            {d.landing.trust.map((linha) => (
              <li key={linha} className="flex gap-3.5 text-[15px] leading-relaxed">
                <span
                  className="mt-[0.62rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                  aria-hidden
                />
                <span className="text-pretty text-muted">{linha}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- chamada final ---------------- */}
      {/* Escuro nos dois temas, de propósito: é a contracapa do livro, e fechar a
          página com um bloco de cor é o que impede que a última coisa vista seja
          mais uma seção de texto sobre creme. */}
      <section className="px-5 py-20 sm:px-8 sm:py-24">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-3xl bg-[var(--capa)] px-8 py-12 text-center shadow-[var(--shadow)] ring-1 ring-black/10 dark:ring-white/10 sm:px-12 sm:py-14">
          <h2 className="display text-2xl text-balance text-[var(--capa-ink)] sm:text-[2rem]">
            {d.landing.ctaTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-[var(--capa-ink-soft)]">
            {d.landing.ctaBody}
          </p>
          <Link
            href="/login"
            className="tap mt-8 inline-flex rounded-xl bg-[var(--capa-ink)] px-8 text-[15px] font-semibold text-[var(--capa)] transition hover:brightness-110 active:translate-y-px"
          >
            {d.landing.ctaButton}
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-8 text-sm text-muted sm:px-8">
          <span className="display text-foreground">{d.brand.name}</span>
          <span>{d.landing.footerRights}</span>
          <Link href="/privacy" className="hover:text-foreground">
            {d.common.privacy}
          </Link>
          {/* Um pedido, não um apelo: uma linha no rodapé, do tamanho dos outros
              links. Quem veio ler um PDF não precisa tropeçar nele. */}
          <a
            href="https://github.com/sponsors/nixoletas"
            target="_blank"
            rel="noopener noreferrer"
            title={d.landing.supportWhy}
            className="text-accent hover:underline"
          >
            {d.landing.support}
          </a>
          <div className="ml-auto">
            <SeletorIdioma />
          </div>
        </div>
      </footer>
    </div>
  );
}
