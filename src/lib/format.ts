import type { Locale } from "@/lib/i18n/config";
import type { Dicionario } from "@/lib/i18n/dicionarios";
import { plural } from "@/lib/i18n/formato";

/** "12,4 MB" / "12.4 MB" — a vírgula decimal segue o idioma, a unidade não. */
export function formatarTamanho(bytes: number | null, locale: Locale): string {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(mb)} MB`;
  }
  return `${new Intl.NumberFormat(locale).format(Math.round(bytes / 1024))} KB`;
}

/**
 * "agora mesmo", "há 3 h", "há 2 dias" — o suficiente pra decidir se vale pular
 * pra posição de outro aparelho. Data cheia só quando já faz mais de uma semana.
 *
 * Passada uma semana quem formata é o `Intl`, que sabe a ordem de dia e mês e o
 * nome abreviado do mês em cada idioma; até lá, as frases vêm do dicionário,
 * porque "há 2 dias" não é uma data — é uma frase.
 */
export function haQuantoTempo(
  iso: string | null | undefined,
  d: Dicionario,
  locale: Locale,
): string {
  if (!iso) return "";
  const quando = new Date(iso).getTime();
  if (!Number.isFinite(quando)) return "";

  const minutos = Math.max(0, Math.round((Date.now() - quando) / 60000));
  if (minutos < 2) return d.time.justNow;
  if (minutos < 60) return plural(locale, minutos, d.time.minutes);

  const horas = Math.round(minutos / 60);
  if (horas < 24) return plural(locale, horas, d.time.hours);

  const dias = Math.round(horas / 24);
  if (dias <= 7) return plural(locale, dias, d.time.days);

  return new Date(quando).toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
  });
}
