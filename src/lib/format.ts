export function formatarTamanho(bytes: number | null) {
  if (!bytes) return "";
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * "agora mesmo", "há 3 h", "há 2 dias" — o suficiente pra decidir se vale pular
 * pra posição de outro aparelho. Data cheia só quando já faz mais de uma semana.
 */
export function haQuantoTempo(iso: string | null | undefined): string {
  if (!iso) return "";
  const quando = new Date(iso).getTime();
  if (!Number.isFinite(quando)) return "";
  const minutos = Math.max(0, Math.round((Date.now() - quando) / 60000));
  if (minutos < 2) return "agora mesmo";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias <= 7) return `há ${dias} dia${dias > 1 ? "s" : ""}`;
  return new Date(quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
