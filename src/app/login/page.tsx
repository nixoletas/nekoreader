import { Suspense } from "react";
import AuthShell from "@/components/auth-shell";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <AuthShell
      titulo="Sua estante"
      subtitulo="Entre para continuar de onde parou."
      rodape={
        <>
          Seus livros e marcações ficam salvos na sua conta — em qualquer
          aparelho.
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
