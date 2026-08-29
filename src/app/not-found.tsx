import Link from "next/link";
import { Botao } from "@/components/ui";
import TelaRecado from "@/components/tela-recado";
import { i18nAtual } from "@/lib/i18n/servidor";

/** Rota que não existe — link velho, endereço digitado errado, livro apagado. */
export default async function NaoEncontrado() {
  const { d } = await i18nAtual();

  return (
    <TelaRecado
      marca={d.brand.name}
      titulo={d.errors.notFoundTitle}
      corpo={d.errors.notFoundBody}
      acoes={
        <>
          <Link href="/library">
            <Botao type="button">{d.errors.toShelf}</Botao>
          </Link>
          <Link href="/">
            <Botao variante="contorno" type="button">
              {d.errors.home}
            </Botao>
          </Link>
        </>
      }
    />
  );
}
