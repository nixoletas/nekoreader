"use client";

/**
 * Identidade do aparelho, pro leitor saber de onde veio cada posição de leitura.
 *
 * O id é sorteado aqui e mora no `localStorage`: não vem de impressão digital do
 * navegador (que erra e incomoda), não identifica a pessoa, e some junto com os
 * dados do site. Limpar o navegador vira "outro aparelho" — o preço é a pessoa
 * ver o nome duas vezes na lista, nada além disso.
 *
 * O nome é só pra frase "continuar do Chrome no Windows?" — precisa ser
 * reconhecível por quem lê, não exato.
 */

const CHAVE_ID = "marginalia:dispositivo";
const CHAVE_NOME = "marginalia:dispositivo-nome";

/** Id deste aparelho, criado na primeira vez e guardado depois. */
export function idDoDispositivo(): string {
  if (typeof localStorage === "undefined") return "desconhecido";
  try {
    const salvo = localStorage.getItem(CHAVE_ID);
    if (salvo) return salvo;
    const novo = crypto.randomUUID();
    localStorage.setItem(CHAVE_ID, novo);
    return novo;
  } catch {
    // navegador em modo restrito: sem id estável, mas a leitura continua
    return "desconhecido";
  }
}

/**
 * Nome legível deste aparelho — o que a pessoa deu, ou o deduzido do navegador.
 */
export function nomeDoDispositivo(): string {
  if (typeof localStorage !== "undefined") {
    try {
      const escolhido = localStorage.getItem(CHAVE_NOME);
      if (escolhido) return escolhido;
    } catch {
      // segue com o nome deduzido
    }
  }
  return nomeDeduzido();
}

/** Deixa a pessoa renomear o aparelho ("iPhone da Ana"). */
export function definirNomeDoDispositivo(nome: string): void {
  try {
    const limpo = nome.trim().slice(0, 40);
    if (limpo) localStorage.setItem(CHAVE_NOME, limpo);
    else localStorage.removeItem(CHAVE_NOME);
  } catch {
    // sem onde guardar: fica o nome deduzido
  }
}

/**
 * "Chrome no Windows", "Safari no iPhone" — aparelho primeiro quando ele é o que
 * a pessoa reconhece (celular/tablet), navegador quando é computador.
 */
function nomeDeduzido(): string {
  if (typeof navigator === "undefined") return "Aparelho";
  const ua = navigator.userAgent;

  const aparelho =
    /iPhone/i.test(ua) ? "iPhone"
    : /iPad/i.test(ua) ? "iPad"
    : /Android/i.test(ua) ? (/Mobile/i.test(ua) ? "Android" : "tablet Android")
    : /Windows/i.test(ua) ? "Windows"
    : /Macintosh|Mac OS X/i.test(ua) ? "Mac"
    : /CrOS/i.test(ua) ? "Chromebook"
    : /Linux/i.test(ua) ? "Linux"
    : null;

  // A ordem importa: todo navegador no Chromium se anuncia como "Chrome", e o
  // Edge/Opera se anunciam como Chrome **e** como si mesmos.
  const navegador =
    /Edg\//i.test(ua) ? "Edge"
    : /OPR\/|Opera/i.test(ua) ? "Opera"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /SamsungBrowser/i.test(ua) ? "Samsung Internet"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari"
    : null;

  if (!aparelho) return navegador ?? "Aparelho";
  if (!navegador) return aparelho;
  return `${navegador} no ${aparelho}`;
}
