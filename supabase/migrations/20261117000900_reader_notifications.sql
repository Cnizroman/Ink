-- Private, account-scoped reader data and in-site notifications. No passwords,
-- plaintext of protected works, or unpublished text are stored in reader data.
-- This additive migration does not change publication or moderation policies.
begin;

create table if not exists public.reader_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  work_ids text[] not null default '{}' check (cardinality(work_ids) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists reader_collections_user_idx on public.reader_collections(user_id,created_at);
alter table public.reader_collections enable row level security;
revoke all on public.reader_collections from public,anon,authenticated;
grant select,insert,update,delete on public.reader_collections to authenticated;
drop policy if exists reader_collections_owner on public.reader_collections;
create policy reader_collections_owner on public.reader_collections for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.reader_bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id text not null check (length(work_id) between 1 and 128),
  chapter_id text not null check (length(chapter_id) between 1 and 128),
  block_index integer not null check(block_index between 0 and 100000),
  created_at timestamptz not null default now(),
  unique(user_id, work_id, chapter_id, block_index)
);
create index if not exists reader_bookmarks_user_idx on public.reader_bookmarks(user_id,created_at desc);
alter table public.reader_bookmarks enable row level security;
revoke all on public.reader_bookmarks from public,anon,authenticated;
grant select,insert,delete on public.reader_bookmarks to authenticated;
drop policy if exists reader_bookmarks_owner on public.reader_bookmarks;
create policy reader_bookmarks_owner on public.reader_bookmarks for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table if not exists public.ink_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('review_pending','review_approved','review_rejected','comment','publication')),
  work_id uuid not null references public.works(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists ink_notifications_recipient_idx on public.ink_notifications(recipient_id,created_at desc);
alter table public.ink_notifications enable row level security;
revoke all on public.ink_notifications from public,anon,authenticated;
grant select on public.ink_notifications to authenticated;
drop policy if exists ink_notifications_own_read on public.ink_notifications;
create policy ink_notifications_own_read on public.ink_notifications for select to authenticated using(recipient_id=auth.uid());

create table if not exists public.ink_notification_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  moderation boolean not null default true,
  comments boolean not null default true,
  publications boolean not null default true
);
alter table public.ink_notification_settings enable row level security;
revoke all on public.ink_notification_settings from public,anon,authenticated;
grant select,insert,update on public.ink_notification_settings to authenticated;
drop policy if exists ink_notification_settings_owner on public.ink_notification_settings;
create policy ink_notification_settings_owner on public.ink_notification_settings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create or replace function public.ink_mark_notification_read(p_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт'; end if;
 update public.ink_notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=auth.uid();
end$$;
revoke all on function public.ink_mark_notification_read(uuid) from public,anon;
grant execute on function public.ink_mark_notification_read(uuid) to authenticated;

create or replace function public.ink_notify_work_status() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.moderation_status is not distinct from old.moderation_status then return new; end if;
 if new.moderation_status='pending' then
  insert into public.ink_notifications(recipient_id,kind,work_id)
  select p.id,'review_pending',new.id from public.profiles p
  left join public.ink_notification_settings s on s.user_id=p.id
  where p.role='admin' and p.id<>new.author_id and coalesce(s.moderation,true);
 elsif old.moderation_status='pending' and new.moderation_status in ('approved','rejected') then
  insert into public.ink_notifications(recipient_id,kind,work_id)
  select new.author_id,case when new.moderation_status='approved' then 'review_approved' else 'review_rejected' end,new.id
  where coalesce((select moderation from public.ink_notification_settings where user_id=new.author_id),true);
 end if;
 if new.moderation_status='approved' and old.moderation_status='pending' then
  insert into public.ink_notifications(recipient_id,kind,work_id)
  select f.follower_id,'publication',new.id from public.follows f
  left join public.ink_notification_settings s on s.user_id=f.follower_id
  where f.author_id=new.author_id and coalesce(s.publications,true);
 end if;
 return new;
end$$;
revoke all on function public.ink_notify_work_status() from public,anon,authenticated;
drop trigger if exists ink_work_status_notification on public.works;
create trigger ink_work_status_notification after update of moderation_status on public.works
for each row execute function public.ink_notify_work_status();

create or replace function public.ink_notify_comment() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid;
begin
 select author_id into owner_id from public.works where id=new.work_id;
 if owner_id is not null and owner_id<>new.user_id and coalesce((select comments from public.ink_notification_settings where user_id=owner_id),true) then
  insert into public.ink_notifications(recipient_id,kind,work_id) values(owner_id,'comment',new.work_id);
 end if;
 return new;
end$$;
revoke all on function public.ink_notify_comment() from public,anon,authenticated;
drop trigger if exists ink_comment_notification on public.comments;
create trigger ink_comment_notification after insert on public.comments for each row execute function public.ink_notify_comment();

create or replace function public.ink_notify_published_chapter() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare w public.works;
begin
 if new.status<>'published' or (tg_op='UPDATE' and old.status='published') then return new; end if;
 select * into w from public.works where id=new.work_id;
 -- Moderated works notify followers at approval, not while content is pending.
 if w.moderation_status='approved' then
  insert into public.ink_notifications(recipient_id,kind,work_id)
  select f.follower_id,'publication',w.id from public.follows f
  left join public.ink_notification_settings s on s.user_id=f.follower_id
  where f.author_id=w.author_id and coalesce(s.publications,true);
 end if;
 return new;
end$$;
revoke all on function public.ink_notify_published_chapter() from public,anon,authenticated;
drop trigger if exists ink_chapter_notification on public.chapters;
create trigger ink_chapter_notification after insert or update of status on public.chapters for each row execute function public.ink_notify_published_chapter();
-- Versions belong only to the author and never publish a chapter themselves.
create table if not exists public.workshop_versions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 work_id uuid not null references public.works(id) on delete cascade,
 chapter_id uuid not null references public.chapters(id) on delete cascade,
 title text not null default '' check(length(title)<=160),
 body text not null default '' check(length(body)<=400000),
 notes text not null default '' check(length(notes)<=10000),
 reader_style jsonb not null default '{}'::jsonb,
 label text not null default '' check(length(label)<=100),
 created_at timestamptz not null default now()
);
create index if not exists workshop_versions_chapter_idx on public.workshop_versions(user_id,chapter_id,created_at desc);
alter table public.workshop_versions enable row level security;
revoke all on public.workshop_versions from public,anon,authenticated;
grant select,insert,delete on public.workshop_versions to authenticated;
drop policy if exists workshop_versions_owner on public.workshop_versions;
create policy workshop_versions_owner on public.workshop_versions for all to authenticated
using(user_id=auth.uid() and exists(select 1 from public.works w where w.id=workshop_versions.work_id and w.author_id=auth.uid()))
with check(user_id=auth.uid() and exists(select 1 from public.works w join public.chapters c on c.work_id=w.id where w.id=workshop_versions.work_id and c.id=workshop_versions.chapter_id and w.author_id=auth.uid()));
commit;
