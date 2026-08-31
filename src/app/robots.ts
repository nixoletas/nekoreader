import type { MetadataRoute } from "next";
import { urlDoSite } from "@/lib/site";

/**
 * O que buscador pode visitar.
 *
 * Só a landing e a privacidade são públicas. Todo o resto é sessão de alguém —
 * `/library` e `/book/...` exigem login e devolveriam um redirecionamento pro
 * buscador, e `/auth/...` carrega código de troca de sessão na URL. Nada disso
 * tem por que ser rastreado, nem aparecer numa busca.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy"],
      disallow: ["/library", "/book/", "/auth/", "/login"],
    },
    sitemap: urlDoSite("/sitemap.xml"),
  };
}
