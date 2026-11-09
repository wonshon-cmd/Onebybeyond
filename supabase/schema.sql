-- ONE TO BEYOND · 마음 나눔 (comments) schema
-- Supabase → SQL Editor → New query → paste all → Run.

create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;
-- No policies on admins: browsers can never read or change this list.

-- 비공개 글을 볼 수 있는 관리자(선교사 가정) 이메일. 실제 Google 계정 주소로 바꿔서 실행하세요.
-- insert into public.admins (email) values ('family@example.com');

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

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admins where lower(email) = lower(auth.jwt() ->> 'email'));
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

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
