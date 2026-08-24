"use client";

import { useEffect, useRef, useState } from "react";
import { BookMarked, FileText, X } from "lucide-react";
import { abrirDoc } from "@/lib/pdf";
import { baixar, exportarLivro, type Formato } from "@/lib/exportar-pdf";
import type { Rotulos } from "@/lib/pdf-rotulos";
import { Botao } from "@/components/ui";

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
        meta: { titulo, autor },
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
      setErro(e instanceof Error ? e.message : "Não consegui converter este livro.");
    } finally {
      setFormato((f) => (meu.signal.aborted ? null : f));
    }
  }

  const convertendo = formato !== null && !pronto && !erro;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center">
      <div className="sobe w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="display text-lg">Exportar o livro</h2>
          <button
            onClick={onFechar}
            aria-label="Fechar"
            className="tap ml-auto rounded-lg text-muted transition hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {convertendo ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted">
              Remontando o livro inteiro — {Math.round(progresso * 100)}%
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
              Cancelar
            </Botao>
          </div>
        ) : pronto ? (
          <div className="space-y-4 py-2">
            <p className="text-sm leading-relaxed">
              Pronto — <strong>{pronto}</strong> foi salvo nos seus downloads.
            </p>
            <Botao onClick={onFechar} className="w-full">
              Fechar
            </Botao>
          </div>
        ) : (
          <div className="space-y-2">
            {erro && <p className="pb-1 text-sm text-red-500">{erro}</p>}

            <Opcao
              icone={<BookMarked className="h-5 w-5" aria-hidden />}
              titulo="EPUB"
              descricao="Livro reflowable, com imagens, sumário e a numeração de página do original — abre no Kindle, Apple Books, Kobo."
              onClick={() => void converter("epub")}
            />
            <Opcao
              icone={<FileText className="h-5 w-5" aria-hidden />}
              titulo="Markdown"
              descricao="Texto puro com títulos, citações, código e tabelas. Cada página marcada, pra citar no Obsidian ou no Notion."
              onClick={() => void converter("markdown")}
            />

            <p className="pt-2 text-[11px] leading-relaxed text-muted">
              A conversão acontece neste aparelho — o livro não sobe pra lugar nenhum.
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
