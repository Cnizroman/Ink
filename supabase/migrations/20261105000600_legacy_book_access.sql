-- Server-held decryption key for the owner's legacy «Где нас нет».
-- No text, passwords, hashes or content keys belong in this migration/repository.
begin;
create schema if not exists ink_private;
revoke all on schema ink_private from public,anon,authenticated;
create table if not exists ink_private.legacy_book_access (
 slug text primary key check (slug='book3'),
 owner_id uuid not null references public.profiles(id),
 asset_id text not null check (asset_id ~ '^[a-f0-9]{64}$'),
 content_key text not null check (content_key ~ '^[a-f0-9]{64}$'),
 password_hash text not null,
 password_ready boolean not null default false,
 updated_at timestamptz not null default now()
);
create table if not exists ink_private.legacy_book_attempts (
 slug text primary key references ink_private.legacy_book_access(slug) on delete cascade,
 attempts integer not null default 0,
 reset_at timestamptz not null default now()+interval '5 minutes'
);
alter table ink_private.legacy_book_access enable row level security;
alter table ink_private.legacy_book_attempts enable row level security;
revoke all on ink_private.legacy_book_access,ink_private.legacy_book_attempts from public,anon,authenticated;

create or replace function public.unlock_legacy_book(p_password text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare b ink_private.legacy_book_access%rowtype; a ink_private.legacy_book_attempts%rowtype;
begin
 select * into b from ink_private.legacy_book_access where slug='book3';
 if not found then return jsonb_build_object('error','unavailable'); end if;
 if not b.password_ready then return jsonb_build_object('error','password_not_set'); end if;
 insert into ink_private.legacy_book_attempts(slug) values(b.slug) on conflict do nothing;
 select * into a from ink_private.legacy_book_attempts where slug=b.slug for update;
 if a.reset_at<=now() then
  update ink_private.legacy_book_attempts set attempts=0,reset_at=now()+interval '5 minutes' where slug=b.slug returning * into a;
 end if;
 if a.attempts>=60 then return jsonb_build_object('error','rate_limit'); end if;
 update ink_private.legacy_book_attempts set attempts=attempts+1 where slug=b.slug;
 if p_password is null or octet_length(p_password)>72 or length(p_password)=0 then
  return jsonb_build_object('error','incorrect_password');
 end if;
 if crypt(p_password,b.password_hash)<>b.password_hash then
  return jsonb_build_object('error','incorrect_password');
 end if;
 -- Do not reset on success: a known password must not bypass the shared limiter.
 return jsonb_build_object('asset_id',b.asset_id,'key',b.content_key);
end $$;
revoke all on function public.unlock_legacy_book(text) from public;
grant execute on function public.unlock_legacy_book(text) to anon,authenticated;

create or replace function public.set_legacy_book_password(p_password text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,extensions as $$
declare b ink_private.legacy_book_access%rowtype;
begin
 select * into b from ink_private.legacy_book_access where slug='book3' for update;
 if not found or auth.uid() is null or auth.uid()<>b.owner_id then
  raise exception 'Изменить пароль может только владелец произведения';
 end if;
 if p_password is null or length(p_password)<8 or octet_length(p_password)>72 then
  raise exception 'Пароль: минимум 8 символов, не более 72 байт UTF-8';
 end if;
 update ink_private.legacy_book_access set password_hash=crypt(p_password,gen_salt('bf',10)),
  password_ready=true,updated_at=now() where slug=b.slug;
 delete from ink_private.legacy_book_attempts where slug=b.slug;
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.set_legacy_book_password(text) from public,anon;
grant execute on function public.set_legacy_book_password(text) to authenticated;
commit;
