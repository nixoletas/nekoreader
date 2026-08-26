import { Suspense } from "react";
import AuthShell from "@/components/auth-shell";
import { i18nAtual } from "@/lib/i18n/servidor";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const { d } = await i18nAtual();

  return (
    <AuthShell
      titulo={d.auth.login.title}
      subtitulo={d.auth.login.subtitle}
      rodape={d.auth.login.footer}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
