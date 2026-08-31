import type { MetadataRoute } from "next";
import { urlDoSite } from "@/lib/site";

/**
 * As duas páginas que existem pra quem não entrou.
 *
 * O resto do app é a estante de alguém — não há o que listar. Um sitemap curto e
 * verdadeiro vale mais que um comprido cheio de página que devolve login.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();

  return [
    { url: urlDoSite("/"), lastModified: agora, changeFrequency: "monthly", priority: 1 },
    {
      url: urlDoSite("/privacy"),
      lastModified: agora,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
