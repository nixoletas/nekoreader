"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import Uploader from "@/components/uploader";

/**
 * O "+" da estante cheia.
 *
 * Com a estante vazia, subir um livro é a única coisa que existe pra fazer, e a
 * caixa grande de arrastar ocupa a tela inteira com razão. Depois do primeiro
 * livro isso se inverte: quem abre o app quer **ler**, não enviar — e a caixa
 * passa a empurrar a estante pra baixo todo dia por causa de uma ação que
 * acontece de vez em quando. Aqui ela vira um botão discreto no canto.
 *
 * Arrastar um arquivo pra qualquer lugar da página abre o modal sozinho: sem
 * isso, esconder a caixa também esconderia o arrastar-e-soltar, que é o jeito
 * mais rápido de subir um livro no computador.
 */
export default function AdicionarLivro({ onEnviado }: { onEnviado: () => void }) {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const aoArrastar = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      setAberto(true);
    };
    // No `dragover` (e não no `drop`) porque a caixa que recebe o arquivo é a
    // que está dentro do modal: ela precisa já estar na tela quando a pessoa
    // soltar.
    window.addEventListener("dragover", aoArrastar);
    return () => window.removeEventListener("dragover", aoArrastar);
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        aria-label="Adicionar livro"
        title="Adicionar livro"
        className="tap !min-h-9 !min-w-9 rounded-full border border-border bg-surface text-muted transition hover:border-accent/50 hover:text-accent"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          onClick={(e) => e.target === e.currentTarget && setAberto(false)}
          role="dialog"
          aria-modal
          aria-label="Adicionar livro"
        >
          <div className="sobe w-full max-w-md rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:rounded-2xl">
            <div className="mb-4 flex items-center gap-2">
              <h2 className="display text-lg">Adicionar livro</h2>
              <button
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="tap ml-auto rounded-lg text-muted transition hover:text-foreground"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <Uploader
              onUploaded={() => {
                setAberto(false);
                onEnviado();
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}
