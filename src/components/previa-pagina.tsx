"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { obterPdfOffline, obterPrevia, salvarPrevia } from "@/lib/offline-db";
import { urlAssinadaDoLivro } from "@/lib/pdf-url-cache";
import type { Book } from "@/lib/types";

/** Largura do desenho, em pixel. Cabe no cartão em tela retina sem pesar. */
const LARGURA = 340;

/**
 * A página onde a leitura parou, desenhada.
 *
 * A capa diz que livro é; esta prévia diz **onde** a pessoa está nele — que é o
 * que "continuar lendo" quer dizer. Ver o próprio parágrafo em que parou é o que
 * transforma o cartão de um atalho num lembrete: dá pra reconhecer a página
 * antes mesmo de abrir.
 *
 * Desenha uma vez por posição e guarda o JPEG no aparelho: a estante é a tela
 * mais visitada do app, e redesenhar (ou pior, rebaixar pedaço do PDF) a cada
 * visita não se justifica por uma imagem que não muda.
 *
 * Cai pra capa sempre que não dá: EPUB (não existe folha pra desenhar), livro
 * sem rede e sem cópia local, arquivo que não abre.
 */
export default function PreviaPagina({
  book,
  capaUrl,
  className = "",
}: {
  book: Book;
  capaUrl: string | null;
  className?: string;
}) {
  const [imagem, setImagem] = useState<string | null>(null);

  useEffect(() => {
    if (book.format !== "pdf") return;
    let vivo = true;
    let urlLocal: string | null = null;

    void (async () => {
      try {
        const guardada = await obterPrevia(book.id);
        if (!vivo) return;
        if (guardada?.pagina === book.last_page) {
          setImagem(guardada.imagem);
          return;
        }

        // Cópia offline primeiro: além de funcionar sem rede, evita baixar de
        // novo um arquivo que já está no aparelho.
        const offline = await obterPdfOffline(book.id);
        if (!vivo) return;

        let url: string;
        if (offline) {
          urlLocal = URL.createObjectURL(offline.blob);
          url = urlLocal;
        } else if (navigator.onLine) {
          url = await urlAssinadaDoLivro(createClient(), book.storage_path);
        } else {
          return; // sem rede e sem cópia: fica a capa
        }
        if (!vivo) return;

        const imagemNova = await desenhar(url, book.last_page);
        if (!vivo || !imagemNova) return;

        setImagem(imagemNova);
        void salvarPrevia({
          bookId: book.id,
          pagina: book.last_page,
          imagem: imagemNova,
          criadoEm: Date.now(),
        }).catch(() => {});
      } catch {
        // prévia é enfeite: falhou, fica a capa
      } finally {
        if (urlLocal) URL.revokeObjectURL(urlLocal);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [book.id, book.format, book.last_page, book.storage_path]);

  if (imagem) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imagem}
        alt={`Página ${book.last_page}`}
        className={`h-full w-full bg-white object-cover object-top ${className}`}
      />
    );
  }

  if (capaUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={capaUrl} alt="" className={`h-full w-full object-cover ${className}`} />;
  }

  return (
    <div
      className={`h-full w-full bg-[linear-gradient(160deg,var(--accent),var(--gold))] ${className}`}
      aria-hidden
    />
  );
}

/** Desenha a página num canvas e devolve o JPEG em data URL. */
async function desenhar(url: string, pagina: number): Promise<string | null> {
  const { abrirDoc } = await import("@/lib/pdf");
  const doc = await abrirDoc(url);
  const page = await doc.getPage(Math.min(Math.max(1, pagina), doc.numPages));
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: LARGURA / base.width });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d");
  if (!canvasContext) return null;

  // Fundo branco: página com transparência sai preta no JPEG.
  canvasContext.fillStyle = "#fff";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvas, canvasContext, viewport }).promise;

  return canvas.toDataURL("image/jpeg", 0.78);
}
