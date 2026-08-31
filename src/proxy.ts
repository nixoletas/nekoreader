import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tudo, menos: arquivos estáticos, imagens do Next e assets do pdf.js.
     *
     * `robots.txt`, `sitemap.xml` e a imagem de OG saem daqui porque quem os
     * pede é robô — buscador, WhatsApp, Twitter. Passar por este guarda daria
     * uma ida ao Supabase por rastreio, pra no fim responder a mesma coisa a
     * quem nunca vai ter sessão.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|opengraph-image|icons/|pdf.worker.min.mjs|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
