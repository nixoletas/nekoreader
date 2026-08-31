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
          "Your email address and your password, both handled by Supabase Auth. The password is never stored in a readable form, and the app itself never sees it.",
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
          "If you sign in with Google, Google tells the app your email address and your name — nothing else, and nothing is sent back to Google.",
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
          "Seu e-mail e sua senha, os dois cuidados pelo Supabase Auth. A senha nunca é guardada de forma legível, e o app em si nunca a enxerga.",
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
          "Se você entrar com o Google, o Google conta pro app o seu e-mail e o seu nome — mais nada, e nada volta pro Google.",
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

  es: {
    titulo: "Privacidad",
    atualizadoEm: "Actualizada el 31 de agosto de 2026",
    resumo:
      "Nekoreader guarda tus libros y tus notas en tu propia cuenta. Sin publicidad, sin vender nada a nadie, sin seguirte por internet. Esta página dice exactamente qué se guarda y dónde.",
    secoes: [
      {
        titulo: "Qué se guarda",
        paragrafos: [
          "Tu correo y tu contraseña, ambos a cargo de Supabase Auth. La contraseña nunca se guarda de forma legible, y la propia app nunca la ve.",
          "Los archivos que subes, los pasajes que marcas, los títulos y las notas que escribes en ellos, las páginas que guardas y la página en la que te quedaste en cada libro.",
          "Un nombre legible para cada dispositivo en el que lees, deducido del navegador: “Chrome en Windows”, “Safari en iPhone”. Existe para que la app pueda ofrecerte seguir donde lo dejó el otro dispositivo. Es una etiqueta de navegador, no una identidad.",
        ],
      },
      {
        titulo: "Dónde vive",
        paragrafos: [
          "En un proyecto de Supabase: el texto en una base Postgres, los archivos en un bucket privado. Nada de ese bucket es público: tus archivos se abren con enlaces firmados para ti que caducan solos.",
          "Cada tabla tiene seguridad por fila atada a tu cuenta. Otra persona con sesión en la app no puede leer tus filas, y quien no ha entrado, tampoco.",
        ],
      },
      {
        titulo: "Qué se queda en tu dispositivo",
        paragrafos: [
          "Los libros que dejas disponibles sin conexión, una copia de tus marcas y el texto del libro que usa la búsqueda se quedan en el almacenamiento del propio navegador, junto con la cola de cambios que te deja leer y marcar sin conexión.",
          "Cerrar sesión borra todo eso de ese navegador.",
        ],
      },
      {
        titulo: "Quién más participa",
        paragrafos: [
          "Supabase guarda los datos y gestiona el inicio de sesión. Vercel sirve la app y, como cualquier servidor, ve las peticiones que le llegan.",
          "Si entras con Google, Google le dice a la app tu correo y tu nombre; nada más, y nada vuelve a Google.",
          "Leer una página escaneada usa OCR que corre en tu propio dispositivo. La primera vez, el navegador descarga los datos del idioma de un servidor público de tesseract. La página nunca sale de tu dispositivo; solo entra el diccionario.",
        ],
      },
      {
        titulo: "Cookies",
        paragrafos: [
          "Dos, y ninguna te sigue: la cookie de sesión, que te mantiene dentro, y neko_lang, que recuerda el idioma que elegiste. No hay cookie de analítica ni de publicidad.",
        ],
      },
      {
        titulo: "Qué no se hace",
        paragrafos: [
          "Tus archivos no los lee nadie, no se analizan y no se usan para entrenar nada. No se vende nada ni se entrega a ningún intermediario de datos. No hay publicidad ni scripts de rastreo de terceros.",
        ],
      },
      {
        titulo: "Borrar",
        paragrafos: [
          "Borrar un libro borra el archivo y todo lo que cuelga de él: marcas, notas, páginas guardadas, posición. Es inmediato y no se puede deshacer.",
          `Para borrar la cuenta entera, escribe a ${CONTATO} y se borra, con archivos incluidos.`,
        ],
      },
      {
        titulo: "Cambios",
        paragrafos: [
          "Si esta página cambia en algo que importe, la fecha de arriba cambia con ella.",
          `Dudas: ${CONTATO}`,
        ],
      },
    ],
  },

  fr: {
    titulo: "Confidentialité",
    atualizadoEm: "Mise à jour le 31 août 2026",
    resumo:
      "Nekoreader garde vos livres et vos notes dans votre propre compte. Pas de publicité, rien de vendu à personne, aucun suivi sur le web. Cette page dit exactement ce qui est conservé, et où.",
    secoes: [
      {
        titulo: "Ce qui est conservé",
        paragrafos: [
          "Votre adresse e-mail et votre mot de passe, tous deux gérés par Supabase Auth. Le mot de passe n'est jamais conservé sous une forme lisible, et l'application elle-même ne le voit jamais.",
          "Les fichiers que vous envoyez, les passages que vous surlignez, les titres et les notes que vous y écrivez, les pages que vous marquez et la page où vous vous êtes arrêté dans chaque livre.",
          "Un nom lisible pour chaque appareil sur lequel vous lisez, déduit de votre navigateur : « Chrome sur Windows », « Safari sur iPhone ». Il existe pour que l'application puisse vous proposer de reprendre où l'autre appareil s'est arrêté. C'est une étiquette de navigateur, pas une identité.",
        ],
      },
      {
        titulo: "Où cela réside",
        paragrafos: [
          "Dans un projet Supabase : le texte dans une base Postgres, les fichiers dans un bucket privé. Rien n'y est public — vos fichiers s'ouvrent par des liens signés pour vous, qui expirent d'eux-mêmes.",
          "Chaque table applique une sécurité par ligne liée à votre compte. Une autre personne connectée à l'application ne peut pas lire vos lignes, et un visiteur non connecté non plus.",
        ],
      },
      {
        titulo: "Ce qui reste sur votre appareil",
        paragrafos: [
          "Les livres que vous rendez disponibles hors ligne, une copie de vos surlignages et le texte du livre utilisé par la recherche restent dans le stockage de votre navigateur, avec la file d'attente des changements qui vous permet de lire et d'annoter sans connexion.",
          "Se déconnecter efface tout cela de ce navigateur.",
        ],
      },
      {
        titulo: "Qui d'autre intervient",
        paragrafos: [
          "Supabase conserve les données et gère la connexion. Vercel sert l'application et, comme tout serveur web, voit les requêtes qui lui parviennent.",
          "Si vous vous connectez avec Google, Google communique à l'application votre adresse e-mail et votre nom — rien de plus, et rien ne repart vers Google.",
          "Lire une page numérisée utilise un OCR qui tourne sur votre propre appareil. La première fois, votre navigateur télécharge les données de langue depuis un serveur public de tesseract. La page, elle, ne quitte jamais votre appareil ; seul le dictionnaire entre.",
        ],
      },
      {
        titulo: "Cookies",
        paragrafos: [
          "Deux, et aucun ne vous suit : le cookie de session, qui vous garde connecté, et neko_lang, qui retient la langue choisie. Aucun cookie de mesure d'audience, aucun cookie publicitaire.",
        ],
      },
      {
        titulo: "Ce qui n'est pas fait",
        paragrafos: [
          "Vos fichiers ne sont lus par personne, ne sont pas analysés et ne servent à entraîner quoi que ce soit. Rien n'est vendu ni transmis à un courtier en données. Aucune publicité, aucun script de pistage tiers.",
        ],
      },
      {
        titulo: "Supprimer",
        paragrafos: [
          "Supprimer un livre supprime le fichier et tout ce qui y est rattaché : surlignages, notes, marque-pages, position. C'est immédiat et irréversible.",
          `Pour supprimer le compte entier, écrivez à ${CONTATO} et il est supprimé, fichiers compris.`,
        ],
      },
      {
        titulo: "Changements",
        paragrafos: [
          "Si cette page change sur un point qui compte, la date en haut change avec elle.",
          `Questions : ${CONTATO}`,
        ],
      },
    ],
  },

  de: {
    titulo: "Datenschutz",
    atualizadoEm: "Zuletzt geändert am 31. August 2026",
    resumo:
      "Nekoreader bewahrt deine Bücher und deine Notizen in deinem eigenen Konto auf. Keine Werbung, nichts wird verkauft, kein Verfolgen durchs Netz. Diese Seite sagt genau, was gespeichert wird und wo.",
    secoes: [
      {
        titulo: "Was gespeichert wird",
        paragrafos: [
          "Deine E-Mail-Adresse und dein Passwort, beides von Supabase Auth verwaltet. Das Passwort wird nie in lesbarer Form gespeichert, und die App selbst bekommt es nie zu sehen.",
          "Die Dateien, die du hochlädst, die Stellen, die du markierst, die Titel und Notizen, die du dazu schreibst, die Seiten, die du dir merkst, und die Seite, auf der du in jedem Buch stehen geblieben bist.",
          "Ein lesbarer Name für jedes Gerät, auf dem du liest, aus dem Browser abgeleitet: „Chrome unter Windows“, „Safari auf dem iPhone“. Er existiert, damit die App anbieten kann, dort weiterzulesen, wo das andere Gerät aufgehört hat. Er ist ein Etikett für einen Browser, keine Identität.",
        ],
      },
      {
        titulo: "Wo es liegt",
        paragrafos: [
          "In einem Supabase-Projekt: der Text in einer Postgres-Datenbank, die Dateien in einem privaten Bucket. Nichts darin ist öffentlich — deine Dateien werden über Links geöffnet, die für dich signiert sind und von selbst ablaufen.",
          "Jede Tabelle hat eine an dein Konto gebundene Zeilensicherheit. Eine andere angemeldete Person kann deine Zeilen nicht lesen, und wer gar nicht angemeldet ist, erst recht nicht.",
        ],
      },
      {
        titulo: "Was auf deinem Gerät bleibt",
        paragrafos: [
          "Bücher, die du offline verfügbar machst, eine Kopie deiner Markierungen und der Text des Buches für die Suche bleiben im Speicher deines Browsers — zusammen mit der Warteschlange von Änderungen, mit der du ohne Verbindung lesen und markieren kannst.",
          "Beim Abmelden wird all das aus diesem Browser gelöscht.",
        ],
      },
      {
        titulo: "Wer sonst beteiligt ist",
        paragrafos: [
          "Supabase speichert die Daten und übernimmt die Anmeldung. Vercel liefert die App aus und sieht, wie jeder Webserver, die Anfragen, die bei ihm ankommen.",
          "Wenn du dich mit Google anmeldest, teilt Google der App deine E-Mail-Adresse und deinen Namen mit — mehr nicht, und es geht nichts an Google zurück.",
          "Eine eingescannte Seite zu lesen nutzt Texterkennung, die auf deinem eigenen Gerät läuft. Beim ersten Mal lädt dein Browser die Sprachdaten von einem öffentlichen Tesseract-Server. Die Seite selbst verlässt dein Gerät nie; nur das Wörterbuch kommt herein.",
        ],
      },
      {
        titulo: "Cookies",
        paragrafos: [
          "Zwei, und keines davon verfolgt dich: das Sitzungs-Cookie, das dich angemeldet hält, und neko_lang, das sich die gewählte Sprache merkt. Es gibt kein Analyse- und kein Werbe-Cookie.",
        ],
      },
      {
        titulo: "Was nicht passiert",
        paragrafos: [
          "Deine Dateien werden von niemandem gelesen, nicht ausgewertet und nicht zum Trainieren von irgendetwas benutzt. Nichts wird verkauft oder an einen Datenhändler gegeben. Es gibt keine Werbung und keine Tracking-Skripte Dritter.",
        ],
      },
      {
        titulo: "Löschen",
        paragrafos: [
          "Ein Buch zu löschen löscht die Datei und alles, was daran hängt: Markierungen, Notizen, Lesezeichen, Position. Das geschieht sofort und lässt sich nicht rückgängig machen.",
          `Um das ganze Konto zu löschen, schreib an ${CONTATO} — es wird gelöscht, Dateien inbegriffen.`,
        ],
      },
      {
        titulo: "Änderungen",
        paragrafos: [
          "Ändert sich auf dieser Seite etwas Wesentliches, ändert sich das Datum oben mit.",
          `Fragen: ${CONTATO}`,
        ],
      },
    ],
  },

  it: {
    titulo: "Privacy",
    atualizadoEm: "Aggiornata il 31 agosto 2026",
    resumo:
      "Nekoreader tiene i tuoi libri e i tuoi appunti nel tuo account. Niente pubblicità, niente venduto a nessuno, nessun inseguimento in giro per la rete. Questa pagina dice esattamente cosa viene conservato e dove.",
    secoes: [
      {
        titulo: "Cosa viene conservato",
        paragrafos: [
          "Il tuo indirizzo e-mail e la tua password, gestiti entrambi da Supabase Auth. La password non viene mai conservata in forma leggibile, e l'app stessa non la vede mai.",
          "I file che carichi, i passaggi che evidenzi, i titoli e le note che ci scrivi sopra, le pagine che segni e la pagina a cui ti sei fermato in ogni libro.",
          "Un nome leggibile per ogni dispositivo su cui leggi, dedotto dal browser: “Chrome su Windows”, “Safari su iPhone”. Serve perché l'app possa proporti di riprendere da dove si è fermato l'altro dispositivo. È un'etichetta di browser, non un'identità.",
        ],
      },
      {
        titulo: "Dove si trova",
        paragrafos: [
          "In un progetto Supabase: il testo in un database Postgres, i file in un bucket privato. Niente lì dentro è pubblico: i tuoi file si aprono con link firmati per te, che scadono da soli.",
          "Ogni tabella ha una sicurezza per riga legata al tuo account. Un'altra persona autenticata nell'app non può leggere le tue righe, e chi non è entrato affatto nemmeno.",
        ],
      },
      {
        titulo: "Cosa resta sul tuo dispositivo",
        paragrafos: [
          "I libri che rendi disponibili offline, una copia delle tue evidenziazioni e il testo del libro usato dalla ricerca restano nell'archivio del browser, insieme alla coda di modifiche che ti permette di leggere e annotare senza connessione.",
          "Uscire dall'account cancella tutto questo da quel browser.",
        ],
      },
      {
        titulo: "Chi altro è coinvolto",
        paragrafos: [
          "Supabase conserva i dati e gestisce l'accesso. Vercel serve l'app e, come qualsiasi server web, vede le richieste che le arrivano.",
          "Se entri con Google, Google comunica all'app il tuo indirizzo e-mail e il tuo nome: nient'altro, e niente torna indietro a Google.",
          "Leggere una pagina scansionata usa un OCR che gira sul tuo dispositivo. La prima volta il browser scarica i dati della lingua da un server pubblico di tesseract. La pagina non lascia mai il tuo dispositivo; entra solo il dizionario.",
        ],
      },
      {
        titulo: "Cookie",
        paragrafos: [
          "Due, e nessuno dei due ti segue: il cookie di sessione, che ti tiene dentro, e neko_lang, che ricorda la lingua che hai scelto. Non c'è nessun cookie di analisi né di pubblicità.",
        ],
      },
      {
        titulo: "Cosa non viene fatto",
        paragrafos: [
          "I tuoi file non li legge nessuno, non vengono analizzati e non servono ad addestrare niente. Niente viene venduto o ceduto a un intermediario di dati. Non c'è pubblicità né script di tracciamento di terzi.",
        ],
      },
      {
        titulo: "Cancellare",
        paragrafos: [
          "Cancellare un libro cancella il file e tutto ciò che vi è attaccato: evidenziazioni, note, segnalibri, posizione. È immediato e non si può annullare.",
          `Per cancellare l'intero account, scrivi a ${CONTATO} e viene cancellato, file compresi.`,
        ],
      },
      {
        titulo: "Modifiche",
        paragrafos: [
          "Se questa pagina cambia in qualcosa che conta, la data in alto cambia con lei.",
          `Domande: ${CONTATO}`,
        ],
      },
    ],
  },
};
