"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao, Campo } from "@/components/ui";

export default function NovaSenhaForm() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const diferem = senha2.length > 0 && senha !== senha2;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    if (senha.length < 6) return setErro("A senha precisa de 6 caracteres ou mais.");
    if (senha !== senha2) return setErro("As senhas não são iguais.");

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: senha });

    if (error) {
      setErro(
        error.message.toLowerCase().includes("session")
          ? "O link expirou. Peça outro em “Esqueci a senha”."
          : error.message,
      );
      setBusy(false);
      return;
    }

    setOk(true);
    setBusy(false);
    setTimeout(() => {
      router.replace("/");
      router.refresh();
    }, 1200);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Campo
        label="Nova senha"
        type="password"
        required
        minLength={6}
        autoComplete="new-password"
        value={senha}
        onChange={(e) => setSenha(e.target.value)}
        placeholder="no mínimo 6 caracteres"
      />

      <div>
        <Campo
          label="Confirmar nova senha"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          value={senha2}
          onChange={(e) => setSenha2(e.target.value)}
          placeholder="repita a senha"
          aria-invalid={diferem}
        />
        {diferem && (
          <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
            As senhas não são iguais.
          </p>
        )}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">Senha trocada. Abrindo sua estante...</Aviso>}

      <Botao type="submit" disabled={busy || ok || diferem} className="w-full">
        {busy ? "Salvando..." : "Salvar nova senha"}
      </Botao>
    </form>
  );
}
