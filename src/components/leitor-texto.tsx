"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Trash2, X } from "lucide-react";
import type { Bloco, Elo, Faixa } from "@/lib/pdf-blocos";
import { useSwipe } from "@/lib/swipe";
import Balao from "@/components/balao";
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

/** Quanto a seleção precisa ficar parada antes do balão aparecer, em ms. */
const ESPERA_SELECAO = 180;

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
  // O dedo está no balão? Tocar nele apaga a seleção (é um toque fora do texto),
  // e sem esta trava o balão sumiria antes do toque virar clique.
  const noBalao = useRef(false);

  // Trocar de página/capítulo derruba qualquer popover aberto do conteúdo anterior
  // (ajuste de estado durante o render).
  const [chaveAnterior, setChaveAnterior] = useState(chave);
  if (chaveAnterior !== chave) {
    setChaveAnterior(chave);
    setPending(null);
    setAtiva(null);
  }

  /** Lê a seleção atual e põe (ou tira) o balão de cores. */
  const lerSelecao = useCallback(() => {
    if (noBalao.current) return;
    const artigoEl = artigoRef.current;
    const sel = window.getSelection();

    if (!artigoEl || !sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPending(null);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!artigoEl.contains(range.commonAncestorContainer)) {
      setPending(null);
      return;
    }

    const spans = capturarSpans(artigoEl, range);
    const texto = sel.toString().replace(/\s+/g, " ").trim();
    if (!spans.length || !texto) {
      setPending(null);
      return;
    }

    const base = artigoEl.getBoundingClientRect();
    const r = primeiroRetangulo(range);
    setAtiva(null);
    setPending({
      spans,
      text: texto,
      x: r.left + r.width / 2 - base.left,
      y: r.top - base.top,
      h: r.height,
    });
  }, []);

  /**
   * O balão segue a seleção, em vez de aparecer só quando o dedo levanta.
   *
   * No celular a seleção continua se ajustando depois do `pointerup` — a pessoa
   * arrasta as alcinhas pra esticar o trecho. Ouvindo `selectionchange` com uma
   * pausa curta, o balão espera a seleção assentar e depois se posiciona onde ela
   * de fato terminou.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const aoMudar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(lerSelecao, ESPERA_SELECAO);
    };

    // Um só lugar decide se o dedo está no balão ou no texto.
    const aoPressionar = (e: PointerEvent) => {
      const alvo = e.target;
      noBalao.current = alvo instanceof Element && !!alvo.closest(".balao");
    };

    document.addEventListener("selectionchange", aoMudar);
    document.addEventListener("pointerdown", aoPressionar, true);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("selectionchange", aoMudar);
      document.removeEventListener("pointerdown", aoPressionar, true);
    };
  }, [lerSelecao]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed) return;

      // Tocar num endereço é abrir o endereço. Sem isto, um link dentro de um
      // trecho marcado abriria o link e o balão de apagar a marcação de uma vez.
      if ((e.target as HTMLElement).closest("a[href]")) return;

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
    setPending(null);
    noBalao.current = false;
    window.getSelection()?.removeAllRanges();
    await onAddHighlight(pending.spans, pending.text, color);
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
        if (b.tipo === "sumario") {
          // Sem `data-bloco`, pelo mesmo motivo da tabela: a marcação guarda
          // posição por caractere num texto corrido, e aqui não existe um.
          return (
            <ul key={i} className="sumario-livro">
              {b.entradas.map((e, k) => (
                <li key={k} data-nivel={e.nivel}>
                  <span className="titulo">{e.texto}</span>
                  {e.pagina && (
                    <>
                      <span className="guia" aria-hidden />
                      <span className="pagina">{e.pagina}</span>
                    </>
                  )}
                </li>
              ))}
            </ul>
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
        const comEstilo = b.tipo === "paragrafo" || b.tipo === "citacao" || b.tipo === "nota";
        const conteudo = fatiarTexto(
          b.texto,
          i,
          highlights,
          ativa?.highlight.id ?? null,
          comEstilo ? b.negrito : [],
          comEstilo ? b.italico : [],
          comEstilo ? b.sobrescrito : [],
          comEstilo ? b.links : [],
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
        if (b.tipo === "nota") {
          return (
            <p key={i} className="nota" data-bloco={i}>
              {conteudo}
            </p>
          );
        }
        return (
          <p key={i} data-bloco={i}>
            {conteudo}
          </p>
        );
      })}

      {pending && (
        <Balao {...posicaoDoBalao(pending)}>
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
              noBalao.current = false;
              window.getSelection()?.removeAllRanges();
            }}
            aria-label="Cancelar"
            className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition active:scale-90"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </Balao>
      )}

      {ativa && !pending && (
        <Balao {...posicaoDoBalao(ativa)}>
          <button
            onClick={async () => {
              setAtiva(null);
              noBalao.current = false;
              await onDeleteHighlight(ativa.highlight.id);
            }}
            className="tap flex !min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Apagar marcação
          </button>
        </Balao>
      )}
    </article>
  );
}

/* ---------------------------------------------------------------- */

