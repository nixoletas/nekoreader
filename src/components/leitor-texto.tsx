"use client";

import { useCallback, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Bloco, Faixa } from "@/lib/pdf-blocos";
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

/**
 * Libera os object URL das imagens de um conjunto de blocos.
 *
 * Mora aqui porque quem produz os blocos (PDF ou EPUB) vira dono dessas URLs e
 * precisa devolvê-las quando os blocos saem do cache — senão o navegador segura
 * cada imagem já vista até a aba fechar.
 */
export function revogarBlocos(blocos: Bloco[]) {
  blocos.forEach((b) => {
    if (b.tipo === "imagem") URL.revokeObjectURL(b.url);
  });
}

/**
 * A tela de leitura em si: desenha os blocos remontados e cuida da marcação.
 *
 * Não sabe de onde os blocos vieram — PDF e EPUB entregam a mesma lista, e é o
 * que permite que marcação, negrito e seleção funcionem igual nos dois. Quem
 * carrega (`pdf-text.tsx`, `epub-text.tsx`) fica com o trabalho de buscar.
 */
export default function LeitorTexto({
  chave,
  blocos,
  erro,
  progresso,
  escala,
  highlights,
  onAddHighlight,
  onDeleteHighlight,
  onSwipe,
  onModoPagina,
  textoSemConteudo,
}: {
  /** Identifica o que está na tela (arquivo + página): mudou, o popover fecha. */
  chave: string;
  /** `null` = ainda carregando. */
  blocos: Bloco[] | null;
  erro: string | null;
  /** 0..100 enquanto baixa o arquivo; `null` quando não há o que mostrar. */
  progresso: number | null;
  escala: number;
  highlights: Highlight[];
  onAddHighlight: (
    spans: TextSpan[],
    text: string,
    color: HighlightColor,
  ) => Promise<void>;
  onDeleteHighlight: (id: string) => Promise<void>;
  onSwipe: (dir: 1 | -1) => void;
  /** Só o PDF tem modo Página pra oferecer como saída. */
  onModoPagina?: () => void;
  textoSemConteudo: string;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [ativa, setAtiva] = useState<Ativa | null>(null);
  const artigoRef = useRef<HTMLElement>(null);
  const swipe = useSwipe(onSwipe, !!pending);

  // Trocar de página/capítulo derruba qualquer popover aberto do conteúdo anterior
  // (ajuste de estado durante o render).
  const [chaveAnterior, setChaveAnterior] = useState(chave);
  if (chaveAnterior !== chave) {
    setChaveAnterior(chave);
    setPending(null);
    setAtiva(null);
  }

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
        <p className="text-sm leading-relaxed text-muted">{textoSemConteudo}</p>
        {onModoPagina && (
          <Botao variante="contorno" onClick={onModoPagina} className="mt-5">
            Ver como página
          </Botao>
        )}
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
        if (b.tipo === "tabela") {
          const [cabecalho, ...corpo] = b.linhas;
          // Sem `data-bloco`: a marcação guarda posição por caractere dentro do
          // texto do bloco, e tabela não tem um texto corrido pra indexar. Sem o
          // atributo, a seleção aqui simplesmente não vira marcação — melhor que
          // salvar uma marcação que nunca mais aparece.
          return (
            <div key={i} className="tabela-rolagem">
              <table>
                <thead>
                  <tr>
                    {cabecalho.map((c, k) => (
                      <th key={k}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {corpo.map((linha, k) => (
                    <tr key={k}>
                      {linha.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const conteudo = fatiarTexto(
          b.texto,
          i,
          highlights,
          ativa?.highlight.id ?? null,
          b.tipo === "paragrafo" || b.tipo === "citacao" ? b.negrito : [],
        );
        if (b.tipo === "codigo") {
          return (
            <pre key={i} data-bloco={i}>
              <code>{conteudo}</code>
            </pre>
          );
        }
        if (b.tipo === "titulo") {
          const Cabecalho = (["h1", "h2", "h3"] as const)[b.nivel - 1];
          return (
            <Cabecalho key={i} data-bloco={i}>
              {conteudo}
            </Cabecalho>
          );
        }
        if (b.tipo === "citacao") {
          return (
            <blockquote key={i} data-bloco={i}>
              {conteudo}
            </blockquote>
          );
        }
        return (
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
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition active:scale-90"
          >
            <X className="h-4 w-4" aria-hidden />
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
            className="tap flex !min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Apagar marcação
          </button>
        </Popover>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- */

/**
 * Fatia o texto do bloco nos trechos marcados (<mark>) e em destaque (<strong>).
 *
 * Os dois se sobrepõem à vontade — marcar metade de uma palavra em negrito é
 * normal —, então o corte é feito em todos os limites de uma vez e cada pedaço
 * recebe o que valer nele.
 */
function fatiarTexto(
  texto: string,
  indice: number,
  highlights: Highlight[],
  ativaId: string | null,
  negrito: Faixa[] = [],
): React.ReactNode {
  const dentro = (f: Faixa) => ({
    start: Math.max(0, Math.min(texto.length, f.start)),
    end: Math.max(0, Math.min(texto.length, f.end)),
  });

  const trechos = highlights
    .flatMap((h) =>
      h.spans
        .filter((s) => s.bloco === indice)
        .map((s) => ({ ...s, id: h.id, color: h.color })),
    )
    .map((t) => ({ ...t, ...dentro(t) }))
    .filter((t) => t.start < t.end)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const fortes = negrito.map(dentro).filter((f) => f.start < f.end);

  if (!trechos.length && !fortes.length) return texto;

  const pontos = new Set<number>([0, texto.length]);
  for (const f of [...trechos, ...fortes]) {
    pontos.add(f.start);
    pontos.add(f.end);
  }
  const cortes = [...pontos].sort((a, b) => a - b);

  const nos: React.ReactNode[] = [];
  for (let i = 0; i < cortes.length - 1; i++) {
    const ini = cortes[i];
    const fim = cortes[i + 1];
    if (ini >= fim) continue;
    const sub = texto.slice(ini, fim);
    const forte = fortes.some((f) => f.start <= ini && f.end >= fim);
    const conteudo = forte ? <strong>{sub}</strong> : sub;
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
          {conteudo}
        </mark>,
      );
    } else if (forte) {
      nos.push(<strong key={ini}>{sub}</strong>);
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
