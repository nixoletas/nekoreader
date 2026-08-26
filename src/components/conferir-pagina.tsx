"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Minus, Plus, X } from "lucide-react";
import { abrirDoc } from "@/lib/pdf";
import { Botao } from "@/components/ui";
import { useI18n } from "@/lib/i18n/cliente";

/** Passo do zoom e limites — o mesmo intervalo do modo página. */
const PASSO = 0.25;
const MIN = 0.5;
const MAX = 3;

/**
 * A folha original por cima do texto remontado.
 *
 * O modo texto é uma **interpretação** do PDF: ele desfaz coluna, junta linha
 * quebrada e adivinha o que é título. Quase sempre acerta, e quando erra a
 * pessoa precisa de um jeito de conferir sem perder o lugar — trocar pro modo
 * página e voltar dá isso, mas custa a posição e o passo de leitura.
 *
 * Aqui a folha aparece por cima, na mesma página, e some no Esc. É a diferença
 * entre confiar na remontagem e ter que aceitar ela.
 */
export default function ConferirPagina({
  fileUrl,
  pagina,
  numero,
  onFechar,
}: {
  fileUrl: string;
  pagina: number;
  /** Como o livro numera esta página — o número que a pessoa reconhece. */
  numero: string;
  onFechar: () => void;
}) {
  const { d, t } = useI18n();
  const [zoom, setZoom] = useState(1);
  const [erro, setErro] = useState<string | null>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [onFechar]);

  /** Desenha a folha e diz se conseguiu — quem chama é que mexe no estado. */
  const desenhar = useCallback(async (): Promise<boolean> => {
    const canvas = canvasRef.current;
    const caixa = caixaRef.current;
    if (!canvas || !caixa) return true;

    try {
      const doc = await abrirDoc(fileUrl);
      const page = await doc.getPage(pagina);
      const base = page.getViewport({ scale: 1 });
      // Cabe na largura disponível, e o zoom multiplica isso. A tela de retina
      // desenha em resolução dobrada, senão o texto miúdo fica borrado — que é
      // justo o que a pessoa veio conferir.
      const largura = Math.min(caixa.clientWidth - 32, 1100) * zoom;
      const escala = (largura / base.width) * Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: escala });

      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(largura)}px`;
      const canvasContext = canvas.getContext("2d");
      if (!canvasContext) return false;
      await page.render({ canvas, canvasContext, viewport }).promise;
      return true;
    } catch {
      return false;
    }
  }, [fileUrl, pagina, zoom]);

  useEffect(() => {
    let vivo = true;
    void desenhar().then((deu) => {
      if (vivo) setErro(deu ? null : d.original.failed);
    });
    return () => {
      vivo = false;
    };
  }, [desenhar, d]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-sm"
      role="dialog"
      aria-modal
      aria-label={t(d.original.dialog, { label: numero })}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <p className="display text-base">{d.original.title}</p>
        <span className="text-xs text-muted">{t(d.original.page, { label: numero })}</span>

        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center rounded-xl border border-border">
            <button
              onClick={() => setZoom((z) => Math.max(MIN, z - PASSO))}
              disabled={zoom <= MIN}
              aria-label={d.common.zoomOut}
              className="tap rounded-l-xl px-2 text-muted transition hover:text-foreground disabled:opacity-40"
            >
              <Minus className="h-4 w-4" aria-hidden />
            </button>
            <span className="px-1 text-xs tabular-nums text-muted">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(MAX, z + PASSO))}
              disabled={zoom >= MAX}
              aria-label={d.common.zoomIn}
              className="tap rounded-r-xl px-2 text-muted transition hover:text-foreground disabled:opacity-40"
            >
              <Plus className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <Botao variante="contorno" onClick={onFechar} aria-label={d.common.close}>
            <X className="h-4 w-4" aria-hidden />
          </Botao>
        </div>
      </header>

      <div ref={caixaRef} className="safe-b flex-1 overflow-auto p-4 text-center">
        {erro ? (
          <p className="py-16 text-sm text-red-500">{erro}</p>
        ) : (
          <canvas ref={canvasRef} className="mx-auto rounded-lg bg-white shadow-lg" />
        )}
      </div>
    </div>
  );
}
