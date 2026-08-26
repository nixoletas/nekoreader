"use client";

import { useEffect } from "react";
import { limparRastroAntigo } from "@/lib/offline-db";

export default function SwRegister() {
  useEffect(() => {
    // Roda em qualquer ambiente, e não só em produção: o rastro do nome antigo
    // está no aparelho de quem usou o app antes, não no servidor.
    limparRastroAntigo();

    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const id = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, 1200);
    return () => clearTimeout(id);
  }, []);

  return null;
}
