import Link from "next/link";
import AuthShell from "@/components/auth-shell";
import EsqueciForm from "./esqueci-form";

export default function EsqueciPage() {
  return (
    <AuthShell
      titulo="Esqueci a senha"
      subtitulo="Mandamos um link pro seu e-mail pra criar uma nova."
      rodape={
        <Link href="/login" className="font-medium text-accent hover:underline">
          ← Voltar para entrar
        </Link>
      }
    >
      <EsqueciForm />
    </AuthShell>
  );
}
