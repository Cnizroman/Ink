-- Run this ENTIRE file in Supabase SQL Editor. Requires the existing platform base schema.
-- Adds manual review, story design v2 and real password protection. Safe to rerun.
-- Existing static HTML books are not migrated or secured by this file.
begin;

-- SOURCE: supabase/migrations/20261102000200_manual_publication_review.sql
-- Manual pre-publication review. Apply once in Supabase SQL Editor (transactional,
-- rerunnable). Existing non-admin stories are withheld and queued, never deleted.
alter table public.works add column if not exists moderation_status text;
alter table public.works add column if not exists moderation_note text not null default '';
alter table public.works add column if not exists moderation_revision bigint not null default 1;
alter table public.works add column if not exists submitted_at timestamptz;
alter table public.works add column if not exists reviewed_at timestamptz;
update public.works w set moderation_status=case
 when exists(select 1 from public.profiles p where p.id=w.author_id and p.role='admin') then 'approved'
 when exists(select 1 from public.chapters c where c.work_id=w.id and c.status='published') then 'pending' else 'draft' end
 where moderation_status is null;
alter table public.works alter column moderation_status set default 'draft';
alter table public.works alter column moderation_status set not null;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.works'::regclass and conname='works_moderation_status_check') then
  alter table public.works add constraint works_moderation_status_check check(moderation_status in ('draft','pending','approved','rejected'));
  alter table public.works add constraint works_moderation_note_check check(length(moderation_note)<=2000);
  alter table public.works add constraint works_moderation_revision_check check(moderation_revision>0);
 end if;
end$$;
create index if not exists works_review_queue_idx on public.works(moderation_status,submitted_at);

create or replace function public.guard_work_moderation() returns trigger
 language plpgsql security definer set search_path=public as $$
declare admin boolean:=public.is_platform_admin(); changed boolean;
begin
 if auth.uid() is null then return new; end if;
 if tg_op='INSERT' then
  if not admin and (new.moderation_status not in ('draft','pending') or new.moderation_note<>'' or new.reviewed_at is not null) then
   raise exception 'Одобрить публикацию может только администратор';
  end if;
  new.moderation_revision:=1;
  if admin and new.author_id=auth.uid() then new.moderation_status:='approved'; end if;
 else
  changed := (to_jsonb(new)-array['moderation_status','moderation_note','moderation_revision','submitted_at','reviewed_at','views','created_at','updated_at','featured'])
     is distinct from (to_jsonb(old)-array['moderation_status','moderation_note','moderation_revision','submitted_at','reviewed_at','views','created_at','updated_at','featured']);
  if not admin then
   if (new.moderation_status in ('approved','rejected') and new.moderation_status<>old.moderation_status)
      or new.moderation_note is distinct from old.moderation_note or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Решение модерации меняет только администратор';
   end if;
   if changed then new.moderation_status:='draft'; end if;
  elsif changed and new.author_id=auth.uid() then new.moderation_status:='approved';
  elsif changed then new.moderation_status:='pending'; end if;
  -- Clients cannot reset a revision or approve a stale review by forging it.
  if changed or new.moderation_status<>old.moderation_status or new.moderation_revision<>old.moderation_revision then
   new.moderation_revision:=old.moderation_revision+1;
  else new.moderation_revision:=old.moderation_revision; end if;
 end if;
 if new.moderation_status in ('draft','pending') then
  new.moderation_note:='';new.reviewed_at:=null;
 end if;
 if new.moderation_status='pending' then new.submitted_at:=now();
 elsif new.moderation_status='draft' then new.submitted_at:=null; end if;
 return new;
end$$;
drop trigger if exists works_moderation_guard on public.works;
create trigger works_moderation_guard before insert or update on public.works
 for each row execute function public.guard_work_moderation();

-- Lock parents before changing chapters. A publish, edit, move, reorder or removal
-- of public text invalidates approval. Private draft edits stay private as before.
create or replace function public.review_changed_chapter() returns trigger
 language plpgsql security definer set search_path=public as $$
