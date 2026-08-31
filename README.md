<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-banner-dark.svg">
    <img src="public/logo-banner.svg" alt="Nekoreader" width="620">
  </picture>
</p>

<p align="center">
  <b>English</b> &nbsp;·&nbsp; <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <strong>A PDF and EPUB reader in the browser.</strong><br>
  Your shelf, your text marked in four colours, and the page you stopped on —
  on the computer and on the phone, in the numbering the book prints.
</p>

<p align="center">
  <a href="https://nekoreader.vercel.app"><strong>nekoreader.vercel.app</strong></a> &nbsp;·&nbsp;
  <a href="#features">Features</a> &nbsp;·&nbsp;
  <a href="#1-set-up-supabase">Install</a> &nbsp;·&nbsp;
  <a href="#layout">Layout</a> &nbsp;·&nbsp;
  <a href="#known-limits">Limits</a>
</p>

<p align="center">
  <a href="https://github.com/sponsors/nixoletas"><b>💛 Help me buy the domain</b></a><br>
  <sub>The app runs on free plans and still lives at <code>nekoreader.vercel.app</code>.</sub>
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16-a33f27?style=flat-square&labelColor=211c16">
  <img alt="React 19" src="https://img.shields.io/badge/React-19-a33f27?style=flat-square&labelColor=211c16">
  <img alt="Tailwind v4" src="https://img.shields.io/badge/Tailwind-v4-a33f27?style=flat-square&labelColor=211c16">
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth%20%2B%20Postgres-a33f27?style=flat-square&labelColor=211c16">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-reads%20offline-b78a34?style=flat-square&labelColor=211c16">
  <img alt="English and Portuguese" src="https://img.shields.io/badge/languages-en%20%C2%B7%20pt--BR-b78a34?style=flat-square&labelColor=211c16">
</p>

<br>

<p align="center">
  <img src="public/print-web.png" width="880"
       alt="The reader open on a computer, with a passage highlighted in amber and the notes panel open beside it">
</p>

<p align="center">
  <img src="public/print-android.jpg" width="228"
       alt="The same book open on a phone, with the bottom navigation bar">
  &nbsp;&nbsp;&nbsp;
  <img src="public/eg-android-1.jpg" width="228"
       alt="The shelf on a phone, with book covers and reading progress">
</p>

<p align="center">
  <em>Installable on a phone: it goes to the home screen and opens like an app.</em>
</p>

<p align="center">
  <sub>
    Next.js 16 (App Router) · React 19 · Tailwind v4 ·
    Supabase (Auth + Postgres + Storage) · react-pdf / pdf.js · tesseract.js
  </sub>
</p>

---

## Features

<p align="center">
  <img src="public/eg-web-1.png" width="880"
       alt="The shelf on a computer: covers generated from page one, progress bars and the continue-reading card">
</p>

| Feature | Where |
|---|---|
| The pitch, for people without an account yet | `/` |
| Sign in with Google — the only way in | `/login` |
| Shelf with PDF/EPUB upload (drag or tap) | `/library` |
| Once the shelf is full, upload folds into a "+" in the corner | `/library` |
| Cover generated from page one + progress bar | `/library` |
| "Continue reading" with the exact page | `/library` |
| Reader with zoom, ← →, swipe, go to page | `/book/[id]` |
| Highlight text in 4 colours; tap a highlight to delete it | `/book/[id]` |
| Search the whole book, ignoring accents and case | panel |
| Bookmark a page (★) and list the saved ones | panel |
| Saves the last page read on its own (700ms debounce) | automatic |
| Installable on a phone (PWA, standalone, its own icon) | manifest + SW |
| Title and author: edit by hand, or work it out from the file | shelf and reader |
| The **book's** numbering (skips cover, title page, contents), roman too | automatic |
| Check the original page without leaving the rebuilt text | reader, Text mode |
| Export the book as EPUB or Markdown, with the annotated page | reader |
| OCR of a scanned page, on the device itself | reader, Text mode |
| A display equation becomes a crop of the page, not scrambled text | Text mode |
| Interface in English and Portuguese, with a switcher | every screen |

