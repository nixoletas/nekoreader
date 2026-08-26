import AuthShell from "@/components/auth-shell";
import { i18nAtual } from "@/lib/i18n/servidor";
import NewPasswordForm from "./new-password-form";

export default async function NewPasswordPage() {
  const { d } = await i18nAtual();

  return (
    <AuthShell titulo={d.auth.newPassword.title} subtitulo={d.auth.newPassword.subtitle}>
      <NewPasswordForm />
    </AuthShell>
  );
}
