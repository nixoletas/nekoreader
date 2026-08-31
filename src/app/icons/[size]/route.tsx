import { ImageResponse } from "next/og";
import { MARCA_CLARA, marcaSvg } from "@/lib/logo";

const PERMITIDOS = new Set([180, 192, 512]);

/**
 * O ícone do app, desenhado na hora nos tamanhos que o PWA e o iOS pedem.
 *
 * O desenho vem de `src/lib/logo.ts`, que é a fonte única da marca — aqui só se
 * rasteriza. Antes o livro era montado com `<div>` neste arquivo, e virou uma
 * segunda versão do logo que ninguém lembrava de atualizar junto.
 *
 * `?mask=1` devolve a variante *maskable*: o Android recorta o ícone num
 * círculo, e sem folga em volta as orelhas do gato são a primeira coisa que ele
 * corta fora. A folga de 14% deixa o desenho dentro dos 80% centrais que a
 * especificação garante, e o fundo vai reto porque quem arredonda é o sistema.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const s = Number(size);
  if (!PERMITIDOS.has(s)) return new Response("Not found", { status: 404 });

  const mascara = new URL(req.url).searchParams.get("mask") === "1";
  const svg = marcaSvg(MARCA_CLARA, {
    fundo: mascara ? "reto" : "arredondado",
    folga: mascara ? 0.14 : 0,
    id: "icone",
  });

  return new ImageResponse(
    (
      <div style={{ display: "flex", width: s, height: s }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori não tem DOM: aqui `img` é o jeito de pôr um SVG */}
        <img
          src={`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`}
          width={s}
          height={s}
          alt=""
        />
      </div>
    ),
    { width: s, height: s },
  );
}