### Languages

English (the default and the fallback) and Brazilian Portuguese. The language
comes, in this order, from the `neko_lang` cookie (the person's choice), from
the browser's `Accept-Language` (the guess), and from the default — anyone
asking for another language lands on English.

The **server** decides, in `layout.tsx`, once per request: that is what makes
`<html lang>`, the `<title>`, the PWA manifest and the landing copy come out
right from the start, without the flash of English a client-side switch would
give. The chosen dictionary comes down as a prop to `I18nProvider`, so the
browser downloads **one** language, not both.

```
src/lib/i18n/
  config.ts              locales, cookie, detection, OCR languages
  servidor.ts            localeAtual() / i18nAtual() — server only
  cliente.tsx            I18nProvider, useT, useI18n, useTrocarIdioma
  formato.ts             fmt("{n} of {total}") and plural() via Intl.PluralRules
  dicionarios/
    en.ts                the reference: the keys come from here
    tipo.ts              widens en's literals back to `string`
    pt-BR.ts
```

`en.ts` is the source of truth for the **shape**: `Dicionario` is its type with
the literals widened, so a new key breaks `tsc` in `pt-BR.ts` until it is filled
in. A missing translation is a compile error, not a half-translated screen.

There were six languages up to now. Spanish, French, German and Italian were
dropped because a translation with nobody to review it ages into being wrong —
and a wrong sentence on screen is worse than an English one. The structure is
unchanged: adding a language is creating the file and putting the code in
`LOCALES`.

Two rules worth remembering when touching this:

- **Whole sentences in the dictionary, never fragments.** "on page" and "in
  chapter" are separate entries because in Portuguese the preposition changes
  with gender; assembling `"n" + article + noun` only works in one language.
- **Counts use `{ one, other }`** and go through `plural()`, which asks the
  language's `Intl.PluralRules` instead of comparing against 1 by hand.

OCR follows along: `IDIOMAS_OCR` maps each language to its tesseract data
(`eng`, `por+eng`), always with English alongside, because a technical book in
any language is full of English terms and proper nouns.

### What the book is called

On upload, the name comes from the PDF's metadata and, when that is no good,
from the text on the cover — where the title is literally whatever is written
largest. The junk filter is the part that matters: `Title` usually arrives as
"Microsoft Word - ch1_FINAL2.doc" or "untitled", and accepting that gives a
wrong name nobody suspects is wrong. With nothing usable, the filename stays.

After that it is all by hand: the pencil on the shelf card (or the title in the
reader's bar) opens title and author for editing, with a **work it out from the
file** button that re-reads metadata, the cover and — if the cover is an image —
runs OCR on it. What a person writes always beats what the app guessed.

### The book's numbering

A PDF counts from the cover; the book counts from the first chapter. Page 121 of
the file is usually page 105 of the book — and it is the book's that shows up in
a citation, in the index, and in a conversation with someone else.

The reader works it out on its own: it uses `/PageLabels` when the file carries
them, and otherwise reads the number printed in the footer of a sample of pages
and takes the mode of "file page − printed number". The roman opening (i, ii, …
xvi) comes along. From then on the whole interface speaks that numbering — the
bar, the highlights, the contents, the page grid, the "continue from the other
device" question — and the "go to page" field accepts both `87` and `xix`.

Highlights are stored as rectangles in **fractions of the page (0..1)**, so they
stay in the right place at any zoom or screen size. The veil is translucent
(`mix-blend-mode: multiply`, alpha ~0.28): the text stays readable underneath.

### Searching the book

The fourth tab of the panel. Type a word and it appears with the piece of
sentence around it, in the book's numbering; tapping takes you to the page.

Two decisions explain the rest:

- **Searching has to be more forgiving than reading.** Someone typing does not
  reproduce the book character by character: they write without accents, in
  lowercase, and the word they want may be split across two lines by a hyphen.
  Matching happens on a flattened form of the text — no accents, no case, curly
  quotes and dashes folded into what a keyboard has — but the snippet comes back
  **as the book wrote it**. That is what makes "cao" find "coração" and still
  show "coração".
- **Read the book once, search it many times.** The first search sweeps the whole
  file (with a progress bar) and keeps the text on the device; from the second on
  the PDF is not even opened, and the search answers on every keystroke. A sweep
  cancelled halfway is not kept — half a book kept would make the search lie
  quietly.

Each page's text comes from the same rebuild the Text mode uses, not from the raw
text: that is what joins lines into paragraphs and undoes hyphenation. A page
that already went through OCR joins for free, because the OCR result was already
stored.

### Mobile

- Fixed bottom bar with 48px targets: ‹ · ★ · page · notes · ›
- Swiping the page turns it (ignored while text is selected)
- The notes panel becomes a bottom sheet
- `viewport-fit=cover` + `env(safe-area-inset-bottom)` for the notch and gesture bar

### Design

A paper-and-ink palette (`--paper`, `--ink`, `--accent` a spine red, `--gold`),
a subtle grain in the background, headings in **Fraunces** (a serif), light and
dark automatic. The tokens all live at the top of `src/app/globals.css`.

### The mark

A cat behind a book — the book the icon already was, plus the "neko" that was
missing. Only about eight pixels of the head show above the cover, but it is the
curve between the two ears that makes the eye read "cat behind a book" instead
of "two triangles".

The drawing lives in `src/lib/logo.ts` and is used in three places by three
different routes, without existing twice:

| Where | How |
|---|---|
| PWA and iOS icon | `app/icons/[size]` rasterises it with `next/og` |
| Inside the screens | `components/marca.tsx`, inline in the DOM |
| README and `<link rel=icon>` | `public/logo*.svg`, generated files |

Inline in the DOM the SVG uses the theme's variables (`--accent`, `--surface`),
so the mark follows light and dark on its own, without a second copy. The icon
and the files in `public/`, on the other hand, are drawn outside any page —
there is no CSS there to resolve a variable, so the colours are spelled out.

The wordmark is outlines, not `<text>`: an SVG with `<text>` uses whatever font
the viewer's machine has, and the logo would change shape from computer to
computer. The curves come from the same Fraunces the app loads.

```bash
node scripts/gerar-logo.mjs    # rewrites public/logo*.svg
python scripts/gerar-logo.py   # only if the wordmark changes (needs fonttools)
```

Neither runs in the build. `test/logo.test.mjs` is what guarantees the committed
files still match the drawing — a generated file that is also committed ages
quietly.

---

## 1. Set up Supabase

1. Create a project at <https://supabase.com> (the free plan is enough).
2. **SQL Editor → New query** → paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   That creates the `books`, `highlights`, `bookmarks` and `reading_positions`
   tables, turns on RLS (each user only sees their own), creates the
   `contagem_marcacoes()` function the shelf uses to count highlights per book,
   and creates the private `books` bucket.

   The file is idempotent: running it again on an existing database only adds
   what was missing.
3. **Authentication → Providers → Email**: turn it **off**. The app no longer
   offers it, but while the provider is on, the API still accepts sign-ups
   through it.
4. **Authentication → URL Configuration** (required for the Google redirect to
   come back):
   - *Site URL*: `http://localhost:3000` (and later your deployed URL)
   - *Redirect URLs*: add `http://localhost:3000/**` and
     `https://YOUR-APP.vercel.app/**`
5. **Project Settings → API**: copy the `Project URL` and the `anon public` key.

### Signing in with Google (required)

Google is the only way in — there is no email-and-password form. That is a
deliberate trade: what weighed was not the form but its tail (confirm the email,
resend the confirmation, forgot the password, receive the link, expired link),
half a dozen screens and a real email service to keep alive before anyone reads
a page. The cost is stated plainly on the sign-in screen: no Google account, no
way in.

Set it up in this order, because the consent screen asks for the privacy policy
URL:

1. **Google Cloud Console → OAuth consent screen**: app name, support email, and
   the privacy policy address (`https://your-app.vercel.app/privacy`).
2. **Credentials → OAuth Client ID (Web)**: authorised redirect URI
   `https://<your-project>.supabase.co/auth/v1/callback`.
3. **Supabase → Auth → Providers → Google**: paste the Client ID and Secret.

Two things worth knowing before you start. The Google screen will say "continue
to `<your-project>.supabase.co`", not your app's name — the OAuth redirect
belongs to Supabase, and only a custom domain there (a paid add-on) changes it.
And the basic scopes (email and profile) need no verification from Google and
have no 100-user cap; that only applies to sensitive scopes.

Until the provider is switched on, the button answers with a plain message
instead of Supabase's raw "Unsupported provider".

Anyone who already had an account with the same, confirmed email keeps it:
Supabase attaches the Google identity to the existing user instead of creating a
second one.

## 2. Run it locally

```bash
cp .env.example .env.local   # and fill in the two variables
npm install
npm run dev
```

Open <http://localhost:3000>, create an account, upload a PDF.

> `predev`/`prebuild` copy the pdf.js worker and cMaps into `public/`.
> Those files are generated — they do not need to be in git.

To test the PWA (installing on a phone, the service worker) you need a
production build — the SW only registers in production:

```bash
npm run build && npm start
```

### Tests

```bash
npm test
```

`pretest` compiles the pure modules of `src/lib` for node (into
`node_modules/.cache/teste`) and `node --test` runs `test/`. These cover the
parts that are expensive to get wrong and impossible to eyeball: the printed
numbering, formula detection (above all what is **not** a formula), the
EPUB/Markdown conversion, the search matcher (finding "ção" by typing "cao", and
**not** finding what is not there), and whether the SVGs in `public/` still match
the drawing in `lib/logo.ts`.

`tsc` is a test here too: `npm run typecheck` is what demands the Portuguese
translation of every new key.

## 3. Deploy to Vercel

```bash
npm i -g vercel     # if you don't have it yet
git init && git add -A && git commit -m "pdf reader"
vercel              # follow the wizard
```

Or: push to GitHub and import the repo at <https://vercel.com/new>.

In **Project → Settings → Environment Variables** add (Production + Preview):

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

`NEXT_PUBLIC_SITE_URL` is optional: without it the app falls back to Vercel's
production domain, which is right for shared links and the sitemap. Set it when
a domain of its own arrives — that is the only change a new domain needs.

After the first deploy, go back to Supabase and add the Vercel URL to *Site URL*
and *Redirect URLs* (step 1.4).

---

## Layout

```
src/
  proxy.ts                     route guard + session refresh (Next 16)
  lib/
    i18n/                      languages (see "Languages" above)
    supabase/{client,server,session}.ts
    pdf.ts                     the pdf.js worker, page count and cover
    pdf-blocos.ts              rebuild: line → paragraph, heading, table, formula
    pdf-rotulos.ts             the book's printed numbering (folio, roman, offset)
    pdf-titulo.ts              title and author: sifted metadata, cover, OCR
    pdf-ocr.ts                 scanned page → the same pdf.js Items
    busca.ts                   accent- and case-blind matching, and the snippet
    pdf-busca.ts               reads the whole book once, so search has somewhere to look
    use-busca.ts               the search tab: sweep once, keep it, match in memory
    exportar.ts                blocks → EPUB 3 (with page-list) and Markdown
    logo.ts                    the mark — the single source of the cat and the book
    legal.ts                   the privacy policy in both languages
    site.ts                    the public address (metadataBase, robots, sitemap)
    offline-db.ts              IndexedDB: downloaded book, snapshots, sync queue
    offline-sync.ts            run or enqueue; drain the queue when the network returns
    types.ts                   Book, Highlight, Bookmark, Rect, colours
  app/
    globals.css                palette, grain, highlight styling
    layout.tsx                 resolves the language and mounts the I18nProvider
    manifest.ts                the PWA manifest, in the request's language
    icons/[size]/route.tsx     180/192/512 icons generated (next/og) from lib/logo.ts
    opengraph-image.tsx        the shared-link image, in the request's language
    robots.ts / sitemap.ts     only the landing and the privacy page are public
    privacy/page.tsx           privacy policy (text in lib/legal.ts)
    error.tsx                  an error on any screen, in the person's language
    global-error.tsx           the error that takes down the layout itself (last resort)
    not-found.tsx              a route that does not exist
    page.tsx                   landing (public; signed-in visitors go to /library)
    login/                     sign in with Google (the only provider)
    auth/callback              trades the `code` Google returns for a session
    auth/signout               sign out
    library/page.tsx           the shelf
    book/[id]/page.tsx         the book + signed URL + highlights
    book/[id]/notes/page.tsx   highlights on a full page
  components/
    ui.tsx                     Campo, Botao, Aviso (48px targets)
    marca.tsx                  the inline mark, following the theme through variables
    auth-shell.tsx             the frame for the account screens
    seletor-idioma.tsx         language switcher
    prints-app.tsx             the app's two screens (desktop + phone), on the landing
    uploader.tsx               upload with the cover generated on the client
    book-card.tsx              cover with a spine + progress
    reader.tsx                 bars, panel, sheets, persistence
    pdf-canvas.tsx             render, selection → highlight, swipe
    sw-register.tsx            registers the service worker (production only)
public/sw.js                   static asset cache (never HTML or session)
public/logo*.svg               mark and banner — generated by scripts/gerar-logo.mjs
supabase/schema.sql            tables, RLS, bucket, highlight counts
```

## Security

- The `books` bucket is **private**; the app uses signed URLs (6h for the PDF,
  1h for covers).
- RLS on every table: `auth.uid() = user_id`. Storage policies require the file
  to live in the `<user_id>/` folder.
- Only the `anon` key reaches the browser — never use `service_role` on the
  front end.

## Support

Nekoreader runs entirely on free plans: Supabase (1 GB of files, 5 GB/month of
egress) and Vercel. It does not have a domain of its own yet — it lives at
`nekoreader.vercel.app`.

What support buys, in this order:

1. **The domain.** `nekoreader.com` costs about US$12/year. It is also what makes
   the Google screen say "Nekoreader" instead of the Supabase address when
   signing in with a Google account.
2. **Room.** 1 GB runs out fast when a single book weighs tens of MB.

- **GitHub Sponsors:** <https://github.com/sponsors/nixoletas>
- **Ko-fi:** <https://ko-fi.com/nicholasmiyasato>

Supporting gets you nothing extra inside the app — there is no paid tier and no
locked feature. It stays the same reader for everyone.

## Known limits

- Reading is **one page at a time** (not continuous scroll).
- In Page mode, highlighting depends on the PDF's text layer. A scanned page
  needs OCR (Text mode), which is on demand, one page at a time.
- OCR downloads the language data from a CDN the first time (it stays in
  IndexedDB afterwards). The worker and the WASM core are served by the app
  itself.
- The book's numbering comes from the text layer: a scanned book only gets it
  after OCR, page by page. Search follows the same rule — it finds what has a
  text layer, and a scanned page only joins once OCR has run on it.
- Search takes you to the page; it does not paint the match onto the rendered
  page.
- A 100 MB limit per file (adjustable in `supabase/schema.sql`).