declare ids uuid[]; w public.works; public_change boolean; target_state text; admin boolean:=public.is_platform_admin();
begin
 if auth.uid() is null then if tg_op='DELETE' then return old; else return new; end if; end if;
 if tg_op='UPDATE' and new is not distinct from old then return new; end if;
 if tg_op='INSERT' then ids:=array[new.work_id];public_change:=new.status='published';target_state:='pending';
 elsif tg_op='DELETE' then ids:=array[old.work_id];public_change:=old.status='published';target_state:='draft';
 else ids:=array[old.work_id,new.work_id];public_change:=new.status='published' or old.status='published';target_state:=case when new.status='published' then 'pending' else 'draft' end;end if;
 for w in select * from public.works where id=any(ids) order by id for update loop
  if not admin and w.author_id<>auth.uid() then raise exception 'Можно изменять только свои главы'; end if;
  update public.works set moderation_revision=moderation_revision+1,
   moderation_status=case when admin and w.author_id=auth.uid() then 'approved'
     when public_change then target_state else moderation_status end
   where id=w.id;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end$$;
drop trigger if exists chapters_require_review on public.chapters;
create trigger chapters_require_review before insert or update or delete on public.chapters
 for each row execute function public.review_changed_chapter();

-- Database enforcement is essential: hiding a Publish button is not moderation.
drop policy if exists works_read on public.works;
create policy works_read on public.works for select to anon,authenticated using
 (moderation_status='approved' or author_id=auth.uid() or public.is_platform_admin());
drop policy if exists chapters_read on public.chapters;
create policy chapters_read on public.chapters for select to anon,authenticated using
 (public.is_platform_admin() or exists(select 1 from public.works w where w.id=work_id and
   (w.author_id=auth.uid() or (w.moderation_status='approved' and chapters.status='published' and not coalesce((to_jsonb(w)->>'password_protected')::boolean,false)))));

create table if not exists public.publication_reviews(
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 moderator_id uuid not null references public.profiles(id),
 decision text not null check(decision in ('approved','rejected')),
 note text not null default '' check(length(note)<=2000),
 revision bigint not null,
 created_at timestamptz not null default now()
);
alter table public.publication_reviews enable row level security;
revoke all on public.publication_reviews from public,anon,authenticated;
grant select on public.publication_reviews to authenticated;
drop policy if exists publication_reviews_read on public.publication_reviews;
create policy publication_reviews_read on public.publication_reviews for select to authenticated using
 (public.is_platform_admin() or exists(select 1 from public.works w where w.id=work_id and w.author_id=auth.uid()));

create or replace function public.submit_work_for_review(p_work_id uuid,p_revision bigint)
 returns public.works language plpgsql security definer set search_path=public as $$
declare w public.works;
begin
 if auth.uid() is null then raise exception 'Войдите в аккаунт'; end if;
 select * into w from public.works where id=p_work_id for update;
 if not found or w.author_id<>auth.uid() then raise exception 'Можно отправлять только свои произведения'; end if;
 if p_revision is null or w.moderation_revision<>p_revision then raise exception 'Текст изменился. Обновите страницу'; end if;
 if not exists(select 1 from public.chapters where work_id=w.id and status='published' and length(trim(body))>0) then
  raise exception 'Подготовьте хотя бы одну главу к публикации'; end if;
 update public.works set moderation_status=case when public.is_platform_admin() then 'approved' else 'pending' end where id=w.id returning * into w;
 return w;
end$$;
create or replace function public.review_publication(p_work_id uuid,p_revision bigint,p_decision text,p_note text default '')
 returns public.works language plpgsql security definer set search_path=public as $$
declare w public.works;
begin
 if auth.uid() is null or not public.is_platform_admin() then raise exception 'Только администратор может проверять публикации'; end if;
 if p_decision is null or p_decision not in ('approved','rejected') or p_note is null or length(p_note)>2000
    or (p_decision='rejected' and length(trim(p_note))=0) then raise exception 'Укажите решение и причину возврата (до 2000 символов)'; end if;
 select * into w from public.works where id=p_work_id for update;
 if not found or w.moderation_status<>'pending' then raise exception 'Заявка больше не ожидает проверки'; end if;
 if p_revision is null or w.moderation_revision<>p_revision then raise exception 'Автор изменил текст. Обновите заявку и прочитайте новую версию'; end if;
 if p_decision='approved' and not exists(select 1 from public.chapters where work_id=w.id and status='published' and length(trim(body))>0) then
  raise exception 'Нет глав для публикации'; end if;
 insert into public.publication_reviews(work_id,moderator_id,decision,note,revision) values(w.id,auth.uid(),p_decision,trim(p_note),w.moderation_revision);
 update public.works set moderation_status=p_decision,moderation_note=case when p_decision='rejected' then trim(p_note) else '' end,reviewed_at=now() where id=w.id returning * into w;
 return w;
