import { ImageResponse } from "next/og";
import { MARCA_CLARA, marcaSvg } from "@/lib/logo";
import { WORDMARK } from "@/lib/logo-wordmark";
import { i18nAtual } from "@/lib/i18n/servidor";

export const alt = "Nekoreader";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * A imagem que aparece quando alguém cola o link do app em algum lugar.
 *
 * Sem ela o link sai pelado — só o endereço, sem dizer o que é. E como ela é
 * gerada no pedido, a frase embaixo sai no idioma de quem compartilhou.
 *
 * A marca e o nome vão dentro de **um SVG só**, embutido como `data:` URI. O
 * motivo é o nome: ele é contorno da Fraunces (`logo-wordmark.ts`), não texto,
 * então não depende de carregar fonte nenhuma aqui. A frase de baixo é a única
 * coisa que usa texto de verdade, e essa o `next/og` desenha com a fonte que já
 * traz embutida.
 */
export default async function Og() {
  const { d } = await i18nAtual();

  // Marca + nome, montados na mesma caixa pra caberem numa imagem só. A viewBox
  // acaba onde o nome acaba (492 + uma folga): sobrando espaço à direita, o
  // conjunto nasce desalinhado do centro da imagem sem que nada pareça errado.
  const brasao = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 150" width="500" height="150">
    <g transform="translate(0 11)">${marcaSvg(MARCA_CLARA, {
      fundo: "nenhum",
      id: "og",
    }).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>
    <g transform="translate(160 46)" fill="#211c16">${WORDMARK.d}</g>
  </svg>`;

  return new ImageResponse(
    (
      <div
        style={{
          width: size.width,
          height: size.height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          background: MARCA_CLARA.papel,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori não tem DOM: aqui `img` é o jeito de pôr um SVG */}
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(brasao).toString("base64")}`}
          width={820}
          height={246}
          alt=""
        />
        <div
          style={{
            maxWidth: 860,
            textAlign: "center",
            fontSize: 37,
            lineHeight: 1.35,
            color: "#6b5f4c",
          }}
        >
          {d.brand.tagline}
        </div>
      </div>
    ),
    size,
  );
}
