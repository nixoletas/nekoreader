"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao, Campo } from "@/components/ui";

type Mode = "login" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

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
      if (senha.length < 6) return setError("A senha precisa de 6 caracteres ou mais.");
      if (senha !== senha2) return setError("As senhas não são iguais.");
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
        setError(traduzir(error.message));
        setBusy(false);
        return;
      }
      if (!data.session) {
        setInfo("Conta criada. Confirme o e-mail que enviamos e entre.");
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
        setError(traduzir(error.message));
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
            {m === "login" ? "Entrar" : "Criar conta"}
          </button>
        ))}
      </div>

      <Campo
        label="E-mail"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@exemplo.com"
      />

      <Campo
        label="Senha"
        type="password"
        required
        minLength={6}
        autoComplete={mode === "signup" ? "new-password" : "current-password"}
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder={mode === "signup" ? "no mínimo 6 caracteres" : "sua senha"}
        hint={
          mode === "login" ? (
            <Link
              href="/esqueci"
              className="font-medium text-accent hover:underline"
            >
              Esqueci a senha
            </Link>
          ) : undefined
        }
      />

      {mode === "signup" && (
        <div className="sobe">
          <Campo
            label="Confirmar senha"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
            value={senha2}
            onChange={(e) => setSenha2(e.target.value)}
            placeholder="repita a senha"
            aria-invalid={senhasDiferem}
          />
          {senhasDiferem && (
            <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
              As senhas não são iguais.
            </p>
          )}
        </div>
      )}

      {error && <Aviso tipo="erro">{error}</Aviso>}
      {info && <Aviso tipo="ok">{info}</Aviso>}

      <Botao type="submit" disabled={busy || senhasDiferem} className="w-full">
        {busy ? "Um instante..." : mode === "login" ? "Entrar" : "Criar conta"}
      </Botao>
    </form>
  );
}

function traduzir(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (m.includes("user already registered")) return "Esse e-mail já tem conta.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("password should be")) return "Senha muito curta (mínimo 6).";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Muitas tentativas. Espere um pouco.";
  return msg;
}
