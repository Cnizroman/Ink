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
