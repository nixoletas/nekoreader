import Link from "next/link";
import type { ReactNode } from "react";
import { i18nAtual } from "@/lib/i18n/servidor";
import SeletorIdioma from "@/components/seletor-idioma";
import Marca from "@/components/marca";

export default async function AuthShell({
  titulo,
  subtitulo,
  children,
  rodape,
}: {
  titulo: string;
  subtitulo: string;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const { d } = await i18nAtual();

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      {/* manchas de tinta ao fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--accent)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-20 h-80 w-80 rounded-full opacity-15 blur-3xl"
        style={{ background: "var(--gold)" }}
      />

      {/* Trocar de idioma tem que existir **antes** da conta: quem cai aqui num
          idioma que não fala não consegue nem ler o rótulo do campo de senha. */}
      <div className="absolute right-4 top-4 z-10">
        <SeletorIdioma />
      </div>

      <div className="sobe relative w-full max-w-md">
        <Link href="/" className="mb-7 block text-center">
          <Marca id="auth" tamanho={56} className="mb-1.5" />
          <span className="display block text-3xl tracking-tight">{d.brand.name}</span>
          <span className="mt-1 block text-xs uppercase tracking-[0.25em] text-muted">
            {d.brand.kicker}
          </span>
        </Link>

        <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow)] sm:p-8">
          <h1 className="display text-2xl">{titulo}</h1>
          <p className="mb-6 mt-1 text-sm text-muted">{subtitulo}</p>
          {children}
        </div>

        {rodape && (
          <div className="mt-5 text-center text-sm text-muted">{rodape}</div>
        )}
      </div>
    </main>
  );
}
