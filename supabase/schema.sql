-- ONE TO BEYOND · Supabase schema
-- Supabase → SQL Editor → New query → paste everything → Run.
-- Safe to run again (it only creates what is missing and refreshes policies).

-- ============================================================
-- Admins
-- ============================================================
create table if not exists public.admins (
  email text primary key check (email = lower(email))
);
alter table public.admins enable row level security;

-- Access-code login account + the first admin's Google address.
insert into public.admins (email) values
  ('admin@onetobeyond.org'),
  ('wonshon@wharton.upenn.edu')
on conflict do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

drop policy if exists "admins manage admins" on public.admins;
create policy "admins manage admins" on public.admins
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, delete on public.admins to authenticated;

-- ============================================================
-- Letters: drafts (admin only) and published copies (public)
-- ============================================================
create table if not exists public.letter_drafts (
  id          text primary key check (id ~ '^[a-z0-9-]{1,80}$'),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create table if not exists public.letters_published (
  id            text primary key references public.letter_drafts (id) on delete cascade,
  data          jsonb not null,
  published_at  timestamptz not null default now()
);
create table if not exists public.site_settings (
  key    text primary key,
  value  jsonb not null
);
alter table public.letter_drafts     enable row level security;
alter table public.letters_published enable row level security;
alter table public.site_settings     enable row level security;

drop policy if exists "admin drafts" on public.letter_drafts;
create policy "admin drafts" on public.letter_drafts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads published" on public.letters_published;
create policy "public reads published" on public.letters_published for select using (true);
drop policy if exists "admin publishes" on public.letters_published;
create policy "admin publishes" on public.letters_published
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public reads settings" on public.site_settings;
create policy "public reads settings" on public.site_settings for select using (true);
drop policy if exists "admin settings" on public.site_settings;
create policy "admin settings" on public.site_settings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.letters_published, public.site_settings to anon, authenticated;
grant select, insert, update, delete on public.letter_drafts, public.letters_published, public.site_settings to authenticated;

-- ============================================================
-- 마음 나눔 (comments): Google sign-in, public or private
-- ============================================================
create table if not exists public.posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 30),
  body        text not null check (char_length(btrim(body)) between 2 and 1200),
  kind        text not null default 'sharing' check (kind in ('sharing', 'prayer')),
  visibility  text not null default 'public'  check (visibility in ('public', 'private')),
  letter_id   text not null check (char_length(letter_id) <= 100),
  created_at  timestamptz not null default now()
);
create index if not exists posts_letter_created on public.posts (letter_id, created_at desc);
alter table public.posts enable row level security;

drop policy if exists "read public, own, or admin" on public.posts;
create policy "read public, own, or admin" on public.posts
  for select using (visibility = 'public' or user_id = auth.uid() or public.is_admin());
drop policy if exists "signed-in users write as themselves" on public.posts;
create policy "signed-in users write as themselves" on public.posts
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "authors edit own" on public.posts;
create policy "authors edit own" on public.posts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "authors or admins delete" on public.posts;
create policy "authors or admins delete" on public.posts
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

grant select on public.posts to anon, authenticated;
grant insert, update, delete on public.posts to authenticated;

-- ============================================================
-- Address book, groups, send log (admin only)
-- ============================================================
create table if not exists public.contact_groups (
  name text primary key check (char_length(btrim(name)) between 1 and 40)
);
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default '' check (char_length(name) <= 60),
  email       text not null unique check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  note        text not null default '' check (char_length(note) <= 2000),
  groups      text[] not null default '{}',
  source      text not null default 'admin' check (source in ('admin', 'subscribe')),
  is_new      boolean not null default false,
  created_at  timestamptz not null default now()
);
create table if not exists public.sends (
  id               uuid primary key default gen_random_uuid(),
  letter_id        text,
  subject          text not null,
  message          text not null default '',
  recipient_count  int  not null default 0,
  sent_count       int  not null default 0,
  status           text not null default 'sent',
  error            text,
  created_at       timestamptz not null default now()
);
alter table public.contact_groups enable row level security;
alter table public.contacts       enable row level security;
alter table public.sends          enable row level security;

drop policy if exists "admin groups" on public.contact_groups;
create policy "admin groups" on public.contact_groups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin contacts" on public.contacts;
create policy "admin contacts" on public.contacts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "admin sends" on public.sends;
create policy "admin sends" on public.sends
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.contact_groups, public.contacts, public.sends to authenticated;
revoke all on public.contact_groups, public.contacts, public.sends from anon;

-- Public "새 소식 받기" form: can add an address, can never read the list.
create or replace function public.subscribe(p_name text, p_email text)
returns void
language plpgsql security definer set search_path = public
as $$
declare e text := lower(btrim(p_email));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(e) > 200 then
    raise exception 'invalid email';
  end if;
  insert into public.contacts (name, email, source, is_new, groups)
  values (left(btrim(coalesce(p_name, '')), 60), e, 'subscribe', true, '{}')
  on conflict (email) do nothing;
end;
$$;
revoke all on function public.subscribe(text, text) from public;
grant execute on function public.subscribe(text, text) to anon, authenticated;

-- ============================================================
-- Photo storage: public read, admin upload
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
drop policy if exists "media admin insert" on storage.objects;
create policy "media admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());
