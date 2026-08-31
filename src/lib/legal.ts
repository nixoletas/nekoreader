import type { Locale } from "@/lib/i18n/config";

/**
 * A política de privacidade, nos seis idiomas.
 *
 * Fica fora dos dicionários de propósito. O `Dicionario` é da interface — rótulo
 * de botão, aviso de erro —, e uma chave nova lá quebra o `tsc` até as seis
 * traduções existirem, que é exatamente o que se quer pra um rótulo. Texto legal
 * é outra coisa: é longo, muda de uma vez só, e enfiá-lo lá dentro faria o
 * navegador baixar dez parágrafos de política junto com a tela de login.
 *
 * O que está escrito aqui tem que ser verdade sobre o código. Se o app passar a
 * guardar outra coisa, esta página muda junto — política que descreve um app que
 * não existe mais é pior que não ter política.
 */

export type SecaoLegal = { titulo: string; paragrafos: string[] };

export type TextoLegal = {
  titulo: string;
  atualizadoEm: string;
  resumo: string;
  secoes: SecaoLegal[];
};

/** Onde falar com quem cuida do app. Sai daqui pra não ficar espalhado. */
export const CONTATO = "nicholetas@gmail.com";

export const PRIVACIDADE: Record<Locale, TextoLegal> = {
  en: {
    titulo: "Privacy",
    atualizadoEm: "Last updated: 31 August 2026",
    resumo:
      "Nekoreader keeps your books and your notes in your own account. No ads, nothing sold to anyone, no tracking around the web. This page says exactly what is kept and where.",
    secoes: [
      {
        titulo: "What is kept",
        paragrafos: [
          "Your email address and your name, as Google gives them when you sign in. There is no password: the app never asks for one, never stores one, and has none to lose.",
          "The files you upload, the passages you highlight, the titles and notes you write on them, the pages you bookmark, and the page you stopped on in each book.",
          "A readable name for each device you read on, worked out from your browser — “Chrome on Windows”, “Safari on iPhone”. It exists so the app can offer to pick up where your other device left off. It is a label for a browser, not an identity.",
        ],
      },
      {
        titulo: "Where it lives",
        paragrafos: [
          "In a Supabase project: the text in a Postgres database, the files in a private bucket. Nothing in that bucket is public — your files are opened through links signed for you that expire on their own.",
          "Every table has row level security tied to your account. Someone else signed into the app cannot read your rows, and neither can a visitor who is not signed in at all.",
        ],
      },
      {
        titulo: "What stays on your device",
        paragrafos: [
          "Books you make available offline, a copy of your highlights, and the text of the book used for searching are kept in your browser's own storage — along with the queue of changes that lets you read and mark things without a connection.",
          "Signing out erases all of it from that browser.",
        ],
      },
      {
        titulo: "Who else is involved",
        paragrafos: [
          "Supabase stores the data and handles signing in. Vercel serves the app and, like any web server, sees the requests that reach it.",
          "Signing in goes through Google, which tells the app your email address and your name — nothing else, and nothing is sent back to Google.",
          "Reading a scanned page uses OCR that runs on your own device. The first time, your browser downloads the language data from a public tesseract server. The page itself never leaves your device; only the dictionary comes in.",
        ],
      },
      {
        titulo: "Cookies",
        paragrafos: [
          "Two, and neither one follows you: the session cookie that keeps you signed in, and neko_lang, which remembers the language you picked. There is no analytics cookie and no advertising cookie.",
        ],
      },
      {
        titulo: "What is not done",
        paragrafos: [
          "Your files are not read by a person, not analysed, and not used to train anything. Nothing is sold or handed to a data broker. There are no ads and no third-party tracking scripts.",
        ],
      },
      {
        titulo: "Deleting",
        paragrafos: [
          "Deleting a book deletes the file and everything attached to it — highlights, notes, bookmarks, position. It happens immediately and cannot be undone.",
          `To delete the whole account, write to ${CONTATO} and it is done, files included.`,
        ],
      },
      {
        titulo: "Changes",
        paragrafos: [
          "If this page changes in a way that matters, the date at the top changes with it.",
          `Questions: ${CONTATO}`,
        ],
      },
    ],
  },

  "pt-BR": {
    titulo: "Privacidade",
    atualizadoEm: "Atualizada em 31 de agosto de 2026",
    resumo:
      "O Nekoreader guarda os seus livros e as suas anotações na sua conta. Sem propaganda, sem vender nada pra ninguém, sem seguir você pela internet. Esta página diz exatamente o que fica guardado e onde.",
    secoes: [
      {
        titulo: "O que fica guardado",
        paragrafos: [
          "Seu e-mail e seu nome, como o Google os entrega quando você entra. Não existe senha: o app não pede, não guarda e não tem o que vazar.",
          "Os arquivos que você envia, os trechos que você marca, os títulos e as notas que você escreve neles, as páginas que você guarda e a página em que você parou em cada livro.",
          "Um nome legível pra cada aparelho em que você lê, deduzido do navegador — “Chrome no Windows”, “Safari no iPhone”. Ele existe pra o app poder oferecer continuar de onde o outro aparelho parou. É um rótulo de navegador, não uma identidade.",
        ],
      },
      {
        titulo: "Onde isso fica",
        paragrafos: [
          "Num projeto do Supabase: o texto num banco Postgres, os arquivos num balde privado. Nada nesse balde é público — seus arquivos são abertos por links assinados pra você, que vencem sozinhos.",
          "Toda tabela tem segurança por linha amarrada à sua conta. Outra pessoa logada no app não consegue ler as suas linhas, e quem não entrou também não.",
        ],
      },
      {
        titulo: "O que fica no seu aparelho",
        paragrafos: [
          "Os livros que você deixa disponíveis offline, uma cópia das suas marcações e o texto do livro usado pela busca ficam no armazenamento do próprio navegador — junto com a fila de alterações que permite ler e marcar sem conexão.",
          "Sair da conta apaga tudo isso daquele navegador.",
        ],
      },
      {
        titulo: "Quem mais entra nisso",
        paragrafos: [
          "O Supabase guarda os dados e cuida da entrada. A Vercel serve o app e, como qualquer servidor, vê os pedidos que chegam nele.",
          "A entrada passa pelo Google, que conta pro app o seu e-mail e o seu nome — mais nada, e nada volta pro Google.",
          "Ler uma página digitalizada usa OCR que roda no seu próprio aparelho. Na primeira vez, o navegador baixa o dicionário do idioma de um servidor público do tesseract. A página em si nunca sai do seu aparelho; só o dicionário entra.",
        ],
      },
      {
        titulo: "Cookies",
        paragrafos: [
          "Dois, e nenhum dos dois segue você: o cookie de sessão, que mantém você logado, e o neko_lang, que lembra o idioma que você escolheu. Não há cookie de medição nem de propaganda.",
        ],
      },
      {
        titulo: "O que não é feito",
        paragrafos: [
          "Seus arquivos não são lidos por ninguém, não são analisados e não são usados pra treinar nada. Nada é vendido nem entregue a corretor de dados. Não há propaganda nem script de rastreio de terceiro.",
        ],
      },
      {
        titulo: "Apagar",
        paragrafos: [
          "Apagar um livro apaga o arquivo e tudo que está preso nele — marcações, notas, páginas guardadas, posição. É na hora e não dá pra desfazer.",
          `Pra apagar a conta inteira, escreva pra ${CONTATO} e ela é apagada, arquivos junto.`,
        ],
      },
      {
        titulo: "Mudanças",
        paragrafos: [
          "Se esta página mudar em algo que importe, a data lá em cima muda junto.",
          `Dúvidas: ${CONTATO}`,
        ],
      },
    ],
  },




};
