import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Rotas que existem antes da conta.
 *
 * `/` é a landing: quem chega pelo endereço do site precisa ver a propaganda,
 * não um formulário de senha. `/new-password` fica **fora** desta lista de
 * propósito — quem chega lá vem do link do e-mail, e o `/auth/callback` já
 * trocou o código por uma sessão antes de mandar pra tela.
 *
 * `/privacy` precisa ser pública por dois motivos práticos: é preciso poder ler
 * a política **antes** de criar a conta, e a tela de consentimento do Google
 * exige um endereço que qualquer um abra. Mandá-la pro login seria mandar pro
 * login exatamente quem ainda não tem conta.
 */
const PUBLIC_PATHS = [
  "/login",
  "/forgot",
  "/auth",
  "/icons",
  "/manifest",
  "/privacy",
];

/** Onde a leitura de verdade começa, depois que a pessoa entra. */
const DEPOIS_DE_ENTRAR = "/library";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: não colocar código entre createServerClient e getUser().
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    // Sem rede/Supabase fora do ar: trata como deslogado em vez de 500.
  }

  const { pathname } = request.nextUrl;
  const ehLanding = pathname === "/";
  const isPublic = ehLanding || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Quem já tem conta não precisa da propaganda nem do formulário: a landing e
  // o login viram um atalho pra estante.
  if (user && (ehLanding || pathname === "/login")) {
    const url = request.nextUrl.clone();
    url.pathname = DEPOIS_DE_ENTRAR;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
