import { HIGHLIGHT_FILL } from "@/lib/types";

/** Larguras das linhas, em %. Fixas pra não mudar a cada visita. */
const LINHAS = [96, 88, 93, 71, 97, 84, 90, 62, 95, 89, 76];

/** Quais dessas linhas saem marcadas, e em qual cor. */
const MARCADAS: Record<number, "yellow" | "blue"> = { 4: "yellow", 5: "yellow", 8: "blue" };

/**
 * Uma página de livro desenhada, pra landing mostrar do que se trata.
 *
 * Barras em vez de texto de mentira: qualquer frase aqui teria que ser
 * traduzida seis vezes, e ninguém a leria — quem bate o olho quer reconhecer
 * **a forma** de uma página marcada, não ler o parágrafo. Sem texto, o desenho
 * vale igual em qualquer idioma, e por isso ele é `aria-hidden` com uma
 * descrição por fora.
 *
 * Tudo em CSS: nenhuma imagem pra baixar, e as cores são as mesmas variáveis do
 * leitor, então o claro e o escuro combinam sozinhos.
 */
export default function PaginaDemo({ alt }: { alt: string }) {
  return (
    <div role="img" aria-label={alt} className="sobe relative mx-auto w-full max-w-sm lg:max-w-none">
      {/* a folha */}
      <div className="relative overflow-hidden rounded-r-2xl rounded-l-md bg-surface p-6 shadow-[0_2px_8px_rgba(60,45,25,0.10),0_28px_60px_-28px_rgba(60,45,25,0.55)] sm:p-8">
        {/* lombada */}
        <div
          aria-hidden
          className="absolute inset-y-0 left-0 w-[9px] bg-gradient-to-r from-black/20 to-transparent"
        />

        {/* título do capítulo */}
        <div aria-hidden className="mb-5 ml-1">
          <div className="h-3 w-2/5 rounded bg-foreground/70" />
          <div className="mt-2 h-1.5 w-1/4 rounded bg-[var(--gold)]/60" />
        </div>

        {/* corpo */}
        <div aria-hidden className="ml-1 space-y-[0.62rem]">
          {LINHAS.map((largura, i) => {
            const cor = MARCADAS[i];
            return (
              <div key={i} className="relative">
                {cor && (
                  // O véu por baixo, como no leitor: a marcação cobre a linha
                  // inteira e sobra um pouco pros lados, do jeito que caneta faz.
                  <span
                    className="absolute -inset-x-1 -inset-y-[3px] rounded-[3px]"
                    style={{ background: HIGHLIGHT_FILL[cor] }}
                  />
                )}
                <div
                  className="relative h-2 rounded bg-foreground/22"
                  style={{ width: `${largura}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* o número que o livro imprime — o detalhe que a seção de baixo explica */}
        <p className="mt-7 text-center text-[11px] tabular-nums text-muted">105</p>
      </div>

      {/* o bilhete na margem */}
      <div
        aria-hidden
        className="absolute -bottom-5 -right-3 w-40 rotate-[-3deg] rounded-xl border border-border bg-background p-3 shadow-[var(--shadow)] sm:-right-6 sm:w-44"
      >
        <div className="h-1.5 w-10 rounded bg-accent/60" />
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-full rounded bg-foreground/20" />
          <div className="h-1.5 w-11/12 rounded bg-foreground/20" />
          <div className="h-1.5 w-2/3 rounded bg-foreground/20" />
        </div>
      </div>
    </div>
  );
}
