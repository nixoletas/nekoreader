# Marginália — leitor de PDF

App web (PWA) pra ler PDFs com conta própria, estante de livros, marcação de
texto, marcador de página e memória de onde você parou.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · Supabase
(Auth + Postgres + Storage) · react-pdf / pdf.js

---

## Funções

| Função | Onde |
|---|---|
| Criar conta (senha + confirmação) e entrar | `/login` |
| Esqueci a senha → link por e-mail → nova senha | `/esqueci` → `/nova-senha` |
| Estante com upload de PDF/EPUB (arrastar ou tocar) | `/` |
| Com a estante cheia, o envio some num "+" no canto (modal) | `/` |
| Capa gerada da página 1 + barra de progresso | `/` |
| "Continuar lendo" com a página exata | `/` |
| Leitor com zoom, ← →, deslizar o dedo, ir pra página | `/livro/[id]` |
| Marcar texto em 4 cores; tocar na marcação pra apagar | `/livro/[id]` |
| Marcar página (★) e lista de páginas guardadas | painel |
| Salva a última página lida sozinho (debounce 700ms) | automático |
| Instalável no celular (PWA, standalone, ícone próprio) | manifest + SW |
| Título e autor: editar à mão, ou descobrir pelo arquivo | estante e leitor |
| Numeração do **livro** (ignora capa/rosto/sumário), inclusive romana | automático |
| Conferir a folha original sem sair do texto remontado | leitor, modo Texto |
| Exportar o livro em EPUB ou Markdown, com a página anotada | leitor |
| OCR de página digitalizada, no próprio aparelho | leitor, modo Texto |
| Equação destacada vira recorte da folha, em vez de texto embaralhado | modo Texto |

### Como o livro se chama

No envio, o nome sai dos metadados do PDF e, quando eles não prestam, do texto
da capa — onde o título é literalmente o que está escrito maior. O filtro de
lixo é a parte que importa: `Title` costuma vir como "Microsoft Word -
cap1_FINAL2.doc" ou "untitled", e aceitar isso dá um nome errado que ninguém
desconfia que está errado. Sem nada aproveitável, fica o nome do arquivo.

Depois disso é tudo na mão: o lápis no card da estante (ou o título na barra do
leitor) abre título e autor pra editar, com um botão de **descobrir pelo
arquivo** que relê metadados, capa e — se a capa for uma imagem — passa OCR
nela. O que a pessoa escreve sempre ganha do que o app deduz.

### Numeração do livro

Um PDF conta a partir da capa; o livro conta a partir do primeiro capítulo. A
página 121 do arquivo costuma ser a 105 do livro — e é a do livro que aparece na
citação, no índice e na conversa com outra pessoa.

O leitor descobre isso sozinho: usa `/PageLabels` quando o arquivo traz, e senão
lê o número impresso no rodapé de uma amostra de páginas e tira a moda de
"página do arquivo − número impresso". A abertura em romano (i, ii, … xvi) sai
junto. Daí em diante toda a interface fala essa numeração — barra, marcações,
sumário, grade de páginas, a pergunta de "continuar do outro aparelho" — e o
campo "ir para a página" aceita tanto `87` quanto `xix`.

Marcações são salvas como retângulos em **fração da página (0..1)**, então
continuam no lugar certo em qualquer zoom ou tamanho de tela. O véu é
translúcido (`mix-blend-mode: multiply`, alfa ~0.28): o texto continua legível
por baixo.

### Mobile

- Barra inferior fixa com alvos de 48px: ‹ · ★ · página · marcações · ›
- Deslizar o dedo na página vira a página (ignorado quando há texto selecionado)
- Painel de marcações vira folha deslizante (bottom sheet)
- `viewport-fit=cover` + `env(safe-area-inset-bottom)` pro notch/gesture bar

### Design

Paleta de papel e tinta (`--paper`, `--ink`, `--accent` vermelho de lombada,
`--gold`), grão sutil no fundo, títulos em **Fraunces** (serifada), claro e
escuro automáticos. Tokens ficam todos no topo de `src/app/globals.css`.

---

## 1. Configurar o Supabase

1. Crie um projeto em <https://supabase.com> (plano free serve).
2. **SQL Editor → New query** → cole o conteúdo de
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   Isso cria as tabelas `books`, `highlights`, `bookmarks`, liga RLS (cada
   usuário só enxerga o que é dele) e cria o bucket privado `books`.
3. **Authentication → Providers → Email**: deixe ligado.
   - Pra testar rápido, desligue *Confirm email*.
   - Se deixar ligado, o usuário recebe e-mail e volta por `/auth/callback`.
