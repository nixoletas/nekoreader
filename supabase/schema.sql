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
  last_read_at  timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists books_user_idx on public.books (user_id, created_at desc);

create table if not exists public.highlights (
  id          uuid primary key default gen_random_uuid(),
  book_id     uuid not null references public.books (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  page        int  not null,
  text        text,
  color       text not null default 'yellow',
  -- rects: [{ x, y, w, h }] em fração (0..1) do tamanho da página
  rects       jsonb not null,
  created_at  timestamptz not null default now()
);

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

-- ---------- Row Level Security ----------

alter table public.books      enable row level security;
alter table public.highlights enable row level security;
alter table public.bookmarks  enable row level security;

drop policy if exists "books: dono faz tudo" on public.books;
create policy "books: dono faz tudo" on public.books
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "highlights: dono faz tudo" on public.highlights;
create policy "highlights: dono faz tudo" on public.highlights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "bookmarks: dono faz tudo" on public.bookmarks;
create policy "bookmarks: dono faz tudo" on public.bookmarks
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
