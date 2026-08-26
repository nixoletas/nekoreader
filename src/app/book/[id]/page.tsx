import Reader from "@/components/reader";

// Sem parâmetro nenhum pra prerenderizar em build (sem env/sessão disponíveis ali) —
// o Reader busca o livro no cliente, então isso só evita um build-time inútil.
export const dynamic = "force-dynamic";

export default function LivroPage() {
  return <Reader />;
}
