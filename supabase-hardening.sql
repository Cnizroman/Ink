-- ============================================================
-- Nobody came · Review Archive · ДОПОЛНИТЕЛЬНАЯ защита (необязательно)
-- Запускать ПОСЛЕ supabase-schema.sql в Supabase → SQL Editor.
-- Файл можно запускать повторно.
-- ============================================================

-- 1. Имя автора — не длиннее 60 символов (на сайте стоит maxlength="60",
--    но в базу можно отправить запрос в обход сайта).
--    NOT VALID: старые записи не проверяются, новые — проверяются.
alter table public.reviews drop constraint if exists reviews_name_length;
alter table public.reviews
  add constraint reviews_name_length
  check (char_length(name) between 1 and 60) not valid;

-- 2. Общий «предохранитель» от лавины спама: не больше 20 новых отзывов в минуту
--    на весь сайт. SECURITY DEFINER нужен, чтобы функция видела и PENDING-записи
--    (анонимный пользователь по RLS их не видит).
create or replace function public.reviews_throttle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.reviews
      where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'Too many reviews submitted, try again later';
  end if;
  return new;
end;
$$;

drop trigger if exists reviews_throttle_trg on public.reviews;
create trigger reviews_throttle_trg
  before insert on public.reviews
  for each row execute function public.reviews_throttle();