/**
 * Fatia o texto do bloco nos trechos marcados (<mark>), em negrito (<strong>),
 * em itálico (<em>) e nas chamadas de nota levantadas da linha (<sup>).
 *
 * As três camadas se sobrepõem à vontade — marcar metade de uma palavra em
 * negrito, ou um título de livro em itálico dentro de uma frase marcada, é
 * normal —, então o corte é feito em todos os limites de uma vez e cada pedaço
 * recebe o que valer nele.
 */
function fatiarTexto(
  texto: string,
  indice: number,
  highlights: Highlight[],
  ativaId: string | null,
  negrito: Faixa[] = [],
  italico: Faixa[] = [],
  sobrescrito: Faixa[] = [],
  links: Elo[] = [],
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
  const inclinados = italico.map(dentro).filter((f) => f.start < f.end);
  const elevados = sobrescrito.map(dentro).filter((f) => f.start < f.end);
  const enderecos = links
    .map((l) => ({ ...l, ...dentro(l) }))
    .filter((l) => l.start < l.end);

  if (
    !trechos.length &&
    !fortes.length &&
    !inclinados.length &&
    !elevados.length &&
    !enderecos.length
  ) {
    return texto;
  }

  const pontos = new Set<number>([0, texto.length]);
  for (const f of [...trechos, ...fortes, ...inclinados, ...elevados, ...enderecos]) {
    pontos.add(f.start);
    pontos.add(f.end);
  }
  const cortes = [...pontos].sort((a, b) => a - b);

  const nos: React.ReactNode[] = [];
  for (let i = 0; i < cortes.length - 1; i++) {
    const ini = cortes[i];
    const fim = cortes[i + 1];
    if (ini >= fim) continue;
    const cobre = (f: Faixa) => f.start <= ini && f.end >= fim;

    // De dentro pra fora: itálico, negrito, o sobrescrito, o link, e por último
    // o véu da marcação — que precisa ficar por fora pra pintar tudo o que está
    // dentro.
    let conteudo: React.ReactNode = texto.slice(ini, fim);
    if (inclinados.some(cobre)) conteudo = <em>{conteudo}</em>;
    if (fortes.some(cobre)) conteudo = <strong>{conteudo}</strong>;
    if (elevados.some(cobre)) conteudo = <sup>{conteudo}</sup>;

    const endereco = enderecos.find(cobre);
    if (endereco) {
      conteudo = (
        <a
          href={endereco.href}
          // Abre fora da leitura — no PWA, numa aba/janela do navegador. Sem
          // `noopener` a página aberta ganharia referência de volta pra esta.
          target="_blank"
          rel="noopener noreferrer external"
          // O toque no endereço não é toque no parágrafo: sem isto o leitor
          // ainda tentaria abrir o balão da marcação junto.
          onClick={(e) => e.stopPropagation()}
          className="elo"
        >
          {conteudo}
        </a>
      );
    }

    const marcado = trechos.find(cobre);
    if (marcado) {
      nos.push(
        <mark
          key={ini}
          data-highlight-id={marcado.id}
          data-ativa={marcado.id === ativaId}
          className="txt-mark"
          style={{ background: fill(marcado.color) }}
        >
          {conteudo}
        </mark>,
      );
    } else {
      // Fragment só pra carregar a chave: <em>/<strong> aninhados já dão a
      // marcação certa, e um <span> por volta seria elemento a mais à toa.
      nos.push(<Fragment key={ini}>{conteudo}</Fragment>);
    }
  }
  return nos;
}

