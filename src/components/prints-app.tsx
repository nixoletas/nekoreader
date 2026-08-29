import Image from "next/image";

/**
 * As telas do app na landing — o leitor e a estante, no computador e no celular.
 *
 * Print de verdade, não maquete. Uma moldura de navegador desenhada em volta
 * ficaria mais bonita e diria menos: a captura do Android já vem com a barra de
 * status e a proporção do aparelho, que é o que faz a pessoa reconhecer aquilo
 * como uma tela e não como um desenho de propaganda.
 *
 * As duas juntas, sempre, e **lado a lado**. A primeira versão punha o celular
 * por cima da tela do computador, e ele acabava tapando justamente o painel de
 * notas que a imagem existia pra mostrar — sobreposição bonita que esconde o
 * argumento. Encostados, cada um mostra o que tem.
 *
 * As larguras (76% / 16%) não são estéticas: nessas proporções as duas imagens
 * terminam com quase a mesma altura, apesar de uma ser deitada e a outra em pé.
 * Sem isso o celular fica mais alto que o computador e vira o assunto da
 * composição, que é o contrário do que ela quer dizer.
 */

const FOLHA =
  "rounded-xl border border-black/10 bg-surface shadow-[0_2px_8px_rgba(60,45,25,0.10),0_28px_60px_-28px_rgba(60,45,25,0.55)] dark:border-white/10 sm:rounded-2xl";

const APARELHO =
  "rounded-[12px] border border-black/10 shadow-[0_4px_10px_rgba(60,45,25,0.18),0_22px_44px_-18px_rgba(60,45,25,0.65)] dark:border-white/10 sm:rounded-[16px]";

/** Computador e celular encostados, alinhados pela base. */
function Duo({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-7 sm:flex-row sm:items-end sm:justify-center sm:gap-5 lg:gap-7">
      {children}
    </div>
  );
}

/**
 * A vitrine de cima: o leitor aberto, com o mesmo livro no celular ao lado.
 *
 * Fica logo abaixo do título centralizado e é a primeira coisa que a pessoa vê
 * depois de ler a promessa — então é grande de propósito. É a prova.
 */
export function VitrineLeitor({
  altWeb,
  altCelular,
}: {
  altWeb: string;
  altCelular: string;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Duo>
        <Image
          src="/print-web.png"
          alt={altWeb}
          width={1902}
          height={906}
          // Candidata a maior elemento da primeira tela: carrega já, sem esperar
          // o navegador decidir. (`priority` saiu no Next 16.)
          loading="eager"
          fetchPriority="high"
          sizes="(min-width: 1280px) 900px, 92vw"
          className={`w-full sm:w-[76%] ${FOLHA}`}
        />
        <Image
          src="/print-android.jpg"
          alt={altCelular}
          width={1080}
          height={2340}
          loading="eager"
          sizes="(min-width: 1280px) 190px, 40vw"
          className={`w-[44%] max-w-[190px] sm:w-[16%] sm:max-w-none ${APARELHO}`}
        />
      </Duo>
    </div>
  );
}

/**
 * A vitrine de baixo: a estante cheia, que é o que o leitor sozinho não mostra.
 *
 * As duas capturas entram **cortadas a partir do topo**. O cabeçalho do app traz
 * o e-mail de quem estava logado quando a tela foi tirada, e numa página pública
 * isso é endereço pessoal exposto a qualquer visitante e a qualquer robô de
 * varredura. O corte resolve sem mexer no arquivo — e de quebra o recorte fica
 * melhor, porque a barra de cima nunca foi a parte interessante da estante.
 *
 * Feito com `object-cover` numa moldura mais baixa que a imagem: ancorando o
 * conteúdo embaixo, o que sobra pra fora é justamente a faixa de cima.
 */
export function VitrineEstante({
  altWeb,
  altCelular,
}: {
  altWeb: string;
  altCelular: string;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Duo>
        <div
          className={`relative aspect-[1889/770] w-full overflow-hidden sm:w-[76%] ${FOLHA}`}
        >
          <Image
            src="/eg-web-1.png"
            alt={altWeb}
            fill
            sizes="(min-width: 1280px) 900px, 92vw"
            className="object-cover object-bottom"
          />
        </div>

        <div
          className={`relative aspect-[1080/1920] w-[44%] max-w-[190px] overflow-hidden sm:w-[16%] sm:max-w-none ${APARELHO}`}
        >
          <Image
            src="/eg-android-1.jpg"
            alt={altCelular}
            fill
            sizes="(min-width: 1280px) 190px, 40vw"
            className="object-cover object-bottom"
          />
        </div>
      </Duo>
    </div>
  );
}
