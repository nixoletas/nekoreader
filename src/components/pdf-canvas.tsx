"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page } from "react-pdf";
import "@/lib/pdf";
import { HIGHLIGHT_COLORS, type HighlightColor, type Highlight, type Rect } from "@/lib/types";

type Pending = { rects: Rect[]; text: string };

const PDFJS_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdfjs/standard_fonts/",
};

export default function PdfCanvas({
  fileUrl,
  pageNumber,
  zoom,
  highlights,
  onLoadSuccess,
  onAddHighlight,
  onDeleteHighlight,
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
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
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

  // Troca de página fecha popovers (ajuste de estado durante o render).
  const [paginaAnterior, setPaginaAnterior] = useState(pageNumber);
  if (paginaAnterior !== pageNumber) {
    setPaginaAnterior(pageNumber);
    setPending(null);
    setAtiva(null);
  }

  const largura = containerWidth
    ? Math.max(280, Math.round(containerWidth * zoom))
    : undefined;

  const handlePointerUp = useCallback(() => {
    const pageEl = pageRef.current;
    if (!pageEl) return;
    const sel = window.getSelection();
    const base = pageEl.getBoundingClientRect();

    if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      if (pageEl.contains(range.commonAncestorContainer)) {
        const rects = normalizar(Array.from(range.getClientRects()), base);
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
        loading={
          <div className="py-24 text-center text-sm text-muted">
            Carregando PDF...
          </div>
        }
        error={
          <div className="py-24 text-center text-sm text-red-500">
            {erro ?? "Falha ao carregar o PDF."}
          </div>
        }
        className="flex justify-center"
      >
        <div
          ref={pageRef}
          onPointerUp={handlePointerUp}
          onClick={handleClick}
          className="relative inline-block bg-white shadow-lg"
        >
          <Page
            pageNumber={pageNumber}
            width={largura}
            renderTextLayer
            renderAnnotationLayer={false}
            loading={
              <div className="py-24 text-center text-sm text-muted">...</div>
            }
          />

          {/* marcações salvas */}
          <div className="pointer-events-none absolute inset-0 z-[2]">
            {highlights.map((h) =>
              h.rects.map((r, i) => (
                <span
                  key={`${h.id}-${i}`}
                  className="hl-rect"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    background: HIGHLIGHT_COLORS[h.color] ?? HIGHLIGHT_COLORS.yellow,
                    outline:
                      ativa?.id === h.id ? "2px solid var(--accent)" : "none",
                  }}
                />
              )),
            )}
          </div>

          {/* seleção nova: escolher cor */}
          {pending && (
            <Popover rect={pending.rects[0]}>
              {(Object.keys(HIGHLIGHT_COLORS) as HighlightColor[]).map((c) => (
                <button
                  key={c}
                  onClick={() => void salvar(c)}
                  title={`Marcar em ${c}`}
                  className="h-6 w-6 rounded-full border border-black/15 transition hover:scale-110"
                  style={{ background: HIGHLIGHT_COLORS[c] }}
                />
              ))}
              <button
                onClick={() => {
                  setPending(null);
                  window.getSelection()?.removeAllRanges();
                }}
                className="px-1 text-xs text-white/70 hover:text-white"
              >
                ✕
              </button>
            </Popover>
          )}

          {/* marcação existente: excluir */}
          {ativa && !pending && (
            <Popover rect={ativa.rects[0]}>
              <button
                onClick={async () => {
                  await onDeleteHighlight(ativa.id);
                  setAtiva(null);
                }}
                className="px-2 text-xs font-medium text-white hover:text-red-300"
              >
                Excluir marcação
              </button>
            </Popover>
          )}
        </div>
      </Document>
    </div>
  );
}

function Popover({
  rect,
  children,
}: {
  rect: Rect;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute z-10 flex -translate-y-full items-center gap-1.5 rounded-lg bg-slate-900 px-2 py-1.5 shadow-xl"
      style={{
        left: `${rect.x * 100}%`,
        top: `calc(${rect.y * 100}% - 6px)`,
      }}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

/** Converte DOMRects para frações da página e remove sobras/duplicatas. */
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

  // descarta retângulos contidos em outros
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
