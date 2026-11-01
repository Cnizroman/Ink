-- ============================================================
-- ЧЕРНИЛА · Полная схема платформы для авторов · Supabase
-- Выполнить ОДНИМ запуском в Supabase SQL Editor.
-- Старая таблица reviews (рецензии книг Cnizroman) не трогается:
-- reviews-admin.html продолжит работать. Новые рецензии
-- платформы живут в work_reviews с той же системой баллов:
-- сюжет 0–5, персонажи/атмосфера/стиль/эмоции 0–4, итого 21.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Профили авторов ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,30}$'),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  bio text not null default '' check (length(bio) <= 1200),
  motto text not null default '' check (length(motto) <= 160),
  location text not null default '' check (length(location) <= 80),
  avatar_hue int not null default 38 check (avatar_hue between 0 and 360),
  role text not null default 'author' check (role in ('author','admin')),
  is_founder boolean not null default false,
  badges text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Произведения ----------
create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 140),
  subtitle text not null default '' check (length(subtitle) <= 160),
  type text not null check (type in ('novel','story','novella','poetry','essay','collection','fanfic','play','diary')),
  genre text not null check (length(trim(genre)) between 1 and 60),
  tags text[] not null default '{}',
  description text not null default '' check (length(description) <= 2000),
  status text not null default 'ongoing' check (status in ('completed','ongoing','frozen')),
  age_rating text not null default '12+' check (age_rating in ('0+','6+','12+','16+','18+')),
  legacy_url text,
  featured boolean not null default false,
  views bigint not null default 0,
  cover jsonb not null default '{"from":"#2b2113","to":"#c8a96e","symbol":"✦"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists works_author_idx on public.works(author_id);
create index if not exists works_updated_idx on public.works(updated_at desc);
create index if not exists works_genre_type_idx on public.works(genre, type);

-- ---------- Главы ----------
create table if not exists public.chapters (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  body text not null default '' check (length(body) <= 400000),
  sort_order int not null default 1,
  status text not null default 'published' check (status in ('published','draft')),
  views bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists chapters_work_order_idx on public.chapters(work_id, sort_order);

-- ---------- Комментарии ----------
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  chapter_id uuid references public.chapters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default 'Читатель',
  text text not null check (length(trim(text)) between 1 and 1500),
  created_at timestamptz not null default now()
);
create index if not exists comments_work_idx on public.comments(work_id, created_at desc);

-- ---------- Рецензии (система 21 балла) ----------
create table if not exists public.work_reviews (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default 'Читатель',
  text text not null check (length(trim(text)) between 1 and 3000),
  plot smallint not null check (plot between 0 and 5),
  characters smallint not null check (characters between 0 and 4),
  atmosphere smallint not null check (atmosphere between 0 and 4),
  style smallint not null check (style between 0 and 4),
  emotion smallint not null check (emotion between 0 and 4),
  total int generated always as (plot + characters + atmosphere + style + emotion) stored,
  created_at timestamptz not null default now(),
  unique (work_id, user_id)
);
create index if not exists work_reviews_work_idx on public.work_reviews(work_id, created_at desc);

-- ---------- Лайки / полки / подписки ----------
create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);
create table if not exists public.shelves (
  user_id uuid not null references public.profiles(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  shelf text not null check (shelf in ('want','reading','done','fav')),
  created_at timestamptz not null default now(),
  primary key (user_id, work_id)
);
create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, author_id),
  check (follower_id <> author_id)
);

-- ---------- Конкурсы ----------
create table if not exists public.contests (
  id uuid primary key default gen_random_uuid(),
  title text not null, theme text not null default '',
  description text not null default '', prize text not null default '',
  deadline date, status text not null default 'open' check (status in ('open','soon','closed')),
  created_at timestamptz not null default now()
);
create table if not exists public.contest_entries (
  id uuid primary key default gen_random_uuid(),
  contest_id uuid not null references public.contests(id) on delete cascade,
  work_id uuid not null references public.works(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contest_id, work_id)
);

-- ---------- Служебное: updated_at, просмотры, админ ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists works_touch on public.works;
create trigger works_touch before update on public.works for each row execute function public.touch_updated_at();
drop trigger if exists chapters_touch on public.chapters;
create trigger chapters_touch before update on public.chapters for each row execute function public.touch_updated_at();

