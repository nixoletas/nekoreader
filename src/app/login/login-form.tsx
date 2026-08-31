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
  const [comGoogle, setComGoogle] = useState(false);
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

  /**
   * Entrar com o Google.
   *
   * Sai da página: o Supabase manda pro Google, o Google devolve pra
   * `/auth/callback`, e é lá que o `code` vira sessão — o mesmo caminho que a
   * confirmação de e-mail já usava. Por isso não há `router.replace` aqui: se
   * deu certo, esta página já não existe mais.
   *
   * O `busy` não é desligado no caminho feliz de propósito. Desligar faria o
   * botão voltar ao normal por um instante, enquanto o navegador ainda está
   * saindo — e um botão que volta a parecer clicável convida a um segundo
   * clique que cancela o primeiro.
   */
  async function entrarComGoogle() {
    setError(null);
    setInfo(null);
    setComGoogle(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(traduzir(error.message, d));
      setComGoogle(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Primeiro, porque é o caminho mais curto pra quem tem conta Google — e
          `type="button"` não envia o formulário. */}
      <button
        type="button"
        onClick={entrarComGoogle}
        disabled={busy || comGoogle}
        className="tap w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-surface px-5 text-[15px] font-semibold text-foreground transition hover:border-accent/50 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45"
      >
        <LogoGoogle />
        {comGoogle ? d.common.justAMoment : d.auth.login.google}
      </button>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-border" />
        {d.auth.login.orEmail}
        <span className="h-px flex-1 bg-border" />
      </div>

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

      <Botao type="submit" disabled={busy || comGoogle || senhasDiferem} className="w-full">
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
 * O "G" do Google, nas cores oficiais.
 *
 * Desenhado aqui em vez de vir do `lucide-react`: as regras da marca do Google
 * pedem o logotipo colorido como ele é, e o pacote de ícones só tem contorno
 * monocromático.
 */
function LogoGoogle() {
  return (
    <svg viewBox="0 0 18 18" className="h-[18px] w-[18px] shrink-0" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"/>
    </svg>
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
  // Enquanto o provider não estiver ligado no painel do Supabase, o clique volta
  // com "Unsupported provider" — que não diz nada a quem só queria entrar.
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return d.auth.errors.providerDisabled;
  }
  return msg;
}
