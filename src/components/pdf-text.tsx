"use client";

import { useEffect, useState } from "react";
import { abrirDoc } from "@/lib/pdf";
import { extrairBlocos, type Bloco } from "@/lib/pdf-text";
import { useSwipe } from "@/lib/swipe";
import { Botao } from "@/components/ui";

export default function PdfText({
  fileUrl,
  pageNumber,
  escala,
  onLoadSuccess,
  onSwipe,
  onModoPagina,
}: {
  fileUrl: string;
  pageNumber: number;
  escala: number;
  onLoadSuccess: (numPages: number) => void;
  onSwipe: (dir: 1 | -1) => void;
  onModoPagina: () => void;
}) {
  const [blocos, setBlocos] = useState<Bloco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const swipe = useSwipe(onSwipe);

  // Trocar de página limpa o texto antigo (ajuste de estado durante o render).
  const alvo = `${fileUrl}#${pageNumber}`;
  const [alvoAnterior, setAlvoAnterior] = useState(alvo);
  if (alvoAnterior !== alvo) {
    setAlvoAnterior(alvo);
    setBlocos(null);
    setErro(null);
  }

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const doc = await abrirDoc(fileUrl);
        if (!vivo) return;
        onLoadSuccess(doc.numPages);
        if (pageNumber > doc.numPages) return;
        const extraidos = await extrairBlocos(doc, pageNumber);
        if (vivo) setBlocos(extraidos);
      } catch (e) {
        if (vivo)
          setErro(e instanceof Error ? e.message : "Falhou ao ler o PDF.");
      }
    })();

    return () => {
      vivo = false;
    };
  }, [fileUrl, pageNumber, onLoadSuccess]);

  if (erro) {
    return (
      <p className="py-24 text-center text-sm text-red-500">{erro}</p>
    );
  }

  if (!blocos) {
    return (
      <div className="mx-auto w-full max-w-[38rem] animate-pulse space-y-3 py-6">
        {[...Array(9)].map((_, i) => (
          <span
            key={i}
            className="block h-4 rounded bg-surface"
            style={{ width: `${72 + ((i * 37) % 28)}%` }}
          />
        ))}
      </div>
    );
  }

  if (!blocos.length) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20 text-center">
        <p className="text-sm leading-relaxed text-muted">
          Esta página não tem texto para ler — provavelmente é digitalizada
          (imagem). Só o modo Página mostra ela.
        </p>
        <Botao variante="contorno" onClick={onModoPagina} className="mt-5">
          Ver como página
        </Botao>
      </div>
    );
  }

  return (
    <article
      {...swipe}
      className="leitura mx-auto max-w-[38rem] rounded-lg bg-surface px-5 py-8 shadow-[0_1px_2px_rgba(60,45,25,0.06),0_16px_40px_-28px_rgba(60,45,25,0.5)] sm:px-9 sm:py-11"
      style={{ fontSize: `${escala}rem` }}
    >
      {blocos.map((b, i) =>
        b.tipo === "titulo" ? (
          <h2 key={i}>{b.texto}</h2>
        ) : (
          <p key={i}>{b.texto}</p>
        ),
      )}
    </article>
  );
}
