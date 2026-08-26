"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao, Campo } from "@/components/ui";
import { useT } from "@/lib/i18n/cliente";

export default function ForgotForm() {
  const d = useT();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErro(null);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/new-password`,
    });

    if (error) {
      setErro(
        error.message.toLowerCase().includes("rate")
          ? d.auth.errors.rateLimitMinutes
          : error.message,
      );
      setBusy(false);
      return;
    }

    setEnviado(true);
    setBusy(false);
  }

  if (enviado) {
    // O e-mail sai em negrito no meio da frase — é o que deixa a pessoa conferir
    // se digitou certo antes de ir esperar na caixa de entrada. Por isso a frase
    // é partida no `{email}` em vez de passar pelo `fmt()`.
    const [antes, depois] = d.auth.forgot.sent.split("{email}");
    return (
      <div className="space-y-4">
        <Aviso tipo="ok">
          {antes}
          <strong>{email}</strong>
          {depois ?? ""}
        </Aviso>
        <p className="text-sm text-muted">{d.auth.forgot.sentNote}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Campo
        label={d.auth.forgot.email}
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={d.auth.login.emailPlaceholder}
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Botao type="submit" disabled={busy} className="w-full">
        {busy ? d.auth.forgot.sending : d.auth.forgot.submit}
      </Botao>
    </form>
  );
}
