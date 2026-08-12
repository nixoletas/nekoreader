"use client";

import type { InputHTMLAttributes, ReactNode } from "react";

export function Campo({
  label,
  hint,
  ...props
}: { label: string; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-muted">
        {label}
        {hint}
      </span>
      <input
        {...props}
        className="h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/12"
      />
    </label>
  );
}

export function Botao({
  children,
  variante = "primario",
  className = "",
  ...props
}: {
  children: ReactNode;
  variante?: "primario" | "contorno" | "fantasma";
  className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const estilos = {
    primario:
      "bg-accent text-white shadow-[0_2px_0_0_rgba(0,0,0,0.12)] hover:brightness-110 active:translate-y-px",
    contorno:
      "border border-border bg-surface text-foreground hover:border-accent/50 active:translate-y-px",
    fantasma: "text-muted hover:text-foreground",
  }[variante];

  return (
    <button
      {...props}
      className={`tap rounded-xl px-5 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${estilos} ${className}`}
    >
      {children}
    </button>
  );
}

export function Aviso({
  tipo,
  children,
}: {
  tipo: "erro" | "ok";
  children: ReactNode;
}) {
  return (
    <p
      className={`sobe rounded-xl px-4 py-3 text-sm ${
        tipo === "erro"
          ? "bg-red-500/10 text-red-700 dark:text-red-300"
          : "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
      }`}
    >
      {children}
    </p>
  );
}
