"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "@/lib/pdf";
import {
  HIGHLIGHT_LABEL,
  fill,
  swatch,
  type Highlight,
  type HighlightColor,
  type Rect,
} from "@/lib/types";

type Pending = { rects: Rect[]; text: string };

const PDFJS_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

const CORES: HighlightColor[] = ["yellow", "green", "blue", "pink"];

export default function PdfCanvas({
  fileUrl,
  pageNumber,
  zoom,
  highlights,
  onLoadSuccess,
  onAddHighlight,
  onDeleteHighlight,
  onSwipe,
}: {
  fileUrl: string;
  pageNumber: number;
  zoom: number;
  highlights: Highlight[];
  onLoadSuccess: (numPages: number) => void;
  onAddHighlight: (
    rects: Rect[],
    text: string,
    color: HighlightColor,
  ) => Promise<void>;
  onDeleteHighlight: (id: string) => Promise<void>;
  onSwipe: (dir: 1 | -1) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const toque = useRef<{ x: number; y: number; t: number } | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);
  const [ativa, setAtiva] = useState<Highlight | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const file = useMemo(() => ({ url: fileUrl }), [fileUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setContainerWidth(entry.contentRect.width),
    );
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Troca de página fecha os popovers (ajuste de estado durante o render).
  const [paginaAnterior, setPaginaAnterior] = useState(pageNumber);
  if (paginaAnterior !== pageNumber) {
    setPaginaAnterior(pageNumber);
    setPending(null);
    setAtiva(null);
  }

  const largura = containerWidth
    ? Math.max(240, Math.round(containerWidth * zoom))
    : undefined;

  const handlePointerUp = useCallback(() => {
    const pageEl = pageRef.current;
    if (!pageEl) return;
    const sel = window.getSelection();

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (pageEl.contains(range.commonAncestorContainer)) {
        const rects = normalizar(
          Array.from(range.getClientRects()),
          pageEl.getBoundingClientRect(),
        );
        if (rects.length) {
          setAtiva(null);
          setPending({ rects, text: sel.toString().replace(/\s+/g, " ").trim() });
          return;
        }
      }
    }

    setPending(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const pageEl = pageRef.current;
      if (!pageEl) return;
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;

      const base = pageEl.getBoundingClientRect();
      const x = (e.clientX - base.left) / base.width;
      const y = (e.clientY - base.top) / base.height;
      const achou = highlights.find((h) =>
        h.rects.some(
          (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
        ),
      );
      setAtiva(achou ?? null);
    },
    [highlights],
  );

  // Deslizar o dedo troca de página (só quando não há seleção ativa).
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    toque.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const ini = toque.current;
    toque.current = null;
    if (!ini || pending) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;

    const t = e.changedTouches[0];
    const dx = t.clientX - ini.x;
    const dy = t.clientY - ini.y;
    if (Date.now() - ini.t > 700) return;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 60) return;
    onSwipe(dx < 0 ? 1 : -1);
  }

  async function salvar(color: HighlightColor) {
    if (!pending) return;
    await onAddHighlight(pending.rects, pending.text, color);
    setPending(null);
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div ref={containerRef} className="w-full">
      <Document
        file={file}
        options={PDFJS_OPTIONS}
        onLoadSuccess={(doc) => {
          setErro(null);
          onLoadSuccess(doc.numPages);
        }}
        onLoadError={(e) => setErro(e.message)}
        loading={<Esqueleto texto="Abrindo o livro" />}
        error={
          <div className="py-24 text-center text-sm text-red-500">
            {erro ?? "Não consegui abrir esse PDF."}
          </div>
        }
        className="flex justify-center"
      >
        <div
          ref={pageRef}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          className="relative inline-block overflow-hidden rounded-lg bg-white shadow-[0_2px_6px_rgba(60,45,25,0.12),0_20px_50px_-24px_rgba(60,45,25,0.5)]"
        >
          <Page
            pageNumber={pageNumber}
            width={largura}
            renderTextLayer
            renderAnnotationLayer={false}
            loading={<Esqueleto texto="" />}
          />

          {/* véu das marcações — sem z-index, senão o multiply não enxerga a página */}
          <div className="hl-layer">
            {highlights.map((h) =>
              h.rects.map((r, i) => (
                <span
                  key={`${h.id}-${i}`}
                  className="hl-rect"
                  data-ativa={ativa?.id === h.id}
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    background: fill(h.color),
                  }}
                />
              )),
            )}
          </div>

          {pending && (
            <Popover rects={pending.rects}>
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
            <Popover rects={ativa.rects}>
              <button
                onClick={async () => {
                  await onDeleteHighlight(ativa.id);
                  setAtiva(null);
                }}
                className="tap !min-h-10 rounded-lg px-3 text-sm font-medium text-white"
              >
                🗑 Apagar marcação
              </button>
            </Popover>
          )}
        </div>
      </Document>
    </div>
  );
}

function Esqueleto({ texto }: { texto: string }) {
  return (
    <div className="flex aspect-[1/1.4] w-full max-w-3xl animate-pulse flex-col items-center justify-center rounded-lg bg-surface">
      <span className="text-sm text-muted">{texto}</span>
    </div>
  );
}

function Popover({
  rects,
  children,
}: {
  rects: Rect[];
  children: React.ReactNode;
}) {
  const r = rects[0];
  const centro = (r.x + r.w / 2) * 100;
  // Ancora acima da seleção; se estiver no topo da página, joga pra baixo.
  const acima = r.y > 0.14;

  return (
    <div
      className="sobe absolute z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-2xl bg-[#26201a] px-2 py-1.5 shadow-xl ring-1 ring-white/10"
      style={{
        left: `clamp(7.5rem, ${centro}%, calc(100% - 7.5rem))`,
        top: acima
          ? `calc(${r.y * 100}% - 0.6rem)`
          : `calc(${(r.y + r.h) * 100}% + 0.6rem)`,
        transform: acima
          ? "translate(-50%, -100%)"
          : "translate(-50%, 0)",
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** DOMRects → frações da página, sem duplicatas nem sobras. */
function normalizar(rects: DOMRect[], base: DOMRect): Rect[] {
  const uteis = rects
    .filter((r) => r.width > 1 && r.height > 1)
    .map((r) => ({
      x: (r.left - base.left) / base.width,
      y: (r.top - base.top) / base.height,
      w: r.width / base.width,
      h: r.height / base.height,
    }))
    .filter((r) => r.x < 1 && r.y < 1 && r.x + r.w > 0 && r.y + r.h > 0);

  return uteis.filter(
    (r, i) =>
      !uteis.some(
        (o, j) =>
          j !== i &&
          o.x <= r.x + 0.001 &&
          o.y <= r.y + 0.001 &&
          o.x + o.w >= r.x + r.w - 0.001 &&
          o.y + o.h >= r.y + r.h - 0.001 &&
          (o.w > r.w || o.h > r.h),
      ),
  );
}
