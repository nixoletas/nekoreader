/**
 * Escreve os SVG de `public/` a partir do desenho em `src/lib/logo.ts`.
 *
 * Quatro arquivos: a marca sozinha e o banner (marca + wordmark + kicker), cada
 * um em claro e escuro. São os que o README e o `<link rel=icon>` usam.
 *
 * Não faz parte do build — só precisa rodar quando o desenho mudar:
 *
 *     node scripts/gerar-logo.mjs
 *
 * O `.ts` é importado direto: o node 22.6+ tira os tipos sozinho, e assim o
 * desenho não precisa existir duas vezes. `test/logo.test.mjs` confere que os
 * arquivos gerados batem com o módulo — quem mexer no desenho e esquecer de
 * rodar isto aqui descobre no `npm test`, não no logo publicado.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  LADO,
  MARCA_CLARA,
  MARCA_ESCURA,
  marcaInterior,
  marcaSvg,
} from "../src/lib/logo.ts";
import { KICKER, WORDMARK } from "../src/lib/logo-wordmark.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Tinta e cinza do texto — não são cor de marca, só saem do tema. */
const TEXTO = {
  clara: { tinta: "#211c16", suave: "#6b5f4c" },
  escura: { tinta: "#ece2d0", suave: "#9d9285" },
};

const BANNER = { largura: 760, altura: 200 };

/**
 * O banner: a marca à esquerda, o nome e o kicker à direita, separados por um
 * fio na cor da lombada.
 *
 * A marca é ampliada 1.15 e centrada na altura; o texto começa depois dela com
 * folga suficiente pra o conjunto não parecer um carimbo.
 */
function banner(paleta, texto, id) {
  const escala = 1.15;
  const dx = 46;
  const dy = (BANNER.altura - LADO * escala) / 2;
  const x = 232;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BANNER.largura} ${BANNER.altura}" width="${BANNER.largura}" height="${BANNER.altura}" role="img" aria-label="Nekoreader — read and mark up">
<rect width="${BANNER.largura}" height="${BANNER.altura}" rx="24" fill="${paleta.papel}"/>
<g transform="translate(${dx} ${dy.toFixed(1)}) scale(${escala})">${marcaInterior(paleta, id)}</g>
<g transform="translate(${x} 62)" fill="${texto.tinta}">${WORDMARK.d}</g>
<rect x="${x + 2}" y="112" width="${Math.round(Math.min(WORDMARK.largura, 300))}" height="2" rx="1" fill="${paleta.acento}" opacity="0.5"/>
<g transform="translate(${x + 2} 128)" fill="${texto.suave}">${KICKER.d}</g>
</svg>
`;
}

const arquivos = {
  "public/logo.svg": marcaSvg(MARCA_CLARA, { id: "nekoL", titulo: "Nekoreader" }),
  "public/logo-dark.svg": marcaSvg(MARCA_ESCURA, { id: "nekoD", titulo: "Nekoreader" }),
  "public/logo-banner.svg": banner(MARCA_CLARA, TEXTO.clara, "nekoBL"),
  "public/logo-banner-dark.svg": banner(MARCA_ESCURA, TEXTO.escura, "nekoBD"),
};

for (const [relativo, conteudo] of Object.entries(arquivos)) {
  const corpo = conteudo.endsWith("\n") ? conteudo : conteudo + "\n";
  writeFileSync(join(RAIZ, relativo), corpo, "utf8");
  console.log(`${relativo}  ${corpo.length} bytes`);
}
