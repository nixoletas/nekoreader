"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao } from "@/components/ui";
import { useT } from "@/lib/i18n/cliente";
import type { Dicionario } from "@/lib/i18n/dicionarios";

/**
 * Entrar — só com o Google.
 *
 * O app teve e-mail e senha, e o que pesava não era o formulário: era a cauda
 * dele. Confirmar e-mail, reenviar confirmação, esquecer a senha, receber o
 * link, trocar a senha, tratar link vencido — meia dúzia de telas e um serviço
 * de e-mail de verdade pra sustentar, tudo antes de alguém ler a primeira
 * página. Com um provedor só, entrar é um clique, e não há senha pra guardar,
 * pra vazar nem pra esquecer.
 *
 * O preço está dito, e não é pequeno: quem não tem conta Google não entra.
 */
export default function LoginForm() {
  const params = useSearchParams();
  const next = params.get("next") || "/library";
  const d = useT();

  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /**
   * O Supabase manda pro Google, o Google devolve pra `/auth/callback`, e é lá
   * que o `code` vira sessão.
   *
   * `indo` não é desligado no caminho feliz de propósito: desligar faria o botão
   * voltar ao normal por um instante, enquanto o navegador ainda está saindo da
   * página — e botão que volta a parecer clicável convida a um segundo clique
   * que cancela o primeiro.
   */
  async function entrar() {
    setErro(null);
    setIndo(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setErro(traduzir(error.message, d));
      setIndo(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* `.tap` já dá flex, centro e o vão entre ícone e texto. */}
      <Botao onClick={entrar} disabled={indo} className="w-full">
        <LogoGoogle />
        {indo ? d.common.justAMoment : d.auth.login.google}
      </Botao>

      <p className="text-center text-sm text-muted">{d.auth.login.onlyGoogle}</p>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </div>
  );
}

/**
 * O erro do Supabase, dito no idioma da pessoa.
 *
 * A mensagem crua vem sempre em inglês; o que não estiver na lista passa direto,
 * porque um inglês obscuro ainda é melhor que um "algo deu errado" que não diz
 * nada.
 */
function traduzir(msg: string, d: Dicionario) {
  const m = msg.toLowerCase();
  if (m.includes("rate limit") || m.includes("too many")) return d.auth.errors.rateLimit;
  // Enquanto o provider não estiver ligado no painel do Supabase, o clique volta
  // com "Unsupported provider" — que não diz nada a quem só queria entrar.
  if (m.includes("provider is not enabled") || m.includes("unsupported provider")) {
    return d.auth.errors.providerDisabled;
  }
  return msg;
}

/**
 * O "G" do Google, nas cores oficiais.
 *
 * Desenhado aqui em vez de vir do `lucide-react`: as regras da marca do Google
 * pedem o logotipo colorido como ele é, e o pacote de ícones só tem contorno
 * monocromático. O disco branco atrás existe porque agora o botão é o de ação
 * principal, de fundo vermelho — as quatro cores do "G" somem em cima dele.
 */
function LogoGoogle() {
  return (
    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-white">
      <svg viewBox="0 0 18 18" className="h-[14px] w-[14px]" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"/>
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.96v2.33A9 9 0 0 0 9 18Z"/>
        <path fill="#FBBC05" d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l2.99-2.33Z"/>
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l2.99 2.33C4.66 5.16 6.65 3.58 9 3.58Z"/>
      </svg>
    </span>
  );
}
