"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Botao } from "@/components/ui";

type Opcoes = {
  titulo: string;
  mensagem?: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Ação destrutiva (excluir, remover) — botão de confirmar fica vermelho. */
  perigo?: boolean;
};

type EstadoDialogo = Opcoes & { somenteOk: boolean };

type ConfirmFn = (opcoes: Opcoes) => Promise<boolean>;
type AlertFn = (opcoes: Opcoes) => Promise<void>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const AlertContext = createContext<AlertFn | null>(null);

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

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<EstadoDialogo | null>(null);
  const resolverRef = useRef<((v: boolean) => void) | null>(null);

  const abrir = useCallback((opcoes: Opcoes, somenteOk: boolean) => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setEstado({ ...opcoes, somenteOk });
    });
  }, []);

  const confirmar = useCallback<ConfirmFn>((opcoes) => abrir(opcoes, false), [abrir]);
  const alertar = useCallback<AlertFn>(
    (opcoes) => abrir(opcoes, true).then(() => undefined),
    [abrir],
  );

  function responder(v: boolean) {
    setEstado(null);
    resolverRef.current?.(v);
    resolverRef.current = null;
  }

  return (
    <ConfirmContext.Provider value={confirmar}>
      <AlertContext.Provider value={alertar}>
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
              onClick={() => responder(false)}
            />
            <div className="sobe safe-b relative w-full max-w-sm rounded-t-3xl border-t border-border bg-surface p-6 shadow-2xl sm:rounded-3xl sm:border">
              <p id="dialogo-titulo" className="display text-lg leading-snug">
                {estado.titulo}
              </p>
              {estado.mensagem && (
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {estado.mensagem}
                </p>
              )}

              <div className="mt-6 flex gap-2">
                {!estado.somenteOk && (
                  <Botao
                    variante="contorno"
                    className="flex-1"
                    onClick={() => responder(false)}
                  >
                    {estado.textoCancelar ?? "Cancelar"}
                  </Botao>
                )}
                <Botao
                  variante={estado.perigo ? "perigo" : "primario"}
                  className="flex-1"
                  autoFocus
                  onClick={() => responder(true)}
                >
                  {estado.textoConfirmar ?? "OK"}
                </Botao>
              </div>
            </div>
          </div>
        )}
      </AlertContext.Provider>
    </ConfirmContext.Provider>
  );
}
