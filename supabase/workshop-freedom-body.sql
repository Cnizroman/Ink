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
