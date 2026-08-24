"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { abrirDoc } from "@/lib/pdf";
import { Botao } from "@/components/ui";

/** Largura do recorte de cada página, em pixel. Pequeno de propósito: são centenas. */
const LARGURA_MINIATURA = 200;
/** Quantas páginas o pdf.js desenha ao mesmo tempo — mais que isso trava a rolagem. */
const EM_PARALELO = 3;

/**
 * Todas as páginas do livro numa grade, pra folhear rolando — como o Kindle faz
 * quando se toca na tela.
 *
 * Cada miniatura só é desenhada quando chega perto da tela (`IntersectionObserver`),
 * e o que já foi desenhado fica guardado enquanto a visão estiver aberta: dá pra
 * abrir num livro de 500 páginas sem esperar nada.
 */
export default function VisaoPaginas({
  fileUrl,
  numPages,
  pagina,
  eEpub,
  onIr,
  onFechar,
}: {
  fileUrl: string | null;
  numPages: number;
  pagina: number;
  /** No EPUB não existe folha pra desenhar — a grade vira uma lista de capítulos. */
  eEpub: boolean;
  onIr: (p: number) => void;
  onFechar: () => void;
}) {
  const paginas = Array.from({ length: Math.max(0, numPages) }, (_, i) => i + 1);

  // Fecha no Esc, e trava a rolagem do texto atrás enquanto a grade está aberta.
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

  // Abre já mostrando a página atual, sem animação — ela é o ponto de partida.
  const atualRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    atualRef.current?.scrollIntoView({ block: "center" });
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/97 backdrop-blur-sm" role="dialog" aria-modal aria-label="Páginas do livro">
      <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-2.5">
        <p className="display text-base">{eEpub ? "Capítulos" : "Páginas"}</p>
        <span className="text-xs text-muted">
          {pagina} de {numPages || "?"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={numPages || undefined}
            placeholder="ir para"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              const v = Number((e.target as HTMLInputElement).value);
              if (v >= 1) onIr(v);
            }}
            className="h-10 w-24 rounded-xl border border-border bg-surface px-3 text-center text-sm outline-none focus:border-accent"
            aria-label={eEpub ? "Ir para o capítulo" : "Ir para a página"}
          />
          <Botao variante="contorno" onClick={onFechar} aria-label="Fechar">
            <X className="h-4 w-4" aria-hidden />
          </Botao>
        </div>
      </header>

      {!paginas.length ? (
        <p className="flex-1 px-6 py-16 text-center text-sm text-muted">
          Abrindo o livro…
        </p>
      ) : (
        <ul className="safe-b grid flex-1 grid-cols-3 content-start gap-3 overflow-y-auto p-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {paginas.map((p) => (
            <li key={p} ref={p === pagina ? atualRef : undefined}>
              <button
                onClick={() => onIr(p)}
                aria-current={p === pagina ? "page" : undefined}
                className={`w-full rounded-lg border-2 p-1 text-center transition ${
                  p === pagina
                    ? "border-accent bg-accent/10"
                    : "border-transparent hover:border-border"
                }`}
              >
                {eEpub || !fileUrl ? (
                  <span className="display flex aspect-[1/1.4] items-center justify-center rounded bg-surface text-2xl text-muted">
                    {p}
                  </span>
                ) : (
                  <Miniatura fileUrl={fileUrl} pagina={p} />
                )}
                <span
                  className={`mt-1 block text-[11px] tabular-nums ${
                    p === pagina ? "font-semibold text-accent" : "text-muted"
                  }`}
                >
                  {p}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */

/**
 * Fila de desenho compartilhada por todas as miniaturas.
 *
 * Sem ela, rolar rápido dispara dezenas de `render` de uma vez: o pdf.js aceita
 * todos, a fila dele entope e a rolagem trava. Com no máximo três por vez, o que
 * está na tela aparece primeiro e o resto espera a vez.
 */
let emAndamento = 0;
const esperando: (() => void)[] = [];

async function naFila<T>(tarefa: () => Promise<T>): Promise<T> {
  if (emAndamento >= EM_PARALELO) {
    await new Promise<void>((resolve) => esperando.push(resolve));
  }
  emAndamento++;
  try {
    return await tarefa();
  } finally {
    emAndamento--;
    esperando.shift()?.();
  }
}

/**
 * Recortes já desenhados, por arquivo+página — folhear pra trás não redesenha.
 *
 * Com teto: cada recorte é uma data URL de alguns KB, e um livro de 500 páginas
 * inteiro na memória não vale a economia. Passou do teto, o mais antigo sai.
 */
const cache = new Map<string, string>();
const TETO_CACHE = 300;

function guardarNoCache(chave: string, dados: string) {
  cache.set(chave, dados);
  while (cache.size > TETO_CACHE) {
    const maisAntiga = cache.keys().next().value;
    if (maisAntiga === undefined) break;
    cache.delete(maisAntiga);
  }
}

function Miniatura({ fileUrl, pagina }: { fileUrl: string; pagina: number }) {
  const chave = `${fileUrl}#${pagina}`;
  const [url, setUrl] = useState<string | null>(() => cache.get(chave) ?? null);
  const [falhou, setFalhou] = useState(false);
  const caixaRef = useRef<HTMLSpanElement>(null);

  const desenhar = useCallback(async () => {
    if (cache.has(chave)) {
      setUrl(cache.get(chave) as string);
      return;
    }
    try {
      const dados = await naFila(async () => {
        const doc = await abrirDoc(fileUrl);
        const page = await doc.getPage(pagina);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: LARGURA_MINIATURA / base.width });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const canvasContext = canvas.getContext("2d");
        if (!canvasContext) return null;
        await page.render({ canvas, canvasContext, viewport }).promise;
        return canvas.toDataURL("image/jpeg", 0.72);
      });
      if (!dados) {
        setFalhou(true);
        return;
      }
      guardarNoCache(chave, dados);
      setUrl(dados);
    } catch {
      // página que não desenha (fonte quebrada, arquivo cortado) não impede folhear
      setFalhou(true);
    }
  }, [chave, fileUrl, pagina]);

  // Só desenha o que está chegando na tela — a margem generosa deixa a miniatura
  // pronta antes de a pessoa alcançar ela na rolagem.
  useEffect(() => {
    if (url) return;
    const el = caixaRef.current;
    if (!el) return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (!entradas.some((e) => e.isIntersecting)) return;
        observador.disconnect();
        void desenhar();
      },
      { rootMargin: "600px 0px" },
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, [desenhar, url]);

  return (
    <span
      ref={caixaRef}
      className="flex aspect-[1/1.4] items-center justify-center overflow-hidden rounded bg-surface"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL desenhada aqui, sem servidor pra otimizar
        <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <span className={`text-xs text-muted ${falhou ? "" : "animate-pulse"}`}>
          {falhou ? "—" : ""}
        </span>
      )}
    </span>
  );
}
