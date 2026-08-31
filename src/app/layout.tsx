import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import SwRegister from "@/components/sw-register";
import { SCRIPT_TEMA } from "@/lib/tema";
import { DialogProvider } from "@/components/dialog-provider";
import { I18nProvider } from "@/lib/i18n/cliente";
import { i18nAtual } from "@/lib/i18n/servidor";
import { siteUrl } from "@/lib/site";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { locale, d } = await i18nAtual();

  return {
    // Sem isto, `og:image` sai com caminho relativo — e caminho relativo num
    // card de rede social é imagem que não carrega em lugar nenhum.
    metadataBase: new URL(siteUrl()),
    title: d.landing.metaTitle,
    description: d.landing.metaDescription,
    manifest: "/manifest.webmanifest",
    // A imagem vem do `opengraph-image.tsx`, que o Next encaixa sozinho aqui.
    openGraph: {
      type: "website",
      siteName: d.brand.name,
      title: d.landing.metaTitle,
      description: d.landing.metaDescription,
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title: d.landing.metaTitle,
      description: d.landing.metaDescription,
    },
    icons: {
      // O SVG é o que a aba do navegador usa quando sabe: fica nítido em
      // qualquer densidade, e é o mesmo desenho do ícone instalado.
      icon: [
        { url: "/logo.svg", type: "image/svg+xml" },
        { url: "/icons/192", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/icons/180", sizes: "180x180", type: "image/png" }],
    },
    applicationName: d.brand.name,
    appleWebApp: {
      capable: true,
      title: d.brand.name,
      statusBarStyle: "default",
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Sem `themeColor` aqui de propósito: quem cria e mantém essa meta é o script
  // do tema, que sabe da escolha manual. Duas metas brigariam entre si.
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // O idioma sai do cookie (escolha) ou do `Accept-Language` (palpite), aqui em
  // cima, uma vez por pedido — todo o resto do app o recebe pronto.
  const { locale, d } = await i18nAtual();

  return (
    <html lang={locale} className={display.variable}>
      <head>
        {/* Antes da primeira pintura, pra página não nascer clara e piscar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="antialiased">
        <I18nProvider locale={locale} dicionario={d}>
          <DialogProvider>{children}</DialogProvider>
        </I18nProvider>
        <SwRegister />
      </body>
    </html>
  );
}
