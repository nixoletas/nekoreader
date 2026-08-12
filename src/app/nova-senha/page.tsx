import AuthShell from "@/components/auth-shell";
import NovaSenhaForm from "./nova-senha-form";

export default function NovaSenhaPage() {
  return (
    <AuthShell
      titulo="Nova senha"
      subtitulo="Escolha uma senha e confirme para não errar."
    >
      <NovaSenhaForm />
    </AuthShell>
  );
}
