"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setError(traduzir(error.message));
        setBusy(false);
        return;
      }
      // Se a confirmação de e-mail estiver ligada, não vem sessão.
      if (!data.session) {
        setInfo("Conta criada. Confirme o e-mail que enviamos e faça login.");
        setMode("login");
        setBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(traduzir(error.message));
        setBusy(false);
        return;
      }
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-border bg-surface p-6 shadow-sm"
    >
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-background p-1">
        {(["login", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              mode === m
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {m === "login" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">E-mail</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          placeholder="voce@exemplo.com"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Senha</span>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          placeholder="mínimo 6 caracteres"
        />
      </label>

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          {info}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "..." : mode === "login" ? "Entrar" : "Criar conta"}
      </button>
    </form>
  );
}

function traduzir(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (m.includes("user already registered")) return "Esse e-mail já tem conta.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("password should be")) return "Senha muito curta (mínimo 6).";
  return msg;
}
