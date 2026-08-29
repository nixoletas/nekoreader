import Link from "next/link";
import type { ReactNode } from "react";

/**
 * A moldura das telas que só têm um recado a dar: deu erro, ou não existe.
 *
 * Mesma linguagem do `auth-shell` (manchas de tinta ao fundo, cartão no meio),
 * mas sem seletor de idioma nem link pra conta: quem chega aqui quer voltar pro
 * lugar de onde veio, não trocar de configuração.
 */
export default function TelaRecado({
  marca,
  titulo,
  corpo,
  acoes,
}: {
  marca: string;
  titulo: string;
  corpo: string;
  acoes: ReactNode;
}) {
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
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

      <div className="sobe relative w-full max-w-md text-center">
        <Link href="/" className="mb-7 block">
          <span className="display text-3xl tracking-tight">{marca}</span>
        </Link>

        <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow)] sm:p-8">
          <h1 className="display text-2xl">{titulo}</h1>
          <p className="mt-2 text-sm text-muted">{corpo}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">{acoes}</div>
        </div>
      </div>
    </main>
  );
}
