"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao, Campo } from "@/components/ui";
import { useT } from "@/lib/i18n/cliente";

export default function NewPasswordForm() {
  const router = useRouter();
  const d = useT();
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const diferem = senha2.length > 0 && senha !== senha2;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 6) return setErro(d.auth.login.tooShort);
    if (senha !== senha2) return setErro(d.auth.login.mismatch);

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setErro(
        error.message.toLowerCase().includes("session")
          ? d.auth.newPassword.expired
          : error.message,
      );
      setBusy(false);
      return;
    }

    setOk(true);
    setBusy(false);
    setTimeout(() => {
      router.replace("/library");
      router.refresh();
    }, 1200);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Campo
        label={d.auth.newPassword.password}
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder={d.auth.login.passwordNew}
      />

      <div>
        <Campo
          label={d.auth.newPassword.confirm}
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={senha2}
          onChange={(e) => setSenha2(e.target.value)}
          placeholder={d.auth.login.confirmPlaceholder}
          aria-invalid={diferem}
        />
        {diferem && (
          <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
            {d.auth.login.mismatch}
          </p>
        )}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{d.auth.newPassword.ok}</Aviso>}

      <Botao type="submit" disabled={busy || ok || diferem} className="w-full">
        {busy ? d.common.saving : d.auth.newPassword.submit}
      </Botao>
    </form>
  );
}
