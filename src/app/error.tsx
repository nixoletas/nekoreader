"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Botao } from "@/components/ui";
import TelaRecado from "@/components/tela-recado";
import { useT } from "@/lib/i18n/cliente";

/**
 * Erro não tratado em qualquer tela do app.
 *
 * Sem este arquivo, em produção o Next mostra uma página em branco com
 * "Application error" — em inglês, sem a cara do app e sem saída nenhuma. Aqui
 * pelo menos dá pra tentar de novo (`reset` remonta a rota) ou voltar pra estante.
 *
 * Fica dentro do layout raiz, então o `I18nProvider` já existe e o recado sai no
 * idioma da pessoa. O caso em que nem o layout monta é o `global-error.tsx`.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const d = useT();

  useEffect(() => {
    // Erro de tela não chega em lugar nenhum senão aqui — sem isto, um erro em
    // produção some sem deixar rastro nem no console de quem está depurando.
    console.error(error);
  }, [error]);

  return (
    <TelaRecado
      marca={d.brand.name}
      titulo={d.errors.title}
      corpo={d.errors.body}
      acoes={
        <>
          <Botao onClick={reset}>{d.errors.retry}</Botao>
          <Link href="/library">
            <Botao variante="contorno" type="button">
              {d.errors.toShelf}
            </Botao>
          </Link>
        </>
      }
    />
  );
}
