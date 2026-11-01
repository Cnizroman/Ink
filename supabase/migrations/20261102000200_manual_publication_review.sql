-- Manual pre-publication review. Apply once in Supabase SQL Editor (transactional,
-- rerunnable). Existing non-admin stories are withheld and queued, never deleted.
begin;
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
   (w.author_id=auth.uid() or (w.moderation_status='approved' and chapters.status='published'))));

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
commit;
