"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { urlAssinadaDoLivro } from "@/lib/pdf-url-cache";
import { Botao, Campo } from "@/components/ui";
import { useI18n } from "@/lib/i18n/cliente";
import { IDIOMAS_OCR } from "@/lib/i18n/config";
import { textoDoErro } from "@/lib/erros";
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
  const { d, locale } = useI18n();
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
        idiomas: IDIOMAS_OCR[locale],
      });
      if (meu.signal.aborted) return;

      if (!achado.titulo && !achado.autor) {
        setAviso(d.edit.nothingFound);
        return;
      }
      if (achado.titulo) setTitulo(achado.titulo);
      if (achado.autor) setAutor(achado.autor);
      setAviso(
        achado.fonte === "metadados"
          ? d.edit.fromMetadata
          : achado.fonte === "ocr"
            ? d.edit.fromCoverImage
            : d.edit.fromCoverText,
      );
    } catch (e) {
      if (meu.signal.aborted) return;
      setErro(textoDoErro(d, e));
    } finally {
      if (!meu.signal.aborted) setDetectando(false);
    }
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    const novoTitulo = titulo.trim();
    if (!novoTitulo) {
      setErro(d.edit.needTitle);
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
          <h2 className="display text-lg">{d.edit.title}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label={d.common.close}
            className="tap ml-auto rounded-lg text-muted transition hover:text-foreground"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-3">
          <Campo
            label={d.edit.bookTitle}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            autoFocus
          />
          <Campo
            label={d.edit.author}
            value={autor}
            onChange={(e) => setAutor(e.target.value)}
            placeholder={d.edit.authorPlaceholder}
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
            {detectando ? d.edit.detecting : d.edit.detect}
          </button>
        )}

        {aviso && <p className="mt-3 text-xs leading-relaxed text-muted">{aviso}</p>}
        {erro && <p className="mt-3 text-sm text-red-500">{erro}</p>}

        <div className="mt-5 flex gap-2">
          <Botao type="button" variante="contorno" onClick={onFechar} className="flex-1">
            {d.common.cancel}
          </Botao>
          <Botao type="submit" disabled={salvando} className="flex-1">
            {salvando ? d.common.saving : d.common.save}
          </Botao>
        </div>
      </form>
    </div>
  );
}
