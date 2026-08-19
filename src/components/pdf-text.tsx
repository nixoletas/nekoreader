"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abrirDoc } from "@/lib/pdf";
import { CachePaginas } from "@/lib/pdf-cache";
import { extrairBlocos, type Bloco } from "@/lib/pdf-text";
import { useSwipe } from "@/lib/swipe";
import { BarraProgresso, Botao } from "@/components/ui";
import {
  HIGHLIGHT_LABEL,
  fill,
  swatch,
  type Highlight,
  type HighlightColor,
  type TextSpan,
} from "@/lib/types";

type Pending = { spans: TextSpan[]; text: string; x: number; y: number; h: number };
type Ativa = { highlight: Highlight; x: number; y: number; h: number };

const CORES: HighlightColor[] = ["yellow", "green", "blue", "pink"];

// Quantas páginas já remontadas (com os recortes de imagem) ficam guardadas — folhear
// pra trás e pra frente não reprocessa. Cada entrada pode carregar algumas imagens em
// memória, então o tamanho fica moderado de propósito.
const PAGINAS_EM_CACHE = 8;

function revogarBlocos(blocos: Bloco[]) {
  blocos.forEach((b) => {
    if (b.tipo === "imagem") URL.revokeObjectURL(b.url);
  });
}

export default function PdfText({
  fileUrl,
  pageNumber,
  escala,
  highlights,
  onLoadSuccess,
  onAddHighlight,
  onDeleteHighlight,
  onSwipe,
  onModoPagina,
}: {
  fileUrl: string;
  pageNumber: number;
  escala: number;
  highlights: Highlight[];
  onLoadSuccess: (numPages: number) => void;
  onAddHighlight: (
    spans: TextSpan[],
    text: string,
    color: HighlightColor,
  ) => Promise<void>;
  onDeleteHighlight: (id: string) => Promise<void>;
  onSwipe: (dir: 1 | -1) => void;
  onModoPagina: () => void;
}) {
  const [blocos, setBlocos] = useState<Bloco[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ativa, setAtiva] = useState<Ativa | null>(null);
  const artigoRef = useRef<HTMLElement>(null);
  const swipe = useSwipe(onSwipe, !!pending);

  // Páginas já remontadas — o cache é dono dos object URL das imagens que guarda.
  const [cache] = useState(
    () => new CachePaginas<Bloco[]>(PAGINAS_EM_CACHE, revogarBlocos),
  );
  useEffect(() => () => cache.limpar(), [cache]);

  // Trocar de página limpa o texto antigo — ou já mostra o que tava em cache, sem
  // piscar o esqueleto de carregamento à toa (ajuste de estado durante o render).
  const alvo = `${fileUrl}#${pageNumber}`;
  const [alvoAnterior, setAlvoAnterior] = useState(alvo);
  if (alvoAnterior !== alvo) {
    setAlvoAnterior(alvo);
    setBlocos(cache.obter(alvo) ?? null);
    setErro(null);
    setProgresso(null);
    setPending(null);
    setAtiva(null);
  }

  useEffect(() => {
    let vivo = true;
    const chave = `${fileUrl}#${pageNumber}`;

    (async () => {
      try {
        const doc = await abrirDoc(fileUrl, (fracao) => {
          if (vivo) setProgresso(Math.round(fracao * 100));
        });
        if (!vivo) return;
        setProgresso(null);
        onLoadSuccess(doc.numPages);
        if (pageNumber > doc.numPages) return;
        if (cache.obter(chave)) return; // já em cache — nada a reprocessar

        const extraidos = await extrairBlocos(doc, pageNumber);
        if (!vivo) {
          revogarBlocos(extraidos);
          return;
        }
        cache.definir(chave, extraidos);
        setBlocos(extraidos);
      } catch (e) {
        if (vivo)
          setErro(e instanceof Error ? e.message : "Falhou ao ler o PDF.");
      }
    })();

    return () => {
      vivo = false;
    };
  }, [fileUrl, pageNumber, onLoadSuccess, cache]);

  const handlePointerUp = useCallback(() => {
    const artigoEl = artigoRef.current;
    if (!artigoEl) return;
    const sel = window.getSelection();

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (artigoEl.contains(range.commonAncestorContainer)) {
        const spans = capturarSpans(artigoEl, range);
        const texto = sel.toString().replace(/\s+/g, " ").trim();
        if (spans.length && texto) {
          const base = artigoEl.getBoundingClientRect();
          const rects = Array.from(range.getClientRects()).filter(
            (r) => r.width > 1 && r.height > 1,
          );
          const r = rects[0] ?? range.getBoundingClientRect();
          setAtiva(null);
          setPending({
            spans,
            text: texto,
            x: r.left + r.width / 2 - base.left,
            y: r.top - base.top,
            h: r.height,
          });
          return;
        }
      }
    }

    setPending(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;

      const artigoEl = artigoRef.current;
      const alvoEl = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-highlight-id]",
      );
      if (!alvoEl || !artigoEl) {
        setAtiva(null);
        return;
      }
      const achou = highlights.find((h) => h.id === alvoEl.dataset.highlightId);
      if (!achou) {
        setAtiva(null);
        return;
      }
      const base = artigoEl.getBoundingClientRect();
      const r = alvoEl.getBoundingClientRect();
      setPending(null);
      setAtiva({
        highlight: achou,
        x: r.left + r.width / 2 - base.left,
        y: r.top - base.top,
        h: r.height,
      });
    },
    [highlights],
  );

  async function salvar(color: HighlightColor) {
    if (!pending) return;
    await onAddHighlight(pending.spans, pending.text, color);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  if (erro) {
    return <p className="py-24 text-center text-sm text-red-500">{erro}</p>;
  }

  if (!blocos) {
    return (
      <div className="mx-auto w-full max-w-[38rem] lg:max-w-[44rem] xl:max-w-[50rem] space-y-3 py-6">
        {progresso !== null && <BarraProgresso texto="Abrindo o livro" pct={progresso} />}

        <div className="animate-pulse space-y-3">
          {[...Array(9)].map((_, i) => (
            <span
              key={i}
              className="block h-4 rounded bg-surface"
              style={{ width: `${72 + ((i * 37) % 28)}%` }}
            />
          ))}
        </div>
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
      ref={artigoRef}
      {...swipe}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      className="leitura relative mx-auto max-w-[38rem] lg:max-w-[44rem] xl:max-w-[50rem] rounded-lg bg-surface px-5 py-8 shadow-[0_1px_2px_rgba(60,45,25,0.06),0_16px_40px_-28px_rgba(60,45,25,0.5)] sm:px-9 sm:py-11"
      style={{ fontSize: `${escala}rem` }}
    >
      {blocos.map((b, i) => {
        if (b.tipo === "imagem") {
          return (
            <img
              key={i}
              src={b.url}
              width={b.largura}
              height={b.altura}
              loading="lazy"
              alt=""
              className="mx-auto my-5 block h-auto max-w-full rounded-md shadow-[0_1px_2px_rgba(60,45,25,0.08),0_10px_24px_-16px_rgba(60,45,25,0.5)]"
            />
          );
        }
        const conteudo = fatiarTexto(b.texto, i, highlights, ativa?.highlight.id ?? null);
        return b.tipo === "titulo" ? (
          <h2 key={i} data-bloco={i}>
            {conteudo}
          </h2>
        ) : (
          <p key={i} data-bloco={i}>
            {conteudo}
          </p>
        );
      })}

      {pending && (
        <Popover x={pending.x} y={pending.y} h={pending.h}>
          {CORES.map((c) => (
            <button
              key={c}
              onClick={() => void salvar(c)}
              aria-label={`Marcar em ${HIGHLIGHT_LABEL[c].toLowerCase()}`}
              className="h-10 w-10 rounded-full border-2 border-white/25 transition active:scale-90"
              style={{ background: swatch(c) }}
            />
          ))}
          <span className="mx-0.5 h-7 w-px bg-white/20" />
          <button
            onClick={() => {
              setPending(null);
              window.getSelection()?.removeAllRanges();
            }}
            aria-label="Cancelar"
            className="h-10 w-10 rounded-full text-lg text-white/70 transition active:scale-90"
          >
            ✕
          </button>
        </Popover>
      )}

      {ativa && !pending && (
        <Popover x={ativa.x} y={ativa.y} h={ativa.h}>
          <button
            onClick={async () => {
              await onDeleteHighlight(ativa.highlight.id);
              setAtiva(null);
            }}
            className="tap !min-h-10 rounded-lg px-3 text-sm font-medium text-white"
          >
            🗑 Apagar marcação
          </button>
        </Popover>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- */

/** Fatia o texto do bloco nos trechos marcados, envolvendo cada um num <mark>. */
function fatiarTexto(
  texto: string,
  indice: number,
  highlights: Highlight[],
  ativaId: string | null,
): React.ReactNode {
  const trechos = highlights
    .flatMap((h) =>
      h.spans
        .filter((s) => s.bloco === indice)
        .map((s) => ({ ...s, id: h.id, color: h.color })),
    )
    .map((t) => ({
      ...t,
      start: Math.max(0, Math.min(texto.length, t.start)),
      end: Math.max(0, Math.min(texto.length, t.end)),
    }))
    .filter((t) => t.start < t.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  if (!trechos.length) return texto;

  const pontos = new Set<number>([0, texto.length]);
  trechos.forEach((t) => {
    pontos.add(t.start);
    pontos.add(t.end);
  });
  const cortes = [...pontos].sort((a, b) => a - b);

  const nos: React.ReactNode[] = [];
  for (let i = 0; i < cortes.length - 1; i++) {
    const ini = cortes[i];
    const fim = cortes[i + 1];
    if (ini >= fim) continue;
    const sub = texto.slice(ini, fim);
    const cobre = trechos.find((t) => t.start <= ini && t.end >= fim);
    if (cobre) {
      nos.push(
        <mark
          key={ini}
          data-highlight-id={cobre.id}
          data-ativa={cobre.id === ativaId}
          className="txt-mark"
          style={{ background: fill(cobre.color) }}
        >
          {sub}
        </mark>,
      );
    } else {
      nos.push(sub);
    }
  }
  return nos;
}

/** Converte uma seleção em spans por parágrafo — cada `[data-bloco]` tocado vira um trecho. */
function capturarSpans(artigoEl: HTMLElement, range: Range): TextSpan[] {
  const blocosEls = Array.from(
    artigoEl.querySelectorAll<HTMLElement>("[data-bloco]"),
  ).filter((el) => range.intersectsNode(el));
  if (!blocosEls.length) return [];

  const spans: TextSpan[] = [];
  blocosEls.forEach((el, i) => {
    const bloco = Number(el.dataset.bloco);
    const comprimento = el.textContent?.length ?? 0;
    let start = 0;
    let end = comprimento;
    if (i === 0 && el.contains(range.startContainer)) {
      start = offsetNoContainer(el, range.startContainer, range.startOffset);
    }
    if (i === blocosEls.length - 1 && el.contains(range.endContainer)) {
      end = offsetNoContainer(el, range.endContainer, range.endOffset);
    }
    start = Math.max(0, Math.min(comprimento, start));
    end = Math.max(start, Math.min(comprimento, end));
    if (end > start) spans.push({ bloco, start, end });
  });
  return spans;
}

/** Nº de caracteres de texto entre o início de `containerEl` e o ponto (node, deslocamento). */
function offsetNoContainer(
  containerEl: Node,
  node: Node,
  deslocamento: number,
): number {
  const r = document.createRange();
  try {
    r.selectNodeContents(containerEl);
    r.setEnd(node, deslocamento);
    return r.toString().length;
  } catch {
    return 0;
  }
}

function Popover({
  x,
  y,
  h,
  children,
}: {
  x: number;
  y: number;
  h: number;
  children: React.ReactNode;
}) {
  const acima = y > 60;

  return (
    <div
      className="sobe absolute z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-[#26201a] px-2 py-1.5 shadow-xl ring-1 ring-white/10"
      style={{
        left: `clamp(7.5rem, ${x}px, calc(100% - 7.5rem))`,
        top: acima ? `${y - 10}px` : `${y + h + 10}px`,
        transform: acima ? "translate(-50%, -100%)" : "translate(-50%, 0)",
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
