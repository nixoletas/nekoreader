"use client";

import { useEffect } from "react";

/**
 * O erro que derrubou o próprio layout raiz.
 *
 * Este componente **substitui** o layout — precisa trazer o `<html>` e o `<body>`
 * por conta própria, e por isso não existe nem provider de idioma nem CSS de
 * tema garantido aqui. O texto fica em inglês, que é o mesmo fallback que o resto
 * do app usa quando não dá pra saber o idioma, e o estilo vai embutido.
 *
 * É a última rede: se ele aparecer, alguma coisa quebrou antes do app começar.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1rem",
          background: "#faf7f2",
          color: "#1c1917",
          font: "16px/1.5 system-ui, -apple-system, Segoe UI, sans-serif",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "26rem" }}>
          <h1 style={{ fontSize: "1.5rem", margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 1.5rem", color: "#57534e" }}>
            Nekoreader couldn&apos;t start this screen. Trying again usually sorts it out.
          </p>
          <button
            onClick={reset}
            style={{
              minHeight: "3rem",
              padding: "0 1.5rem",
              borderRadius: "0.75rem",
              border: "none",
              background: "#9a3412",
              color: "#fff",
              font: "600 15px system-ui, -apple-system, Segoe UI, sans-serif",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
