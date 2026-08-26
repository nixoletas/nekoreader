import type { MetadataRoute } from "next";
import { i18nAtual } from "@/lib/i18n/servidor";

/**
 * O manifest do PWA, no idioma do pedido.
 *
 * Ele é buscado pelo navegador com os mesmos cabeçalhos da página, então o
 * cookie de idioma vale aqui também: quem instalou o app em italiano vê o nome
 * e a descrição em italiano na tela inicial.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { locale, d } = await i18nAtual();

  return {
    name: d.landing.metaTitle,
    short_name: d.brand.name,
    description: d.brand.tagline,
    lang: locale,
    start_url: "/library",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f4eee2",
    theme_color: "#f4eee2",
    categories: ["books", "education", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png" },
      { src: "/icons/512", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
