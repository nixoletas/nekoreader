import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import SwRegister from "@/components/sw-register";
import { DialogProvider } from "@/components/dialog-provider";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Marginália — leitor de PDF",
  description:
    "Leia PDFs, marque trechos, guarde páginas e volte sempre de onde parou.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/192", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/180", sizes: "180x180", type: "image/png" }],
  },
  applicationName: "Marginália",
  appleWebApp: {
    capable: true,
    title: "Marginália",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4eee2" },
    { media: "(prefers-color-scheme: dark)", color: "#15120e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={display.variable}>
      <body className="antialiased">
        <DialogProvider>{children}</DialogProvider>
        <SwRegister />
      </body>
    </html>
  );
}
