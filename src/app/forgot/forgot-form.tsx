"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao, Campo } from "@/components/ui";

export default function EsqueciForm() {
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
      redirectTo: `${window.location.origin}/auth/callback?next=/nova-senha`,
    });

    if (error) {
      setErro(
        error.message.toLowerCase().includes("rate")
          ? "Muitas tentativas. Espere alguns minutos."
          : error.message,
      );
      setBusy(false);
      return;
    }

    setEnviado(true);
    setBusy(false);
  }

  if (enviado) {
    return (
      <div className="space-y-4">
        <Aviso tipo="ok">
          Se existe conta com <strong>{email}</strong>, o link já está a caminho.
          Confira também a caixa de spam.
        </Aviso>
        <p className="text-sm text-muted">
          O link vale por 1 hora e abre direto a tela de nova senha.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Campo
        label="E-mail da conta"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="voce@exemplo.com"
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <Botao type="submit" disabled={busy} className="w-full">
        {busy ? "Enviando..." : "Enviar link de recuperação"}
      </Botao>
    </form>
  );
}
