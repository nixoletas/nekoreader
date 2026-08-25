-- ============================================================
-- PDF Reader — schema completo
-- Rode isto no SQL Editor do Supabase (uma vez).
-- ============================================================

-- ---------- Tabelas ----------

create table if not exists public.books (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  title         text not null,
  author        text,
  storage_path  text not null,
  cover_path    text,
  size_bytes    bigint,
  total_pages   int,
  last_page     int  not null default 1,
  -- format: 'pdf' ou 'epub'. No EPUB, "página" quer dizer capítulo — progresso,
  -- marcador e marcação seguem sendo guardados por número, sem caso especial.
  format        text not null default 'pdf',
  -- positions: { "<página>": <fração 0..1 da rolagem> } — onde a leitura parou em cada
  -- página. Fração, e não pixel, pra valer no computador e no celular do mesmo jeito.
  positions     jsonb not null default '{}'::jsonb,
  -- page_labels: a numeração impressa do livro, deduzida uma vez pela varredura
  -- do arquivo — `{ "versao": n, "rotulos": {...} | null }`. Fica aqui, e não só
  -- no aparelho que varreu, porque é propriedade do arquivo: senão o mesmo livro
  -- mostra "de 697" no celular e "de 708" no computador.
  page_labels   jsonb,
  last_read_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- coluna nova em bancos já existentes (a criação acima só roda em banco vazio)
alter table public.books add column if not exists positions jsonb not null default '{}'::jsonb;
alter table public.books add column if not exists format text not null default 'pdf';
alter table public.books add column if not exists page_labels jsonb;

create index if not exists books_user_idx on public.books (user_id, created_at desc);

create table if not exists public.highlights (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  page        int  not null,
  text        text,
  -- título dado pela pessoa à marcação (opcional)
  title       text,
  -- nota escrita pela pessoa sobre o trecho (opcional, texto longo)
  note        text,
  color       text not null default 'yellow',
  -- modo em que a marcação foi feita: 'pagina' (imagem do pdf) ou 'texto' (remontado)
  mode        text not null default 'pagina',
  -- rects: [{ x, y, w, h }] em fração (0..1) do tamanho da página — modo página
  rects       jsonb not null default '[]'::jsonb,
  -- spans: [{ bloco, start, end }] em offset de caractere do parágrafo remontado — modo texto
  spans       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

-- colunas novas em bancos já existentes (a criação acima só roda em banco vazio)
alter table public.highlights add column if not exists mode text not null default 'pagina';
alter table public.highlights add column if not exists spans jsonb not null default '[]'::jsonb;
alter table public.highlights alter column rects set default '[]'::jsonb;
-- título dado pela pessoa à marcação (opcional)
alter table public.highlights add column if not exists title text;
-- nota escrita pela pessoa sobre o trecho (opcional)
alter table public.highlights add column if not exists note text;

create index if not exists highlights_book_idx on public.highlights (book_id, page);

create table if not exists public.bookmarks (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  page        int  not null,
  label       text,
  created_at  timestamptz not null default now(),
  unique (book_id, page)
);

create index if not exists bookmarks_book_idx on public.bookmarks (book_id, page);

-- Onde a leitura parou **em cada aparelho**. `books.last_page` continua sendo a
-- posição mais recente do livro (é ela que a estante mostra); esta tabela é o que
-- permite abrir no celular onde o celular parou e ainda assim oferecer "continuar
-- de onde você parou no computador".
create table if not exists public.reading_positions (
  book_id      uuid not null references public.books (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- id sorteado no aparelho e guardado nele (localStorage) — não identifica pessoa
  device_id    text not null,
  -- nome legível deduzido do navegador: "Chrome no Windows", "Safari no iPhone"
  device_name  text not null default 'Aparelho',
  page         int  not null default 1,
  -- fração (0..1) da rolagem dentro da página, do mesmo jeito que `books.positions`
  fraction     real not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (book_id, device_id)
);

create index if not exists reading_positions_book_idx
  on public.reading_positions (book_id, updated_at desc);

-- ---------- Row Level Security ----------

alter table public.books      enable row level security;
alter table public.highlights enable row level security;
alter table public.bookmarks  enable row level security;
alter table public.reading_positions enable row level security;

drop policy if exists "books: dono faz tudo" on public.books;
create policy "books: dono faz tudo" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "highlights: dono faz tudo" on public.highlights;
create policy "highlights: dono faz tudo" on public.highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bookmarks: dono faz tudo" on public.bookmarks;
create policy "bookmarks: dono faz tudo" on public.bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "reading_positions: dono faz tudo" on public.reading_positions;
create policy "reading_positions: dono faz tudo" on public.reading_positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Storage ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('books', 'books', false, 104857600, array['application/pdf', 'image/jpeg'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Arquivos ficam em books/<user_id>/<uuid>.pdf
drop policy if exists "books storage: leitura do dono" on storage.objects;
create policy "books storage: leitura do dono" on storage.objects
  for select using (
    bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "books storage: upload do dono" on storage.objects;
create policy "books storage: upload do dono" on storage.objects
  for insert with check (
    bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "books storage: update do dono" on storage.objects;
create policy "books storage: update do dono" on storage.objects
  for update using (
    bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "books storage: delete do dono" on storage.objects;
create policy "books storage: delete do dono" on storage.objects
  for delete using (
    bucket_id = 'books' and (storage.foldername(name))[1] = auth.uid()::text
  );
