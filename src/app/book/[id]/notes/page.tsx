import MarcacoesBlog from "@/components/marcacoes-blog";

// Sem parâmetro nenhum pra prerenderizar em build (sem env/sessão disponíveis ali) —
// os dados são todos buscados no cliente.
export const dynamic = "force-dynamic";

export default function MarcacoesPage() {
  return <MarcacoesBlog />;
}
