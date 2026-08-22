"use client";

/**
 * O balão de ações da seleção (cores, apagar).
 *
 * No celular ele fica **ancorado no rodapé**, e não junto do trecho escolhido.
 * Flutuando por cima da seleção ele cobria as alças que a pessoa usa pra esticar
 * o trecho — e um balão que impede de terminar a seleção é pior que um balão
 * longe dela. No computador não existem alças, então lá ele continua saindo ao
 * lado do trecho, que é mais direto.
 *
 * Quem chama passa a posição já pronta em unidade CSS; ela só vale na tela
 * grande, e o `globals.css` é que decide qual dos dois arranjos usar.
 */
export default function Balao({
  esquerda,
  topo,
  acima,
  children,
}: {
  esquerda: string;
  topo: string;
  /** O balão sai por cima do trecho (senão, por baixo). Só vale na tela grande. */
  acima: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="balao sobe flex items-center gap-1.5 rounded-2xl bg-[#26201a] px-2 py-1.5 shadow-xl ring-1 ring-white/10"
      style={
        {
          "--balao-x": esquerda,
          "--balao-y": topo,
          "--balao-desloca": acima ? "-100%" : "0%",
        } as React.CSSProperties
      }
      // O toque no balão é no balão: não pode virar toque no texto atrás dele,
      // que desfaria a seleção que ele existe pra confirmar.
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
