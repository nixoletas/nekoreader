# -*- coding: utf-8 -*-
"""
Converte o wordmark "Nekoreader" em contorno e escreve `src/lib/logo-wordmark.ts`.

**Não faz parte do build.** É um script de uma vez só, pra quando o nome, a
fonte ou o peso mudarem — o que o app usa é o `.ts` gerado, que está no git.
Rodar precisa de Python e `pip install fonttools`, que o resto do projeto não
usa; e precisa de um `npm run build` (ou `dev`) antes, porque o woff2 da fonte
vem do que o `next/font` baixou.

Por que contorno e não `<text>`: um SVG com `<text>` usa a fonte da máquina de
quem olha, e o logo mudaria de forma de computador pra computador. Assim ele é
sempre a Fraunces, a mesma que o app carrega.

O desenho da marca (o gato e o livro) **não** está aqui — está em
`src/lib/logo.ts`, que é a fonte única dele. Este script só sabe de letras.

    python scripts/gerar-logo.py
"""
import glob
import io
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen

NOME = "Nekoreader"
KICKER = "READ AND MARK UP"
SAIDA = "src/lib/logo-wordmark.ts"


def achar_fonte():
    """
    O woff2 da Fraunces, procurado pelo conteúdo e não pelo nome: o `next/font`
    põe um hash no arquivo e ele muda a cada build. Também há mais de um woff2
    ali (outros subconjuntos), e só serve o que tem as letras de que precisamos.
    """
    preciso = set(NOME + KICKER) - {" "}
    for caminho in sorted(glob.glob(".next/static/media/*.woff2")):
        try:
            f = TTFont(caminho)
            cmap = f.getBestCmap()
            familia = f["name"].getDebugName(1) or ""
        except Exception:
            continue
        if "Fraunces" in familia and all(ord(c) in cmap for c in preciso):
            return caminho
    raise SystemExit(
        "não achei o woff2 da Fraunces em .next/static/media — rode `npm run build` antes"
    )


def escrever(fonte, texto, corpo, espaco=0.0):
    """
    Contorno de uma palavra, já na escala de `corpo` px e com a origem no canto
    superior esquerdo da caixa de maiúsculas.

    `espaco` é o espacejamento entre letras, em fração do corpo — o mesmo papel
    do `tracking` do CSS.
    """
    upem = fonte["head"].unitsPerEm
    escala = corpo / upem
    cmap = fonte.getBestCmap()
    glifos = fonte.getGlyphSet()
    altura = fonte["OS/2"].sCapHeight

    partes = []
    caneta_x = 0.0
    for c in texto:
        nome = cmap.get(ord(c))
        if nome is None:
            raise SystemExit("a fonte não tem %r" % c)
        glifo = glifos[nome]
        caneta = SVGPathPen(glifos)
        glifo.draw(caneta)
        d = caneta.getCommands()
        if d:
            # A caixa da fonte cresce pra cima e a do SVG pra baixo: o -escala no
            # y é o que vira o desenho, e o +altura põe o topo das maiúsculas no
            # zero em vez da linha de base.
            partes.append(
                '<path transform="translate(%.2f %.2f) scale(%.5f %.5f)" d="%s"/>'
                % (caneta_x, altura * escala, escala, -escala, d)
            )
        caneta_x += glifo.width * escala + espaco * corpo

    largura = caneta_x - (espaco * corpo if texto else 0)
    return "".join(partes), largura


def main():
    caminho = achar_fonte()
    nome_d, nome_w = escrever(instancer.instantiateVariableFont(
        TTFont(caminho), {"wght": 600}, inplace=True), NOME, 58)
    kicker_d, kicker_w = escrever(instancer.instantiateVariableFont(
        TTFont(caminho), {"wght": 500}, inplace=True), KICKER, 15, espaco=0.22)

    ts = """/**
 * O wordmark em contorno — **arquivo gerado**, não edite à mão.
 *
 * Sai de `scripts/gerar-logo.py`, que converte a Fraunces (a mesma fonte de
 * display do app) em curvas. É contorno, e não `<text>`, pra o logo não mudar
 * de forma na máquina de quem não tem a fonte.
 *
 * As coordenadas já estão em px, com a origem no canto superior esquerdo da
 * caixa de maiúsculas — encoste no y que quiser que o topo das letras fique.
 */

/** "%s", Fraunces 600, corpo 58px. */
export const WORDMARK = {
  d: %s,
  largura: %.1f,
  altura: 58,
} as const;

/** "%s", Fraunces 500, corpo 15px, entreletra 0.22em. */
export const KICKER = {
  d: %s,
  largura: %.1f,
  altura: 15,
} as const;
""" % (NOME, ts_str(nome_d), nome_w, KICKER, ts_str(kicker_d), kicker_w)

    io.open(SAIDA, "w", encoding="utf-8", newline="\n").write(ts)
    print("%s  %d bytes  (wordmark %.1fpx, kicker %.1fpx)" % (SAIDA, len(ts), nome_w, kicker_w))
    print("fonte: %s" % caminho)


def ts_str(s):
    """
    O trecho como literal de TypeScript.

    Crase, e não aspas: o conteúdo é markup (`<path transform="..." d="..."/>`),
    então já vem cheio de aspas duplas. Crase e `${` é que não podem aparecer, e
    não aparecem em path data — o assert está aqui pra avisar se um dia
    aparecerem.
    """
    assert "`" not in s and "${" not in s, "markup inesperado no contorno"
    return "`%s`" % s


main()