create or replace function public.increment_work_views(p_work_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.works set views = views + 1 where id = p_work_id;
$$;
revoke all on function public.increment_work_views(uuid) from public;
grant execute on function public.increment_work_views(uuid) to anon, authenticated;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to anon, authenticated;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.works enable row level security;
alter table public.chapters enable row level security;
alter table public.comments enable row level security;
alter table public.work_reviews enable row level security;
alter table public.likes enable row level security;
alter table public.shelves enable row level security;
alter table public.follows enable row level security;
alter table public.contests enable row level security;
alter table public.contest_entries enable row level security;

-- профили: читать всем, менять только свой (админ — любой)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to anon, authenticated using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_platform_admin()) with check (id = auth.uid() or public.is_platform_admin());

-- произведения: читать всем, писать свои
drop policy if exists works_read on public.works;
create policy works_read on public.works for select to anon, authenticated using (true);
drop policy if exists works_insert on public.works;
create policy works_insert on public.works for insert to authenticated with check (author_id = auth.uid());
drop policy if exists works_update on public.works;
create policy works_update on public.works for update to authenticated
  using (author_id = auth.uid() or public.is_platform_admin()) with check (author_id = auth.uid() or public.is_platform_admin());
drop policy if exists works_delete on public.works;
create policy works_delete on public.works for delete to authenticated using (author_id = auth.uid() or public.is_platform_admin());

-- главы: опубликованные видны всем, черновики — автору и админу
drop policy if exists chapters_read on public.chapters;
create policy chapters_read on public.chapters for select to anon, authenticated
  using (status = 'published' or public.is_platform_admin()
         or exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));
drop policy if exists chapters_insert on public.chapters;
create policy chapters_insert on public.chapters for insert to authenticated
  with check (exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));
drop policy if exists chapters_update on public.chapters;
create policy chapters_update on public.chapters for update to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()))
  with check (public.is_platform_admin() or exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));
drop policy if exists chapters_delete on public.chapters;
create policy chapters_delete on public.chapters for delete to authenticated
  using (public.is_platform_admin() or exists (select 1 from public.works w where w.id = work_id and w.author_id = auth.uid()));

-- комментарии и рецензии: читать всем, писать авторизованным от себя, удалять свои/админ
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to anon, authenticated using (true);
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete to authenticated using (user_id = auth.uid() or public.is_platform_admin());

drop policy if exists reviews_read on public.work_reviews;
create policy reviews_read on public.work_reviews for select to anon, authenticated using (true);
drop policy if exists reviews_insert on public.work_reviews;
create policy reviews_insert on public.work_reviews for insert to authenticated with check (user_id = auth.uid());
drop policy if exists reviews_update on public.work_reviews;
create policy reviews_update on public.work_reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists reviews_delete on public.work_reviews;
create policy reviews_delete on public.work_reviews for delete to authenticated using (user_id = auth.uid() or public.is_platform_admin());

-- лайки: счёт виден всем, строки только свои действия
drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes for select to anon, authenticated using (true);
drop policy if exists likes_insert on public.likes;
create policy likes_insert on public.likes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists likes_delete on public.likes;
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

-- полки: только владелец
drop policy if exists shelves_all on public.shelves;
create policy shelves_all on public.shelves for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- подписки
drop policy if exists follows_read on public.follows;
create policy follows_read on public.follows for select to anon, authenticated using (true);
drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

-- конкурсы: читать всем, управлять админу; заявки — свои
drop policy if exists contests_read on public.contests;
create policy contests_read on public.contests for select to anon, authenticated using (true);
drop policy if exists contests_admin on public.contests;
create policy contests_admin on public.contests for all to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists entries_read on public.contest_entries;
create policy entries_read on public.contest_entries for select to anon, authenticated using (true);
drop policy if exists entries_insert on public.contest_entries;
create policy entries_insert on public.contest_entries for insert to authenticated with check (user_id = auth.uid());
drop policy if exists entries_delete on public.contest_entries;
create policy entries_delete on public.contest_entries for delete to authenticated using (user_id = auth.uid() or public.is_platform_admin());

-- ---------- Рейтинг произведений (представление) ----------
create or replace view public.work_ratings as
select w.id as work_id, count(r.id) as reviews_count,
       round(avg(r.total)::numeric, 2) as avg_total,
       round((avg(r.total) / 21.0 * 10)::numeric, 2) as rating_10
from public.works w left join public.work_reviews r on r.work_id = w.id
group by w.id;

