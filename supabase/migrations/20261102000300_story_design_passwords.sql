-- Requires manual publication review migration 20261102000200.
begin;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$begin if to_regprocedure('public.moderation_version()') is null then raise exception 'Сначала примените миграцию ручной модерации';end if;end$$;
alter table public.works add column if not exists reader_style jsonb not null default '{}';
alter table public.works add column if not exists password_protected boolean not null default false;
create or replace function public.valid_reader_style(s jsonb) returns boolean language sql immutable as $$
 select case when jsonb_typeof(s)='object' then coalesce((octet_length(s::text)<2000
 and not exists(select 1 from jsonb_object_keys(s) k where k not in ('palette','font','size','leading','width','align','dropcap','headings','divider'))
 and (not s?'palette' or s->>'palette' in ('paper','ink','midnight','forest','plum','terminal'))
 and (not s?'font' or s->>'font' in ('serif','sans','mono'))
 and (not s?'align' or s->>'align' in ('left','justify'))
 and (not s?'headings' or s->>'headings' in ('classic','minimal','caps'))
 and (not s?'divider' or s->>'divider' in ('stars','line','diamond'))
 and (not s?'dropcap' or jsonb_typeof(s->'dropcap')='boolean')
 and (not s?'size' or case when jsonb_typeof(s->'size')='number' then (s->>'size')::numeric between 16 and 28 else false end)
 and (not s?'leading' or case when jsonb_typeof(s->'leading')='number' then (s->>'leading')::numeric between 1.4 and 2.2 else false end)
 and (not s?'width' or case when jsonb_typeof(s->'width')='number' then (s->>'width')::numeric between 560 and 960 else false end)),false) else false end
$$;
do $$begin if not exists(select 1 from pg_constraint where conrelid='public.works'::regclass and conname='works_reader_style_check') then
 alter table public.works add constraint works_reader_style_check check(public.valid_reader_style(reader_style));end if;end$$;
create schema if not exists ink_private;
revoke all on schema ink_private from public,anon,authenticated;
create table if not exists ink_private.story_passwords(work_id uuid primary key references public.works(id) on delete cascade,password_hash text not null);
create table if not exists ink_private.story_attempts(work_id uuid primary key references public.works(id) on delete cascade,attempts integer not null default 0,reset_at timestamptz not null default now()+interval '5 minutes');
alter table ink_private.story_passwords enable row level security;
alter table ink_private.story_attempts enable row level security;
revoke all on all tables in schema ink_private from public,anon,authenticated;
create or replace function public.story_has_password(p_work_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from ink_private.story_passwords k join public.works w on w.id=k.work_id where k.work_id=p_work_id
  and (w.moderation_status='approved' or w.author_id=auth.uid() or public.is_platform_admin()))
$$;
revoke all on function public.story_has_password(uuid) from public;
grant execute on function public.story_has_password(uuid) to anon,authenticated;
create or replace function public.guard_story_access_flag() returns trigger language plpgsql as $$
begin
 if auth.uid() is not null and pg_trigger_depth()=1 and ((tg_op='INSERT' and new.password_protected) or (tg_op='UPDATE' and new.password_protected is distinct from old.password_protected)) then
 raise exception 'Пароль изменяется только через настройки доступа';end if;return new;
end$$;
drop trigger if exists works_access_guard on public.works;
create trigger works_access_guard before insert or update on public.works for each row execute function public.guard_story_access_flag();
create or replace function public.sync_story_access_flag() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_op='DELETE' then update public.works set password_protected=false,moderation_revision=moderation_revision+1 where id=old.work_id;return old;end if;
 update public.works set password_protected=true,moderation_revision=moderation_revision+1 where id=new.work_id;return new;
end$$;
drop trigger if exists story_password_changed on ink_private.story_passwords;
create trigger story_password_changed after insert or update or delete on ink_private.story_passwords for each row execute function public.sync_story_access_flag();
create or replace function public.set_story_password(p_work_id uuid,p_password text default null) returns jsonb
 language plpgsql security definer set search_path=public,extensions as $$
declare w public.works;
begin
 select * into w from public.works where id=p_work_id for update;
 if auth.uid() is null or not found or w.author_id<>auth.uid() then raise exception 'Пароль может изменить только автор истории';end if;
 if p_password is null then delete from ink_private.story_passwords where work_id=w.id;
 else
  if length(p_password)<8 or octet_length(p_password)>72 then raise exception 'Пароль: минимум 8 символов, не более 72 байт UTF-8';end if;
  insert into ink_private.story_passwords(work_id,password_hash) values(w.id,crypt(p_password,gen_salt('bf',10)))
   on conflict(work_id) do update set password_hash=excluded.password_hash;
 end if;
 delete from ink_private.story_attempts where work_id=w.id;
 return (select to_jsonb(x) from public.works x where id=w.id);
end$$;
revoke all on function public.set_story_password(uuid,text) from public,anon;
grant execute on function public.set_story_password(uuid,text) to authenticated;
-- No grant/cookie/header can turn a raw chapter SELECT into a public password bypass.
drop policy if exists chapters_read on public.chapters;
create policy chapters_read on public.chapters for select to anon,authenticated using
 (public.is_platform_admin() or exists(select 1 from public.works w where w.id=work_id and
  (w.author_id=auth.uid() or (w.moderation_status='approved' and chapters.status='published' and not public.story_has_password(w.id)))));
create or replace function public.read_locked_story(p_work_id uuid,p_password text) returns jsonb
 language plpgsql security definer set search_path=public,extensions as $$
declare w public.works; h text; n integer;
begin
 -- Lock serializes password attempts and password changes. A failed password returns
 -- JSON, not an exception: otherwise the throttle update would roll back.
 select * into w from public.works where id=p_work_id for update;
 if not found or (w.moderation_status<>'approved' and not (coalesce(w.author_id=auth.uid(),false) or public.is_platform_admin())) then return jsonb_build_object('error','not_found');end if;
 if not (coalesce(w.author_id=auth.uid(),false) or public.is_platform_admin()) then
  select password_hash into h from ink_private.story_passwords where work_id=w.id;
  if h is null then return jsonb_build_object('error','not_locked');end if;
  insert into ink_private.story_attempts as a(work_id,attempts,reset_at) values(w.id,1,now()+interval '5 minutes')
   on conflict(work_id) do update set attempts=case when a.reset_at<=now() then 1 else least(a.attempts+1,61) end,reset_at=case when a.reset_at<=now() then now()+interval '5 minutes' else a.reset_at end returning attempts into n;
  if n>60 then return jsonb_build_object('error','rate_limit');end if;
  if p_password is null or octet_length(p_password)>72 or crypt(p_password,h)<>h then return jsonb_build_object('error','incorrect_password');end if;
  delete from ink_private.story_attempts where work_id=w.id;
 end if;
 return jsonb_build_object('work',to_jsonb(w),'chapters',coalesce((select jsonb_agg(c order by sort_order) from public.chapters c where work_id=w.id and status='published'),'[]'::jsonb));
end$$;
revoke all on function public.read_locked_story(uuid,text) from public;
grant execute on function public.read_locked_story(uuid,text) to anon,authenticated;
create or replace function public.story_studio_version() returns integer language sql stable as $$select 1$$;
grant execute on function public.story_studio_version() to anon,authenticated;
notify pgrst, 'reload schema';
commit;