end$$;
revoke all on function public.submit_work_for_review(uuid,bigint) from public,anon;
revoke all on function public.review_publication(uuid,bigint,text,text) from public,anon;
grant execute on function public.submit_work_for_review(uuid,bigint),public.review_publication(uuid,bigint,text,text) to authenticated;
-- One MVCC snapshot for text and its revision; separate REST reads could pair
-- old chapter text with a newer parent revision and approve unseen changes.
-- SECURITY INVOKER intentionally retains works/chapters RLS for every caller.
create or replace function public.publication_snapshot() returns jsonb
 language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
  'works',coalesce((select jsonb_agg(w order by w.updated_at desc) from public.works w),'[]'::jsonb),
  'chapters',coalesce((select jsonb_agg(c order by c.sort_order) from public.chapters c),'[]'::jsonb))
$$;
revoke all on function public.publication_snapshot() from public;
grant execute on function public.publication_snapshot() to anon,authenticated;
create or replace function public.moderation_version() returns integer language sql stable as $$select 1$$;
grant execute on function public.moderation_version() to anon,authenticated;

-- SOURCE: supabase/migrations/20261102000300_story_design_passwords.sql
-- Requires manual publication review migration 20261102000200.
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

-- SOURCE: supabase/migrations/20261102000400_story_design_v2.sql
-- Design v2 upgrade. Requires the existing story/password and moderation schema.
-- Only expands typed design validation; does not change RLS, users, passwords or moderation.
do $$begin if to_regprocedure('public.story_studio_version()') is null then raise exception 'Сначала примените STORY_STUDIO_SETUP.sql';end if;end$$;
create or replace function public.valid_reader_style(s jsonb) returns boolean language sql immutable as $$
 select case when jsonb_typeof(s)='object' then coalesce((
 octet_length(s::text)<12000
 and not exists(select 1 from jsonb_object_keys(s) k where k not in ('palette','font','headingFont','align','dropcap','headings','divider','pageLayout','texture','border','shadow','backgroundMode','blockStyle','customBg','customText','customAccent','borderColor','gradientEnd','customDivider','size','leading','width','weight','letterSpacing','paragraphGap','indent','headingScale','pagePaddingX','pagePaddingY','radius','textureStrength','gradientAngle','dividerSize','dividerGap','dividerWidth'))
 and (not s?'palette' or s->>'palette' in ('paper','ink','midnight','forest','plum','terminal','ice','rose','sand','wine','ocean','graphite','custom'))
 and (not s?'font' or s->>'font' in ('serif','sans','mono','literata','lora','pt-serif','merriweather','noto-serif','cormorant-garamond','eb-garamond','playfair-display','pt-sans','open-sans','roboto','noto-sans','rubik','oswald','pt-mono','roboto-slab','jetbrains-mono','comfortaa','caveat','bad-script'))
 and (not s?'headingFont' or s->>'headingFont' in ('inherit','serif','sans','mono','literata','lora','pt-serif','merriweather','noto-serif','cormorant-garamond','eb-garamond','playfair-display','pt-sans','open-sans','roboto','noto-sans','rubik','oswald','pt-mono','roboto-slab','jetbrains-mono','comfortaa','caveat','bad-script'))
 and (not s?'align' or s->>'align' in ('left','justify','center','right'))
 and (not s?'headings' or s->>'headings' in ('classic','minimal','caps','serifline','centered','boxed','underlined','numbered'))
 and (not s?'divider' or s->>'divider' in ('stars','line','diamond','dots','asterisk','flourish','leaf','moon','sun','snow','heart','wave','zigzag','plus','arrow','quill','book','squares','circles','cross','double','dashed','dotted','custom'))
 and (not s?'pageLayout' or s->>'pageLayout' in ('sheet','book','scroll','manuscript','notebook','terminal','letter','archive','poetry','magazine','screenplay','custom'))
 and (not s?'texture' or s->>'texture' in ('none','paper','lines','grid','dots','diagonal','linen','night'))
 and (not s?'border' or s->>'border' in ('none','solid','double','dashed','dotted','accent','corner','inset'))
 and (not s?'shadow' or s->>'shadow' in ('none','soft','deep','flat'))
 and (not s?'backgroundMode' or s->>'backgroundMode' in ('solid','gradient'))
 and (not s?'blockStyle' or s->>'blockStyle' in ('classic','flat','outline','soft','leftbar','rounded'))
 and (not s?'size' or case when jsonb_typeof(s->'size')='number' then (s->>'size')::numeric between 16 and 40 else false end)
 and (not s?'leading' or case when jsonb_typeof(s->'leading')='number' then (s->>'leading')::numeric between 1.2 and 2.4 else false end)
 and (not s?'width' or case when jsonb_typeof(s->'width')='number' then (s->>'width')::numeric between 480 and 1440 else false end)
 and (not s?'weight' or case when jsonb_typeof(s->'weight')='number' then (s->>'weight')::numeric between 400 and 700 else false end)
 and (not s?'letterSpacing' or case when jsonb_typeof(s->'letterSpacing')='number' then (s->>'letterSpacing')::numeric between -0.5 and 1.5 else false end)
 and (not s?'paragraphGap' or case when jsonb_typeof(s->'paragraphGap')='number' then (s->>'paragraphGap')::numeric between 0 and 32 else false end)
 and (not s?'indent' or case when jsonb_typeof(s->'indent')='number' then (s->>'indent')::numeric between 0 and 64 else false end)
 and (not s?'headingScale' or case when jsonb_typeof(s->'headingScale')='number' then (s->>'headingScale')::numeric between 1 and 2.4 else false end)
 and (not s?'pagePaddingX' or case when jsonb_typeof(s->'pagePaddingX')='number' then (s->>'pagePaddingX')::numeric between 12 and 100 else false end)
 and (not s?'pagePaddingY' or case when jsonb_typeof(s->'pagePaddingY')='number' then (s->>'pagePaddingY')::numeric between 12 and 100 else false end)
 and (not s?'radius' or case when jsonb_typeof(s->'radius')='number' then (s->>'radius')::numeric between 0 and 48 else false end)
 and (not s?'textureStrength' or case when jsonb_typeof(s->'textureStrength')='number' then (s->>'textureStrength')::numeric between 0 and 30 else false end)
 and (not s?'gradientAngle' or case when jsonb_typeof(s->'gradientAngle')='number' then (s->>'gradientAngle')::numeric between 0 and 360 else false end)
 and (not s?'dividerSize' or case when jsonb_typeof(s->'dividerSize')='number' then (s->>'dividerSize')::numeric between 12 and 44 else false end)
 and (not s?'dividerGap' or case when jsonb_typeof(s->'dividerGap')='number' then (s->>'dividerGap')::numeric between 12 and 96 else false end)
 and (not s?'dividerWidth' or case when jsonb_typeof(s->'dividerWidth')='number' then (s->>'dividerWidth')::numeric between 40 and 480 else false end)
 and (not s?'customBg' or (s->>'customBg' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'customText' or (s->>'customText' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'customAccent' or (s->>'customAccent' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'borderColor' or (s->>'borderColor' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'gradientEnd' or (s->>'gradientEnd' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'dropcap' or jsonb_typeof(s->'dropcap')='boolean')
 and (not s?'customDivider' or (jsonb_typeof(s->'customDivider')='string' and char_length(s->>'customDivider')<=24 and s->>'customDivider' !~ '[[:cntrl:]]'))
 ),false) else false end
$$;
create or replace function public.story_studio_version() returns integer language sql stable as $$select 2$$;
grant execute on function public.story_studio_version() to anon,authenticated;
notify pgrst, 'reload schema';

-- SOURCE: supabase/migrations/20261102000500_workshop_freedom.sql
-- Author-owned immutable raster/font files, custom genres and freeform typed design.
-- No password, publication or existing RLS function is replaced.
do $$begin if to_regprocedure('public.story_studio_version()') is null then raise exception 'Сначала примените STORY_STUDIO_SETUP.sql';end if;end$$;
create or replace function public.reader_style_v2_snapshot(s jsonb) returns boolean language sql immutable as $$
 select case when jsonb_typeof(s)='object' then coalesce((
 octet_length(s::text)<12000
 and not exists(select 1 from jsonb_object_keys(s) k where k not in ('palette','font','headingFont','align','dropcap','headings','divider','pageLayout','texture','border','shadow','backgroundMode','blockStyle','customBg','customText','customAccent','borderColor','gradientEnd','customDivider','size','leading','width','weight','letterSpacing','paragraphGap','indent','headingScale','pagePaddingX','pagePaddingY','radius','textureStrength','gradientAngle','dividerSize','dividerGap','dividerWidth'))
 and (not s?'palette' or s->>'palette' in ('paper','ink','midnight','forest','plum','terminal','ice','rose','sand','wine','ocean','graphite','custom'))
 and (not s?'font' or s->>'font' in ('serif','sans','mono','literata','lora','pt-serif','merriweather','noto-serif','cormorant-garamond','eb-garamond','playfair-display','pt-sans','open-sans','roboto','noto-sans','rubik','oswald','pt-mono','roboto-slab','jetbrains-mono','comfortaa','caveat','bad-script'))
 and (not s?'headingFont' or s->>'headingFont' in ('inherit','serif','sans','mono','literata','lora','pt-serif','merriweather','noto-serif','cormorant-garamond','eb-garamond','playfair-display','pt-sans','open-sans','roboto','noto-sans','rubik','oswald','pt-mono','roboto-slab','jetbrains-mono','comfortaa','caveat','bad-script'))
 and (not s?'align' or s->>'align' in ('left','justify','center','right'))
 and (not s?'headings' or s->>'headings' in ('classic','minimal','caps','serifline','centered','boxed','underlined','numbered'))
 and (not s?'divider' or s->>'divider' in ('stars','line','diamond','dots','asterisk','flourish','leaf','moon','sun','snow','heart','wave','zigzag','plus','arrow','quill','book','squares','circles','cross','double','dashed','dotted','custom'))
 and (not s?'pageLayout' or s->>'pageLayout' in ('sheet','book','scroll','manuscript','notebook','terminal','letter','archive','poetry','magazine','screenplay','custom'))
 and (not s?'texture' or s->>'texture' in ('none','paper','lines','grid','dots','diagonal','linen','night'))
 and (not s?'border' or s->>'border' in ('none','solid','double','dashed','dotted','accent','corner','inset'))
 and (not s?'shadow' or s->>'shadow' in ('none','soft','deep','flat'))
 and (not s?'backgroundMode' or s->>'backgroundMode' in ('solid','gradient'))
 and (not s?'blockStyle' or s->>'blockStyle' in ('classic','flat','outline','soft','leftbar','rounded'))
 and (not s?'size' or case when jsonb_typeof(s->'size')='number' then (s->>'size')::numeric between 16 and 40 else false end)
 and (not s?'leading' or case when jsonb_typeof(s->'leading')='number' then (s->>'leading')::numeric between 1.2 and 2.4 else false end)
 and (not s?'width' or case when jsonb_typeof(s->'width')='number' then (s->>'width')::numeric between 480 and 1440 else false end)
 and (not s?'weight' or case when jsonb_typeof(s->'weight')='number' then (s->>'weight')::numeric between 400 and 700 else false end)
 and (not s?'letterSpacing' or case when jsonb_typeof(s->'letterSpacing')='number' then (s->>'letterSpacing')::numeric between -0.5 and 1.5 else false end)
 and (not s?'paragraphGap' or case when jsonb_typeof(s->'paragraphGap')='number' then (s->>'paragraphGap')::numeric between 0 and 32 else false end)
 and (not s?'indent' or case when jsonb_typeof(s->'indent')='number' then (s->>'indent')::numeric between 0 and 64 else false end)
 and (not s?'headingScale' or case when jsonb_typeof(s->'headingScale')='number' then (s->>'headingScale')::numeric between 1 and 2.4 else false end)
 and (not s?'pagePaddingX' or case when jsonb_typeof(s->'pagePaddingX')='number' then (s->>'pagePaddingX')::numeric between 12 and 100 else false end)
 and (not s?'pagePaddingY' or case when jsonb_typeof(s->'pagePaddingY')='number' then (s->>'pagePaddingY')::numeric between 12 and 100 else false end)
 and (not s?'radius' or case when jsonb_typeof(s->'radius')='number' then (s->>'radius')::numeric between 0 and 48 else false end)
 and (not s?'textureStrength' or case when jsonb_typeof(s->'textureStrength')='number' then (s->>'textureStrength')::numeric between 0 and 30 else false end)
 and (not s?'gradientAngle' or case when jsonb_typeof(s->'gradientAngle')='number' then (s->>'gradientAngle')::numeric between 0 and 360 else false end)
 and (not s?'dividerSize' or case when jsonb_typeof(s->'dividerSize')='number' then (s->>'dividerSize')::numeric between 12 and 44 else false end)
 and (not s?'dividerGap' or case when jsonb_typeof(s->'dividerGap')='number' then (s->>'dividerGap')::numeric between 12 and 96 else false end)
 and (not s?'dividerWidth' or case when jsonb_typeof(s->'dividerWidth')='number' then (s->>'dividerWidth')::numeric between 40 and 480 else false end)
 and (not s?'customBg' or (s->>'customBg' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'customText' or (s->>'customText' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'customAccent' or (s->>'customAccent' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'borderColor' or (s->>'borderColor' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'gradientEnd' or (s->>'gradientEnd' ~ '^#[0-9a-fA-F]{6}$'))
 and (not s?'dropcap' or jsonb_typeof(s->'dropcap')='boolean')
 and (not s?'customDivider' or (jsonb_typeof(s->'customDivider')='string' and char_length(s->>'customDivider')<=24 and s->>'customDivider' !~ '[[:cntrl:]]'))
 ),false) else false end
$$;
create or replace function public.valid_author_descriptors(a jsonb, p_font boolean) returns boolean language plpgsql immutable as $$
declare v jsonb; seen text[]:='{}';
begin
 if a is null or jsonb_typeof(a)<>'array' or jsonb_array_length(a)>32 then return false;end if;
 for v in select * from jsonb_array_elements(a) loop
  if not coalesce(jsonb_typeof(v)='object' and (v-array['id','label','mime'])='{}'::jsonb and v->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and jsonb_typeof(v->'label')='string' and char_length(v->>'label') between 1 and 80 and (case when p_font then v->>'mime' in ('font/woff2','font/woff','font/ttf','font/otf') else v->>'mime' in ('image/png','image/jpeg','image/webp') end),false) or v->>'id'=any(seen) then return false;end if;
  seen:=array_append(seen,v->>'id');
 end loop;return true;
exception when others then return false;
end$$;
create or replace function public.valid_reader_style(s jsonb) returns boolean language plpgsql immutable as $$
declare b jsonb; fonts jsonb; dividers jsonb; k text;
begin
 if s is null or jsonb_typeof(s)<>'object' or octet_length(s::text)>24000 then return false;end if;
 fonts:=coalesce(s->'customFonts','[]');dividers:=coalesce(s->'customDividers','[]');
 if not public.valid_author_descriptors(fonts,true) or not public.valid_author_descriptors(dividers,false) then return false;end if;
 b:=s-array['customFonts','customDividers'];
 foreach k in array array['font','headingFont'] loop
  if b->>k like 'user:%' then
   if not exists(select 1 from jsonb_array_elements(fonts) a where a->>'id'=substring(b->>k from 6)) then return false;end if;
   b:=jsonb_set(b,array[k],'"serif"');
  end if;
 end loop;
 if b->>'divider' like 'asset:%' then
  if not exists(select 1 from jsonb_array_elements(dividers) a where a->>'id'=substring(b->>'divider' from 7)) then return false;end if;
  b:=jsonb_set(b,'{divider}','"stars"');
 end if;
 return public.reader_style_v2_snapshot(b);
exception when others then return false;
end$$;
create or replace function public.valid_author_asset(p_kind text,p_mime text,p_data text) returns boolean language plpgsql immutable as $$
declare b bytea; prefix text;
begin
 if p_kind not in ('font','cover','divider') or p_mime is null or p_data is null or octet_length(p_data)>2800000 then return false;end if;
 if (p_kind='font' and p_mime not in ('font/woff2','font/woff','font/ttf','font/otf')) or (p_kind<>'font' and p_mime not in ('image/png','image/jpeg','image/webp')) then return false;end if;
 prefix:='data:'||p_mime||';base64,';
 if left(p_data,length(prefix))<>prefix or substring(p_data from length(prefix)+1)!~'^[A-Za-z0-9+/]+={0,2}$' then return false;end if;
 b:=decode(substring(p_data from length(prefix)+1),'base64');
 if octet_length(b)<12 or octet_length(b)>(case when p_kind='font' then 2097152 else 1048576 end) then return false;end if;
 return case p_mime when 'font/woff2' then substring(b from 1 for 4)=decode('774f4632','hex') when 'font/woff' then substring(b from 1 for 4)=decode('774f4646','hex') when 'font/ttf' then substring(b from 1 for 4)=decode('00010000','hex') when 'font/otf' then substring(b from 1 for 4)=decode('4f54544f','hex') when 'image/png' then substring(b from 1 for 8)=decode('89504e470d0a1a0a','hex') when 'image/jpeg' then substring(b from 1 for 3)=decode('ffd8ff','hex') when 'image/webp' then substring(b from 1 for 4)=decode('52494646','hex') and substring(b from 9 for 4)=decode('57454250','hex') else false end;
exception when others then return false;
end$$;
create table if not exists public.author_assets (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('font','cover','divider')),
 label text not null check(length(trim(label)) between 1 and 80),
 mime text not null,
 data text not null,
 created_at timestamptz not null default now(),
 constraint author_asset_safe_data check(public.valid_author_asset(kind,mime,data))
);
create index if not exists author_assets_owner_idx on public.author_assets(owner_id,created_at);
alter table public.author_assets enable row level security;
revoke all on public.author_assets from anon,authenticated;
grant select on public.author_assets to authenticated;
drop policy if exists author_assets_owner_read on public.author_assets;
create policy author_assets_owner_read on public.author_assets for select to authenticated using(owner_id=auth.uid() or public.is_platform_admin());
create or replace function public.put_author_asset(p_asset jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); r public.author_assets; n integer; size bigint;
begin
 if u is null then raise exception 'Войдите в аккаунт';end if;
 if not coalesce(jsonb_typeof(p_asset)='object' and (p_asset-array['id','kind','label','mime','data'])='{}'::jsonb and p_asset->>'id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' and public.valid_author_asset(p_asset->>'kind',p_asset->>'mime',p_asset->>'data'),false) then raise exception 'Недопустимый авторский файл';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 select count(*),coalesce(sum(octet_length(data)),0) into n,size from public.author_assets where owner_id=u;
 if n>=64 or size+octet_length(p_asset->>'data')>33554432 then raise exception 'Лимит файлов: 64 файла / 32 МБ на аккаунт. Удалите неиспользуемые файлы';end if;
 insert into public.author_assets(id,owner_id,kind,label,mime,data) values((p_asset->>'id')::uuid,u,p_asset->>'kind',p_asset->>'label',p_asset->>'mime',p_asset->>'data') returning * into r;
 return to_jsonb(r)-'data'-'owner_id';
end$$;
revoke all on function public.put_author_asset(jsonb) from public,anon;
grant execute on function public.put_author_asset(jsonb) to authenticated;
-- Internal reference graph includes legacy founder covers and explicit in-chapter dividers.
create or replace function ink_private.author_asset_refs(p_work_id text,p_drafts boolean default false) returns setof uuid language sql stable security definer set search_path=public as $$
 with w as (select * from public.works where id::text=p_work_id),
 styles as (select reader_style from w),
 covers as (select cover from w union all select settings->'cover' from public.founder_work_settings where work_id=p_work_id),
 ids as (
  select cover->>'imageAsset' as id from covers
  union all select a->>'id' from styles cross join lateral jsonb_array_elements(coalesce(reader_style->'customFonts','[]')) a
  union all select a->>'id' from styles cross join lateral jsonb_array_elements(coalesce(reader_style->'customDividers','[]')) a
  union all select m[1] from public.chapters c cross join lateral regexp_matches(c.body,'---\{asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}','g') m where c.work_id::text=p_work_id and (p_drafts or c.status='published')
 ) select distinct id::uuid from ids where id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
revoke all on function ink_private.author_asset_refs(text,boolean) from public,anon,authenticated;
create or replace function public.get_work_author_assets(p_work_id text,p_password text default null,p_cover_only boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare w public.works; own boolean; c jsonb; result jsonb; permitted jsonb; legacy_owner uuid;
begin
 if p_work_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
  select * into w from public.works where id::text=p_work_id for update;
  if not found then return '[]';end if;
  own:=coalesce(w.author_id=auth.uid(),false) or public.is_platform_admin();
  if not own and w.moderation_status<>'approved' then return '[]';end if;
  if not p_cover_only and not own and public.story_has_password(w.id) then
   permitted:=public.read_locked_story(w.id,p_password);
   -- Return (never raise) so failed-password rate limiting is committed.
   if permitted?'error' then return '[]';end if;
  end if;
  c:=w.cover;
 else
  select author_id,settings->'cover' into legacy_owner,c from public.founder_work_settings where work_id=p_work_id;
  if not found then return '[]';end if;own:=coalesce(legacy_owner=auth.uid(),false) or public.is_platform_admin();
  -- The existing founder settings policy deliberately exposes these legacy covers.
 end if;
 select coalesce(jsonb_agg(to_jsonb(a)-'owner_id'-'created_at'),'[]') into result from public.author_assets a where
 (case when p_cover_only then a.id::text=c->>'imageAsset' and a.kind='cover' else a.id in (select ink_private.author_asset_refs(p_work_id,own)) and (a.id::text=c->>'imageAsset' or a.id::text=substring(w.reader_style->>'font' from 6) or a.id::text=substring(w.reader_style->>'headingFont' from 6) or a.id::text=substring(w.reader_style->>'divider' from 7) or exists(select 1 from public.chapters ch where ch.work_id=w.id and (own or ch.status='published') and position('---{asset:'||a.id::text||'}' in ch.body)>0)) end);
 return result;
end$$;
revoke all on function public.get_work_author_assets(text,text,boolean) from public;
grant execute on function public.get_work_author_assets(text,text,boolean) to anon,authenticated;
-- Only immutable assets owned by the story's author can be attached. Thus new artwork
-- cannot silently change after a moderator has approved an unchanged reference.
create or replace function public.guard_author_asset_references() returns trigger language plpgsql security definer set search_path=public as $$
declare v jsonb; c jsonb; expected_owner uuid; expected_kind text; k text; found_id text;
begin
 if tg_table_name='works' then
  expected_owner:=new.author_id;c:=new.cover;
  if tg_op='UPDATE' and (jsonb_array_length(coalesce(old.reader_style->'customFonts','[]'))>0 or jsonb_array_length(coalesce(old.reader_style->'customDividers','[]'))>0) and not (new.reader_style?'customFonts' and new.reader_style?'customDividers') then raise exception 'Редактор устарел. Обновите страницу через Ctrl+Shift+R, чтобы не потерять свои файлы';end if;
  if not public.valid_reader_style(new.reader_style) then raise exception using errcode='23514',message='works_reader_style_check: Некорректное оформление';end if;
  perform pg_advisory_xact_lock(hashtextextended(expected_owner::text,0));
  foreach k in array array['customFonts','customDividers'] loop
   expected_kind:=case when k='customFonts' then 'font' else 'divider' end;
   for v in select * from jsonb_array_elements(coalesce(new.reader_style->k,'[]')) loop
    if not exists(select 1 from public.author_assets a where a.id::text=v->>'id' and a.owner_id=expected_owner and a.kind=expected_kind and a.mime=v->>'mime') then raise exception 'Файл оформления не принадлежит автору или имеет другой тип';end if;
   end loop;
  end loop;
 elsif tg_table_name='founder_work_settings' then expected_owner:=new.author_id;c:=new.settings->'cover';
 else
  select author_id into expected_owner from public.works where id=new.work_id;
  perform pg_advisory_xact_lock(hashtextextended(expected_owner::text,0));
  for found_id in select m[1] from regexp_matches(new.body,'---\{asset:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}','g') m loop
   if not exists(select 1 from public.author_assets a where a.id::text=found_id and a.owner_id=expected_owner and a.kind='divider') then raise exception 'Разделитель не принадлежит автору';end if;
  end loop;return new;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(expected_owner::text,0));
 if c?'imageAsset' then
  if not exists(select 1 from public.author_assets a where a.id::text=c->>'imageAsset' and a.owner_id=expected_owner and a.kind='cover') then raise exception 'Обложка не принадлежит автору';end if;
 end if;return new;
end$$;
drop trigger if exists works_author_files_guard on public.works;
create trigger works_author_files_guard before insert or update on public.works for each row execute function public.guard_author_asset_references();
drop trigger if exists chapters_author_files_guard on public.chapters;
create trigger chapters_author_files_guard before insert or update on public.chapters for each row execute function public.guard_author_asset_references();
drop trigger if exists founder_author_files_guard on public.founder_work_settings;
create trigger founder_author_files_guard before insert or update on public.founder_work_settings for each row execute function public.guard_author_asset_references();
create or replace function public.delete_author_asset(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid();
begin
 if u is null or not exists(select 1 from public.author_assets where id=p_id and owner_id=u) then raise exception 'Можно удалить только свой файл';end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from public.works w where w.author_id=u and p_id in (select ink_private.author_asset_refs(w.id::text,true))) or exists(select 1 from public.founder_work_settings f where f.author_id=u and p_id in (select ink_private.author_asset_refs(f.work_id,true))) then raise exception 'Файл используется в произведении. Сначала удалите его из оформления и текста и сохраните произведение';end if;
 delete from public.author_assets where id=p_id and owner_id=u;
end$$;
revoke all on function public.delete_author_asset(uuid) from public,anon;
grant execute on function public.delete_author_asset(uuid) to authenticated;
create or replace function public.story_studio_version() returns integer language sql stable as $$select 3$$;
grant execute on function public.story_studio_version() to anon,authenticated;
notify pgrst, 'reload schema';

commit;