/**
 * Converte uma seleção em trechos por bloco — cada `[data-bloco]` tocado vira um.
 *
 * O cuidado todo está em recortar a seleção **dentro** de cada bloco antes de
 * medir. `intersectsNode` diz "sim" também pro bloco que a seleção apenas
 * encosta: no celular, escolher uma palavra costuma deixar a ponta da seleção
 * parada na borda do parágrafo seguinte, e sem o recorte esse parágrafo inteiro
 * era marcado junto.
 */
function capturarSpans(artigoEl: HTMLElement, range: Range): TextSpan[] {
  const spans: TextSpan[] = [];

  for (const el of Array.from(artigoEl.querySelectorAll<HTMLElement>("[data-bloco]"))) {
    if (!range.intersectsNode(el)) continue;

    const pedaco = recortarNoBloco(range, el);
    if (!pedaco) continue;

    const comprimento = el.textContent?.length ?? 0;
    const bruto = {
      start: offsetNoContainer(el, pedaco.startContainer, pedaco.startOffset),
      end: offsetNoContainer(el, pedaco.endContainer, pedaco.endOffset),
    };
    const start = Math.max(0, Math.min(comprimento, bruto.start));
    const end = Math.max(start, Math.min(comprimento, bruto.end));
    if (end > start) spans.push({ bloco: Number(el.dataset.bloco), start, end });
  }

  return spans;
}

/** A parte da seleção que cai dentro deste bloco — `null` se ela só encosta na borda. */
function recortarNoBloco(range: Range, el: HTMLElement): Range | null {
  const inteiro = document.createRange();
  inteiro.selectNodeContents(el);

  const pedaco = range.cloneRange();
  try {
    if (pedaco.compareBoundaryPoints(Range.START_TO_START, inteiro) < 0) {
      pedaco.setStart(inteiro.startContainer, inteiro.startOffset);
    }
    if (pedaco.compareBoundaryPoints(Range.END_TO_END, inteiro) > 0) {
      pedaco.setEnd(inteiro.endContainer, inteiro.endOffset);
    }
  } catch {
    return null;
  }

  // Recorte vazio (ou só espaço) quer dizer que a seleção passou raspando: não é
  // trecho marcado nenhum.
  return pedaco.collapsed || !pedaco.toString().trim() ? null : pedaco;
}

/**
 * O retângulo mais acima (e mais à esquerda) da seleção — onde o balão ancora.
 *
 * A ordem que `getClientRects` devolve não é garantida entre navegadores, e
 * confiar no primeiro da lista era o que podia jogar o balão pro fim do trecho.
 */
function primeiroRetangulo(range: Range): DOMRect {
  const rects = Array.from(range.getClientRects()).filter(
    (r) => r.width > 1 && r.height > 1,
  );
  if (!rects.length) return range.getBoundingClientRect();
  return rects.reduce((melhor, r) =>
    r.top < melhor.top - 1 || (Math.abs(r.top - melhor.top) <= 1 && r.left < melhor.left)
      ? r
      : melhor,
  );
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

/**
 * Onde o balão sai na tela grande, a partir do retângulo do trecho.
 *
 * Perto do topo do texto não cabe nada por cima, então ele desce pra baixo do
 * trecho. (No celular isto é ignorado — lá ele é ancorado no rodapé.)
 */
function posicaoDoBalao({ x, y, h }: { x: number; y: number; h: number }) {
  const acima = y > 60;
  return {
    acima,
    esquerda: `clamp(7.5rem, ${x}px, calc(100% - 7.5rem))`,
    topo: `${acima ? y - 10 : y + h + 10}px`,
  };
}