-- Профили создаются без привилегий. Основателя назначает владелец в SQL Editor.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_username text; v_name text;
begin
  v_username := lower(coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email,''),'@',1)));
  v_username := regexp_replace(v_username, '[^a-z0-9_]', '', 'g');
  if length(v_username) < 3 then v_username := 'author_' || substr(new.id::text, 1, 8); end if;
  while exists (select 1 from public.profiles where username = v_username) loop
    v_username := v_username || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), v_username);
  insert into public.profiles (id, username, display_name, role, is_founder, badges)
  values (
    new.id, v_username, v_name,
    'author', false, array['Новый автор']
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- OAuth связывание требует подтверждённой почты. Не помечаем произвольный
-- email подтверждённым автоматически; включите Confirm email в Supabase Auth.
drop trigger if exists on_auth_user_auto_confirm on auth.users;

-- ============================================================
-- После запуска: назначьте свой UUID основателем по ADMIN_SETUP.md.

-- ---------- Циклы и группы произведений (обновление каталога v3) ----------
-- text[] нужен и для UUID новых работ, и для slug встроенных книг.
create table if not exists public.work_groups (
  id text primary key check (length(id) between 1 and 100),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 140),
  kind text not null default 'cycle' check (kind in ('cycle','dilogy','trilogy','tetralogy','series')),
  description text not null default '' check (length(description) <= 2000),
  work_ids text[] not null default '{}' check (cardinality(work_ids) <= 100),
  -- Мягкое удаление не позволяет встроенному циклу появиться снова.
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists work_groups_author_idx on public.work_groups(author_id);
alter table public.work_groups enable row level security;
drop policy if exists work_groups_read on public.work_groups;
create policy work_groups_read on public.work_groups for select to anon, authenticated using (true);
drop policy if exists work_groups_insert on public.work_groups;
create policy work_groups_insert on public.work_groups for insert to authenticated with check (author_id = auth.uid());
drop policy if exists work_groups_update on public.work_groups;
create policy work_groups_update on public.work_groups for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
drop policy if exists work_groups_delete on public.work_groups;
create policy work_groups_delete on public.work_groups for delete to authenticated using (author_id = auth.uid());
grant select on public.work_groups to anon, authenticated;
grant insert, update, delete on public.work_groups to authenticated;

create or replace function public.validate_work_group() returns trigger
language plpgsql set search_path = public as $$
declare member_id text; founder boolean;
begin
  select exists(select 1 from public.profiles where id = new.author_id and username = 'cnizroman' and is_founder) into founder;
  if new.id = 'nikto-ne-vspomnit' and not founder then
    raise exception 'Встроенный цикл принадлежит основателю';
  end if;
  if cardinality(new.work_ids) <> (select count(distinct x) from unnest(new.work_ids) x) then
    raise exception 'Повторяющиеся произведения в группе';
  end if;
  foreach member_id in array new.work_ids loop
    if not exists(select 1 from public.works where id::text = member_id and author_id = new.author_id)
      and not (founder and member_id = any(array['ne-s-nachala','doroga-iz-holoda','spasatelny-krug','gde-nas-net','sem-dney','belaya-golova'])) then
      raise exception 'В группу можно добавить только свои существующие произведения';
    end if;
  end loop;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists work_groups_validate on public.work_groups;
create trigger work_groups_validate before insert or update on public.work_groups
  for each row execute function public.validate_work_group();

-- Удаление книги убирает ссылку из циклов, но не удаляет другие книги.
create or replace function public.remove_deleted_work_from_groups() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.work_groups set work_ids = array_remove(work_ids, old.id::text)
    where old.id::text = any(work_ids);
  return old;
end;
$$;
drop trigger if exists works_group_cleanup on public.works;
create trigger works_group_cleanup after delete on public.works
  for each row execute function public.remove_deleted_work_from_groups();

-- ---------- Профили, привилегии и карточки основателя (v4) ----------
alter table public.profiles alter column badges set default array['Новый автор']::text[];
alter table public.profiles add column if not exists customization jsonb not null default '{}';
alter table public.profiles drop constraint if exists profiles_customization_size;
alter table public.profiles add constraint profiles_customization_size check (
  jsonb_typeof(customization) = 'object' and octet_length(customization::text) <= 16000
);

-- RLS разрешает обновлять строку профиля, но не выдавать себе права/значки.
create or replace function public.protect_profile_privileges() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.role <> 'author' or new.is_founder or new.badges <> array['Новый автор']::text[] then
        raise exception 'Привилегии аккаунта назначает только владелец платформы';
      end if;
    else
      if new.role is distinct from old.role or new.is_founder is distinct from old.is_founder
         or new.username is distinct from old.username then
        raise exception 'Роль, статус основателя и юзернейм нельзя менять из браузера';
      end if;
      if new.badges is distinct from old.badges and not public.is_platform_admin() then
        raise exception 'Значки выдаёт только администратор';
      end if;
    end if;
  end if;
  if cardinality(new.badges) > 30 or exists(select 1 from unnest(new.badges) b where length(b) > 80 or length(trim(b)) = 0) then
    raise exception 'Недопустимый список значков';
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges before insert or update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- Встроенные книги имеют slug, а новые произведения — UUID. Не дублируем
-- исходные тексты: отдельно сохраняем только изменяемые карточки основателя.
create table if not exists public.founder_work_settings (
  work_id text primary key check (work_id in ('ne-s-nachala','doroga-iz-holoda','spasatelny-krug','gde-nas-net','sem-dney','belaya-golova')),
  author_id uuid not null references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and octet_length(settings::text) <= 20000)
);
alter table public.founder_work_settings enable row level security;
drop policy if exists founder_work_settings_read on public.founder_work_settings;
create policy founder_work_settings_read on public.founder_work_settings for select to anon, authenticated using (true);
drop policy if exists founder_work_settings_write on public.founder_work_settings;
create policy founder_work_settings_write on public.founder_work_settings for all to authenticated
  using (author_id = auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_founder and p.username='cnizroman'))
  with check (author_id = auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_founder and p.username='cnizroman'));
