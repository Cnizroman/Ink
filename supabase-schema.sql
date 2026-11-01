-- ============================================================
-- Nobody came · Review Archive · Supabase schema
-- Run this entire file once in Supabase SQL Editor.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.review_admins (
  email text primary key check (length(trim(email)) > 3)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  book_id text not null check (book_id in ('book1','book2','book3','book4','belaya-golova')),
  name text not null default 'Анонимный читатель',
  text text not null check (length(trim(text)) between 1 and 3000),
  plot smallint not null check (plot between 0 and 5),
  characters smallint not null check (characters between 0 and 4),
  atmosphere smallint not null check (atmosphere between 0 and 4),
  style smallint not null check (style between 0 and 4),
  emotion smallint not null check (emotion between 0 and 4),
  total integer generated always as (plot + characters + atmosphere + style + emotion) stored,
  status text not null default 'PENDING' check (status in ('PENDING','PUBLISHED','REJECTED')),
  created_at timestamptz not null default now()
);

create index if not exists reviews_book_status_created_idx
  on public.reviews(book_id, status, created_at desc);

alter table public.review_admins enable row level security;
alter table public.reviews enable row level security;

create or replace function public.is_review_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.review_admins
    where lower(trim(email)) = lower(coalesce(auth.jwt() ->> 'email',''))
  );
$$;

revoke all on function public.is_review_admin() from public;
grant execute on function public.is_review_admin() to anon, authenticated;

-- Public visitors can read only published reviews.
drop policy if exists "public_read_published_reviews" on public.reviews;
create policy "public_read_published_reviews"
on public.reviews for select
to anon, authenticated
using (status = 'PUBLISHED' or public.is_review_admin());

-- Anyone can submit a review, but it must enter as PENDING.
drop policy if exists "public_submit_pending_reviews" on public.reviews;
create policy "public_submit_pending_reviews"
on public.reviews for insert
to anon, authenticated
with check (status = 'PENDING');

-- Only configured admins can change moderation status/content.
drop policy if exists "admin_update_reviews" on public.reviews;
create policy "admin_update_reviews"
on public.reviews for update
to authenticated
using (public.is_review_admin())
with check (public.is_review_admin());

-- Only configured admins can delete reviews.
drop policy if exists "admin_delete_reviews" on public.reviews;
create policy "admin_delete_reviews"
on public.reviews for delete
to authenticated
using (public.is_review_admin());

-- IMPORTANT:
-- After creating your admin account in Authentication → Users,
-- replace the example email below with your actual admin email and run it.
-- insert into public.review_admins(email) values ('YOUR_ADMIN_EMAIL@example.com')
-- on conflict (email) do nothing;