4. **Authentication → URL Configuration** (obrigatório pro "esqueci a senha"
   funcionar):
   - *Site URL*: `http://localhost:3000` (e depois a URL da Vercel)
   - *Redirect URLs*: adicione `http://localhost:3000/**` e
     `https://SEU-APP.vercel.app/**`
5. **Project Settings → API**: copie `Project URL` e a chave `anon public`.

## 2. Rodar local

```bash
cp .env.example .env.local   # e preencha as duas variáveis
npm install
npm run dev
```

Abra <http://localhost:3000>, crie a conta, suba um PDF.

> `predev`/`prebuild` copiam o worker e os cMaps do pdf.js pra `public/`.
> Esses arquivos são gerados — não precisam ir pro git.

Pra testar o PWA (instalar no celular, service worker) precisa de build de
produção — o SW só registra em produção:

```bash
npm run build && npm start
```

### Testes

```bash
npm test
```

`pretest` compila os módulos puros de `src/lib` pro node (em
`node_modules/.cache/teste`) e `node --test` roda `test/`. São testes da parte
que erra caro e não dá pra conferir de olho: a numeração impressa, a detecção de
fórmula (principalmente o que **não** é fórmula) e a conversão pra EPUB/Markdown.

## 3. Deploy na Vercel

```bash
npm i -g vercel     # se ainda não tiver
git init && git add -A && git commit -m "leitor de pdf"
vercel              # segue o wizard
```

Ou: suba pro GitHub e importe o repo em <https://vercel.com/new>.

Em **Project → Settings → Environment Variables** cadastre (Production +
Preview):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Depois do primeiro deploy, volte no Supabase e adicione a URL da Vercel em
*Site URL* e *Redirect URLs* (passo 1.4).

---

## Estrutura

```
src/
  proxy.ts                     guarda de rota + refresh de sessão (Next 16)
  lib/
    supabase/{client,server,session}.ts
    pdf.ts                     worker do pdf.js, nº de páginas e capa
    pdf-blocos.ts              remontagem: linha → parágrafo, título, tabela, fórmula
    pdf-rotulos.ts             numeração impressa do livro (folio, romano, deslocamento)
    pdf-titulo.ts              título e autor: metadados peneirados, capa, OCR
    pdf-ocr.ts                 página digitalizada → os mesmos Item do pdf.js
    exportar.ts                blocos → EPUB 3 (com page-list) e Markdown
    types.ts                   Book, Highlight, Bookmark, Rect, cores
  app/
    globals.css                paleta, grão, estilo das marcações
    manifest.ts                manifest do PWA
    icons/[size]/route.tsx     ícones 180/192/512 gerados (next/og)
    login/                     entrar / criar conta (senha + confirmação)
    esqueci/                   pedir link de recuperação
    nova-senha/                trocar a senha depois do link
    auth/callback              confirma e-mail e troca `code` por sessão
    auth/signout               sair
    page.tsx                   estante
    livro/[id]/page.tsx        livro + URL assinada + marcações
  components/
    ui.tsx                     Campo, Botao, Aviso (alvos de 48px)
    auth-shell.tsx             moldura das telas de conta
    uploader.tsx               upload com capa gerada no cliente
    book-card.tsx              capa com lombada + progresso
    reader.tsx                 barras, painel, folhas, persistência
    pdf-canvas.tsx             render, seleção → marcação, swipe
    sw-register.tsx            registra o service worker (só em produção)
public/sw.js                   cache de asset estático (nunca HTML/sessão)
supabase/schema.sql            tabelas, RLS, bucket
```

## Segurança

- Bucket `books` é **privado**; o app usa URLs assinadas (6h pro PDF, 1h pras
  capas).
- RLS em todas as tabelas: `auth.uid() = user_id`. Policies de Storage exigem
  que o arquivo esteja na pasta `<user_id>/`.
- Só a chave `anon` vai pro navegador — nunca use a `service_role` no front.

## Limites conhecidos

- Leitura é **uma página por vez** (não é scroll contínuo).
- No modo Página, marcar depende da camada de texto do PDF. Página digitalizada
  precisa do OCR (modo Texto), que é sob demanda, uma página por vez.
- O OCR baixa o dicionário do idioma de um CDN na primeira vez (fica no
  IndexedDB depois). O worker e o núcleo WASM são servidos pelo próprio app.
- A numeração do livro sai da camada de texto: livro digitalizado só ganha ela
  depois do OCR, página a página.
- Limite de 100 MB por arquivo (ajustável em `supabase/schema.sql`).
