"use client";

import { useEffect, useRef, useState } from "react";
import { BookMarked, FileText, X } from "lucide-react";
import { abrirDoc } from "@/lib/pdf";
import { baixar, exportarLivro, type Formato } from "@/lib/exportar-pdf";
import type { Rotulos } from "@/lib/pdf-rotulos";
import { Botao } from "@/components/ui";
import { useI18n } from "@/lib/i18n/cliente";
import { textoDoErro } from "@/lib/erros";

/**
 * Tirar o livro do app: o texto remontado vira Markdown ou EPUB.
 *
 * A conversão passa por todas as páginas com a mesma remontagem da leitura, o
 * que num livro grande leva um tempo — daí a barra e o botão de cancelar. Roda
 * tudo aqui no navegador: o arquivo não sobe pra lugar nenhum.
 */
export default function ExportarLivro({
  fileUrl,
  titulo,
  autor,
  rotulos,
  onFechar,
}: {
  fileUrl: string;
  titulo: string;
  autor: string | null;
  rotulos: Rotulos | null;
  onFechar: () => void;
}) {
  const { d, t, locale } = useI18n();
  const [formato, setFormato] = useState<Formato | null>(null);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  // Sair no meio da conversão para o trabalho — senão ele segue moendo página
  // numa aba que a pessoa já fechou.
  useEffect(() => () => controle.current?.abort(), []);

  async function converter(alvo: Formato) {
    setFormato(alvo);
    setProgresso(0);
    setErro(null);
    setPronto(null);

    const meu = new AbortController();
    controle.current = meu;

    try {
      const doc = await abrirDoc(fileUrl);
      const { nome, blob } = await exportarLivro({
        doc,
        rotulos,
        // O EPUB gerado carrega o idioma do app: é o que faz o leitor de EPUB
        // hifenizar certo e dizer "Sumário" na língua de quem vai ler.
        meta: {
          titulo,
          autor,
          idioma: locale,
          textos: {
            sumario: d.exportBook.contents,
            paginas: d.exportBook.pages,
            trecho: d.exportBook.excerpt,
          },
        },
        formato: alvo,
        sinal: meu.signal,
        aoProgredir: (f) => {
          if (!meu.signal.aborted) setProgresso(f);
        },
      });
      if (meu.signal.aborted) return;

      baixar(nome, blob);
      setPronto(nome);
    } catch (e) {
      if (meu.signal.aborted) return;
      setErro(textoDoErro(d, e));
    } finally {
      setFormato((f) => (meu.signal.aborted ? null : f));
    }
  }

  const convertendo = formato !== null && !pronto && !erro;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center">
      <div className="sobe w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="display text-lg">{d.exportBook.title}</h2>
          <button
            onClick={onFechar}
            aria-label={d.common.close}
            className="tap ml-auto rounded-lg text-muted transition hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {convertendo ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted">
              {t(d.exportBook.converting, { pct: Math.round(progresso * 100) })}
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-background">
              <div
                className="h-full rounded-full bg-accent transition-[width]"
                style={{ width: `${Math.max(3, progresso * 100)}%` }}
              />
            </div>
            <Botao
              variante="contorno"
              onClick={() => {
                controle.current?.abort();
                setFormato(null);
              }}
              className="w-full"
            >
              {d.common.cancel}
            </Botao>
          </div>
        ) : pronto ? (
          <div className="space-y-4 py-2">
            <p className="text-sm leading-relaxed">{t(d.exportBook.done, { file: pronto })}</p>
            <Botao onClick={onFechar} className="w-full">
              {d.common.close}
            </Botao>
          </div>
        ) : (
          <div className="space-y-2">
            {erro && <p className="pb-1 text-sm text-red-500">{erro}</p>}

            <Opcao
              icone={<BookMarked className="h-5 w-5" aria-hidden />}
              titulo={d.exportBook.epubTitle}
              descricao={d.exportBook.epubDescription}
              onClick={() => void converter("epub")}
            />
            <Opcao
              icone={<FileText className="h-5 w-5" aria-hidden />}
              titulo={d.exportBook.markdownTitle}
              descricao={d.exportBook.markdownDescription}
              onClick={() => void converter("markdown")}
            />

            <p className="pt-2 text-[11px] leading-relaxed text-muted">
              {d.exportBook.localOnly}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Opcao({
  icone,
  titulo,
  descricao,
  onClick,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="tap flex w-full items-start gap-3 rounded-xl border border-border p-3 text-left transition hover:border-accent hover:bg-accent/5"
    >
      <span className="mt-0.5 shrink-0 text-accent">{icone}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-xs leading-relaxed text-muted">{descricao}</span>
      </span>
    </button>
  );
}
