# Leitor de PDF

App web pra ler PDFs com conta própria, biblioteca de livros, marcação de texto
(highlight), marcador de página e memória de onde você parou.

**Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 · Supabase
(Auth + Postgres + Storage) · react-pdf / pdf.js

---

## Funções

| Função | Onde |
|---|---|
| Criar conta / entrar (e-mail + senha) | `/login` |
| Biblioteca com upload de PDF (arrastar ou escolher) | `/` |
| Capa gerada da página 1 + barra de progresso | `/` |
| "Continuar lendo" com a página exata | `/` |
| Leitor com zoom, setas ← →, ir pra página | `/livro/[id]` |
| Marcar texto em 4 cores, clicar na marcação pra excluir | `/livro/[id]` |
| Marcar página (★) e lista de páginas marcadas | painel lateral |
| Salva a última página lida sozinho (debounce 700ms) | automático |

Marcações são salvas como retângulos em **fração da página (0..1)**, então
continuam no lugar certo em qualquer zoom ou tamanho de tela.

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
4. **Authentication → URL Configuration**:
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
    pdf.ts                     worker do pdf.js, leitura de nº de páginas e capa
    types.ts                   Book, Highlight, Bookmark, Rect
  app/
    login/                     entrar / criar conta
    auth/callback              confirmação de e-mail
    auth/signout               sair
    page.tsx                   biblioteca
    livro/[id]/page.tsx        carrega livro + URL assinada + marcações
  components/
    uploader.tsx               upload com capa gerada no cliente
    book-card.tsx              card do livro + excluir
    reader.tsx                 barra, painel lateral, persistência
    pdf-canvas.tsx             render da página, seleção → marcação
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
- Marcação depende da camada de texto do PDF: PDF escaneado sem OCR não deixa
  selecionar.
- Limite de 100 MB por arquivo (ajustável em `supabase/schema.sql`).
