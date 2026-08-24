"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { urlAssinadaDoLivro } from "@/lib/pdf-url-cache";
import { Botao, Campo } from "@/components/ui";
import type { Book } from "@/lib/types";

/**
 * Renomear o livro — e, quando dá, deixar o próprio livro dizer como se chama.
 *
 * O nome que vem do envio costuma ser o do arquivo
 * ("Fundamentals of Data Engineering (Reis, JoeHousley, Matt) (Z-Library)"),
 * que ninguém escolheu e ninguém quer ver na estante. Aqui dá pra corrigir na
 * mão, ou pedir pro app ler os metadados e a capa; o que a pessoa escreve
 * sempre vale mais que o que o app deduz.
 */
export default function EditarLivro({
  book,
  onSalvo,
  onFechar,
}: {
  book: Book;
  onSalvo: (dados: { title: string; author: string | null }) => void;
  onFechar: () => void;
}) {
  const [titulo, setTitulo] = useState(book.title);
  const [autor, setAutor] = useState(book.author ?? "");
  const [salvando, setSalvando] = useState(false);
  const [detectando, setDetectando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const controle = useRef<AbortController | null>(null);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [onFechar]);

  useEffect(() => () => controle.current?.abort(), []);

  /**
   * Lê o livro atrás do nome: metadados, texto da capa e, se a capa for uma
   * imagem (livro digitalizado), OCR dela. Aqui o OCR entra sem pedir licença
   * porque é uma página só — o que custa caro é o livro inteiro.
   */
  async function detectar() {
    const meu = new AbortController();
    controle.current = meu;
    setDetectando(true);
    setErro(null);
    setAviso(null);

    try {
      const supabase = createClient();
      const url = await urlAssinadaDoLivro(supabase, book.storage_path);
      const [{ abrirDoc }, { titulosDoPdf }] = await Promise.all([
        import("@/lib/pdf"),
        import("@/lib/pdf-titulo"),
      ]);
      const achado = await titulosDoPdf(await abrirDoc(url), {
        comOcr: true,
        sinal: meu.signal,
      });
      if (meu.signal.aborted) return;

      if (!achado.titulo && !achado.autor) {
        setAviso("Não achei nada no arquivo — o jeito é escrever à mão.");
        return;
      }
      if (achado.titulo) setTitulo(achado.titulo);
      if (achado.autor) setAutor(achado.autor);
      setAviso(
        achado.fonte === "metadados"
          ? "Veio dos dados do arquivo."
          : achado.fonte === "ocr"
            ? "Lido da imagem da capa — confira."
            : "Lido do texto da capa — confira.",
      );
    } catch (e) {
      if (meu.signal.aborted) return;
      setErro(e instanceof Error ? e.message : "Não consegui ler o arquivo.");
    } finally {
      if (!meu.signal.aborted) setDetectando(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const novoTitulo = titulo.trim();
    if (!novoTitulo) {
      setErro("O livro precisa de um nome.");
      return;
    }

    setSalvando(true);
    setErro(null);
    const novoAutor = autor.trim() || null;
    const { error } = await createClient()
      .from("books")
      .update({ title: novoTitulo, author: novoAutor })
      .eq("id", book.id);

    if (error) {
      setErro(error.message);
      setSalvando(false);
      return;
    }

    onSalvo({ title: novoTitulo, author: novoAutor });
    onFechar();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onFechar()}
    >
      <form
        onSubmit={salvar}
        className="sobe w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center gap-2">
          <h2 className="display text-lg">Editar o livro</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="tap ml-auto rounded-lg text-muted transition hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-3">
          <Campo
            label="Título"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
          />
          <Campo
            label="Autor"
            value={autor}
            onChange={(e) => setAutor(e.target.value)}
            placeholder="opcional"
          />
        </div>

        {book.format === "pdf" && (
          <button
            type="button"
            onClick={() => void detectar()}
            disabled={detectando}
            className="tap mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 text-sm text-muted transition hover:border-accent hover:text-accent disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" aria-hidden />
            {detectando ? "Lendo o arquivo…" : "Descobrir pelo arquivo"}
          </button>
        )}

        {aviso && <p className="mt-3 text-xs leading-relaxed text-muted">{aviso}</p>}
        {erro && <p className="mt-3 text-sm text-red-500">{erro}</p>}

        <div className="mt-5 flex gap-2">
          <Botao type="button" variante="contorno" onClick={onFechar} className="flex-1">
            Cancelar
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando ? "Salvando…" : "Salvar"}
          </Botao>
        </div>
      </form>
    </div>
  );
}