grant select on public.founder_work_settings to anon, authenticated;
grant insert, update, delete on public.founder_work_settings to authenticated;

create or replace function public.protect_work_ownership() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    if tg_op = 'UPDATE' and new.author_id is distinct from old.author_id then
      raise exception 'Нельзя перепривязать произведение другому аккаунту';
    end if;
    if not public.is_platform_admin() then
      if (tg_op = 'INSERT' and new.featured) or (tg_op = 'UPDATE' and new.featured is distinct from old.featured) then
        raise exception 'Выбор платформы назначает администратор';
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists works_protect_ownership on public.works;
create trigger works_protect_ownership before insert or update on public.works
  for each row execute function public.protect_work_ownership();

-- ---------- Изображения профилей, Storage (v5) ----------
-- В настоящем Supabase schema storage уже существует. В standalone Postgres
-- без Storage блок пропускается: остальная платформа продолжает работать.
do $storage_setup$
begin
  if to_regclass('storage.buckets') is not null and to_regclass('storage.objects') is not null then
    execute $q$
      insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
      values ('profile-media','profile-media',true,1048576,array['image/png','image/jpeg','image/webp'])
      on conflict (id) do update set public=true,file_size_limit=1048576,allowed_mime_types=array['image/png','image/jpeg','image/webp']
    $q$;
    execute 'drop policy if exists profile_media_read on storage.objects';
    execute $q$create policy profile_media_read on storage.objects for select to anon,authenticated using (bucket_id='profile-media')$q$;
    execute 'drop policy if exists profile_media_insert on storage.objects';
    execute $q$create policy profile_media_insert on storage.objects for insert to authenticated with check (
      bucket_id='profile-media' and (storage.foldername(name))[1]=auth.uid()::text
      and name ~ '^[0-9a-f-]{36}/(avatarUrl|bannerUrl)-[0-9a-f-]{36}\.(webp|jpg|png)$'
    )$q$;
    execute 'drop policy if exists profile_media_delete on storage.objects';
    execute $q$create policy profile_media_delete on storage.objects for delete to authenticated using (
      bucket_id='profile-media' and (storage.foldername(name))[1]=auth.uid()::text
    )$q$;
  end if;
end;
$storage_setup$;

-- ---------- Защита входа по юзернейму (v5 deployment) ----------
-- Private, atomic limits for the public username-login Edge Function.
create table if not exists public.username_login_limits (
  key_hash text primary key check (key_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null check (attempts > 0),
  reset_at timestamptz not null
);
create index if not exists username_login_limits_reset_idx on public.username_login_limits(reset_at);
alter table public.username_login_limits enable row level security;
revoke all on public.username_login_limits from public,anon,authenticated;

create or replace function public.consume_username_login_attempt(p_key text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path=public as $$
declare used integer;
begin
  if p_key is null or p_key !~ '^[0-9a-f]{64}$' or p_limit is null or p_limit not between 1 and 100
     or p_window_seconds is null or p_window_seconds not between 1 and 3600 then
    raise exception 'Invalid login limit';
  end if;
  delete from public.username_login_limits where reset_at <= now();
  insert into public.username_login_limits as limits(key_hash,attempts,reset_at)
  values(p_key,1,now()+make_interval(secs=>p_window_seconds))
  on conflict(key_hash) do update set attempts=least(limits.attempts+1,1000)
  returning attempts into used;
  return used <= p_limit;
end;
$$;
revoke all on function public.consume_username_login_attempt(text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_username_login_attempt(text,integer,integer) to service_role;
