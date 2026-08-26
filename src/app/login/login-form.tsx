"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao, Campo } from "@/components/ui";
import { useT } from "@/lib/i18n/cliente";
import type { Dicionario } from "@/lib/i18n/dicionarios";

type Mode = "login" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/library";
  const d = useT();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const senhasDiferem = mode === "signup" && senha2.length > 0 && senha !== senha2;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (mode === "signup") {
      if (senha.length < 6) return setError(d.auth.login.tooShort);
      if (senha !== senha2) return setError(d.auth.login.mismatch);
    }

    setBusy(true);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) {
        setError(traduzir(error.message, d));
        setBusy(false);
        return;
      }
      if (!data.session) {
        setInfo(d.auth.login.created);
        setMode("login");
        setSenha2("");
        setBusy(false);
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: senha,
      });
      if (error) {
        setError(traduzir(error.message, d));
        setBusy(false);
        return;
      }
    }

    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-background p-1">
        {(["login", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setInfo(null);
            }}
            className={`tap rounded-xl text-[15px] font-semibold transition ${
              mode === m
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {m === "login" ? d.auth.login.tabSignIn : d.auth.login.tabSignUp}
          </button>
        ))}
      </div>

      <Campo
        label={d.auth.login.email}
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={d.auth.login.emailPlaceholder}
      />

      <Campo
        label={d.auth.login.password}
        type="password"
        required
        minLength={6}
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder={
          mode === "signup" ? d.auth.login.passwordNew : d.auth.login.passwordCurrent
        }
        hint={
          mode === "login" ? (
            <Link
              href="/forgot"
              className="font-medium text-accent hover:underline"
            >
              {d.auth.login.forgot}
            </Link>
          ) : undefined
        }
      />

      {mode === "signup" && (
        <div className="sobe">
          <Campo
            label={d.auth.login.confirm}
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={senha2}
            onChange={(e) => setSenha2(e.target.value)}
            placeholder={d.auth.login.confirmPlaceholder}
            aria-invalid={senhasDiferem}
          />
          {senhasDiferem && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
              {d.auth.login.mismatch}
            </p>
          )}
        </div>
      )}

      {error && <Aviso tipo="erro">{error}</Aviso>}
      {info && <Aviso tipo="ok">{info}</Aviso>}

      <Botao type="submit" disabled={busy || senhasDiferem} className="w-full">
        {busy
          ? d.common.justAMoment
          : mode === "login"
            ? d.auth.login.tabSignIn
            : d.auth.login.tabSignUp}
      </Botao>
    </form>
  );
}

/**
 * O erro do Supabase, dito no idioma da pessoa.
 *
 * A mensagem crua vem sempre em inglês e fala de "credentials" e "rate limit";
 * o que não estiver na lista passa direto, porque um inglês obscuro ainda é
 * melhor que um "algo deu errado" que não diz nada.
 */
function traduzir(msg: string, d: Dicionario) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return d.auth.errors.invalidCredentials;
  if (m.includes("user already registered")) return d.auth.errors.alreadyRegistered;
  if (m.includes("email not confirmed")) return d.auth.errors.notConfirmed;
  if (m.includes("password should be")) return d.auth.errors.weakPassword;
  if (m.includes("rate limit") || m.includes("too many")) return d.auth.errors.rateLimit;
  return msg;
}
