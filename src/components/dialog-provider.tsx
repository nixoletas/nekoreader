"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Botao } from "@/components/ui";
import { useT } from "@/lib/i18n/cliente";

type Opcoes = {
  titulo: string;
  mensagem?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Ação destrutiva (excluir, remover) — botão de confirmar fica vermelho. */
  perigo?: boolean;
};

type OpcoesTexto = Opcoes & {
  /** Valor que já vem preenchido no campo. */
  valor?: string;
  placeholder?: string;
  /** Texto de vários parágrafos (nota de leitura) em vez de uma linha só. */
  multilinha?: boolean;
  /** Quantos caracteres cabem. Padrão: 120 numa linha, 4000 em várias. */
  limite?: number;
};

type Modo = "confirmar" | "avisar" | "perguntar";
type EstadoDialogo = OpcoesTexto & { modo: Modo };

type ConfirmFn = (opcoes: Opcoes) => Promise<boolean>;
type AlertFn = (opcoes: Opcoes) => Promise<void>;
/** Devolve o texto digitado, ou null se a pessoa cancelou. */
type PromptFn = (opcoes: OpcoesTexto) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const AlertContext = createContext<AlertFn | null>(null);
const PromptContext = createContext<PromptFn | null>(null);

/** Substitui `window.confirm` — mesma forma de uso (`if (!(await confirmar({...)))) return;`). */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmContext);
  if (!fn) throw new Error("useConfirm precisa estar dentro de <DialogProvider>");
  return fn;
}

/** Substitui `window.alert` — mesmo aviso, só que com a cara do app em vez do navegador. */
export function useAlert(): AlertFn {
  const fn = useContext(AlertContext);
  if (!fn) throw new Error("useAlert precisa estar dentro de <DialogProvider>");
  return fn;
}

/**
 * Substitui `window.prompt` — pede um texto curto (título de marcação) ou, com
 * `multilinha`, um texto de vários parágrafos (nota sobre o trecho).
 */
export function usePrompt(): PromptFn {
  const fn = useContext(PromptContext);
  if (!fn) throw new Error("usePrompt precisa estar dentro de <DialogProvider>");
  return fn;
}

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const d = useT();
  const [estado, setEstado] = useState<EstadoDialogo | null>(null);
  const [texto, setTexto] = useState("");
  const resolverRef = useRef<((v: string | null) => void) | null>(null);

  const abrir = useCallback((opcoes: OpcoesTexto, modo: Modo) => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      setTexto(opcoes.valor ?? "");
      setEstado({ ...opcoes, modo });
    });
  }, []);

  const confirmar = useCallback<ConfirmFn>(
    (opcoes) => abrir(opcoes, "confirmar").then((v) => v !== null),
    [abrir],
  );
  const alertar = useCallback<AlertFn>(
    (opcoes) => abrir(opcoes, "avisar").then(() => undefined),
    [abrir],
  );
  const perguntar = useCallback<PromptFn>(
    (opcoes) => abrir(opcoes, "perguntar"),
    [abrir],
  );

  function responder(v: string | null) {
    setEstado(null);
    resolverRef.current?.(v);
    resolverRef.current = null;
  }

  const ehPergunta = estado?.modo === "perguntar";

  return (
    <ConfirmContext.Provider value={confirmar}>
      <AlertContext.Provider value={alertar}>
        <PromptContext.Provider value={perguntar}>
          {children}

          {estado && (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
              role="alertdialog"
              aria-modal
              aria-labelledby="dialogo-titulo"
            >
              <div
                className="absolute inset-0 bg-black/45"
                onClick={() => responder(null)}
              />
              <form
                className="sobe safe-b relative w-full max-w-sm rounded-t-3xl border-t border-border bg-surface p-6 shadow-2xl sm:rounded-3xl sm:border"
                onSubmit={(e) => {
                  e.preventDefault();
                  responder(ehPergunta ? texto.trim() : "");
                }}
              >
                <p id="dialogo-titulo" className="display text-lg leading-snug">
                  {estado.titulo}
                </p>
                {estado.mensagem && (
                  <p className="mt-2 text-sm leading-relaxed text-muted">
                    {estado.mensagem}
                  </p>
                )}

                {ehPergunta &&
                  (estado.multilinha ? (
                    <textarea
                      autoFocus
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder={estado.placeholder}
                      maxLength={estado.limite ?? 4000}
                      rows={5}
                      // Enter serve pra parágrafo aqui; quem confirma é o botão.
                      className="mt-4 w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-base leading-relaxed outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/12"
                    />
                  ) : (
                    <input
                      autoFocus
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder={estado.placeholder}
                      maxLength={estado.limite ?? 120}
                      className="mt-4 h-12 w-full rounded-xl border border-border bg-background px-4 text-base outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-4 focus:ring-accent/12"
                    />
                  ))}

                <div className="mt-6 flex gap-2">
                  {estado.modo !== "avisar" && (
                    <Botao
                      type="button"
                      variante="contorno"
                      className="flex-1"
                      onClick={() => responder(null)}
                    >
                      {estado.textoCancelar ?? d.common.cancel}
                    </Botao>
                  )}
                  <Botao
                    type="submit"
                    variante={estado.perigo ? "perigo" : "primario"}
                    className="flex-1"
                    autoFocus={!ehPergunta}
                  >
                    {estado.textoConfirmar ?? d.common.ok}
                  </Botao>
                </div>
              </form>
            </div>
          )}
        </PromptContext.Provider>
      </AlertContext.Provider>
    </ConfirmContext.Provider>
  );
}
