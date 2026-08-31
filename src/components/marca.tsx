import { MARCA_TOKENS, marcaSvg } from "@/lib/logo";

/**
 * A marca desenhada dentro da página.
 *
 * Vai inline no DOM, e não como `<img src="/logo.svg">`, por um motivo só: assim
 * o SVG enxerga as variáveis do tema (`--accent`, `--surface`…) e acompanha
 * claro e escuro sozinho. Como imagem seriam dois arquivos e um `<picture>`,
 * pra mostrar o mesmo desenho.
 *
 * Sem `"use client"` e sem estado: é forma, não comportamento — não custa um
 * byte de JavaScript ao navegador.
 *
 * `id` precisa ser diferente a cada uso na mesma página: ele nomeia o
 * `clipPath`, e dois iguais fariam um desenho recortar pelo outro. Não sai de um
 * `useId()` justamente pra o componente continuar podendo ser do servidor.
 */
export default function Marca({
  id,
  tamanho = 32,
  titulo,
  className = "",
}: {
  id: string;
  tamanho?: number;
  /** Passe quando a marca for sozinha (sem o nome escrito ao lado). */
  titulo?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 ${className}`}
      style={{ width: tamanho, height: tamanho }}
      dangerouslySetInnerHTML={{
        __html: marcaSvg(MARCA_TOKENS, {
          fundo: "nenhum",
          id: `marca-${id}`,
          tamanho,
          titulo,
        }),
      }}
    />
  );
}
