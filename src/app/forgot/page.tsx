import Link from "next/link";
import AuthShell from "@/components/auth-shell";
import { i18nAtual } from "@/lib/i18n/servidor";
import ForgotForm from "./forgot-form";

export default async function ForgotPage() {
  const { d } = await i18nAtual();

  return (
    <AuthShell
      titulo={d.auth.forgot.title}
      subtitulo={d.auth.forgot.subtitle}
      rodape={
        <Link href="/login" className="font-medium text-accent hover:underline">
          {d.auth.forgot.back}
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
