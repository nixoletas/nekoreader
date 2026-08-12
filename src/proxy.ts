import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tudo, menos: arquivos estáticos, imagens do Next e assets do pdf.js.
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons/|pdf.worker.min.mjs|pdfjs/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
