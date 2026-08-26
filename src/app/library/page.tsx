import Estante from "@/components/estante";

// Sem parâmetro nenhum pra prerenderizar em build (sem env/sessão disponíveis ali) —
// os dados são todos buscados no cliente, então isso só evita um build-time inútil.
export const dynamic = "force-dynamic";

export default function BibliotecaPage() {
  return <Estante />;
}
