-- Atomic, service-only AI request quota. No prompts or analytics data stored.
create schema if not exists nxt_private;
revoke all on schema nxt_private from public, anon, authenticated;
create table if not exists nxt_private.ai_usage(
 day date not null, principal text not null, used integer not null default 0 check(used>=0),
 last_request timestamptz not null default now(), primary key(day,principal)
);
alter table nxt_private.ai_usage enable row level security;
revoke all on table nxt_private.ai_usage from public, anon, authenticated;
create or replace function public.nxt_ai_reserve_request(p_user uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare d date := (now() at time zone 'UTC')::date; u text := p_user::text; n integer; last_at timestamptz;
begin
 if p_user is null then return false; end if;
 perform pg_catalog.pg_advisory_xact_lock(729451013);
 delete from nxt_private.ai_usage where day < d-14;
 select used into n from nxt_private.ai_usage where day=d and principal='global';
 if coalesce(n,0)>=100 then return false; end if;
 select used,last_request into n,last_at from nxt_private.ai_usage where day=d and principal=u;
 if coalesce(n,0)>=20 or (last_at is not null and last_at>now()-interval '5 seconds') then return false; end if;
 insert into nxt_private.ai_usage(day,principal,used,last_request) values(d,'global',1,now()),(d,u,1,now())
 on conflict(day,principal) do update set used=nxt_private.ai_usage.used+1,last_request=excluded.last_request;
 return true;
end $$;
revoke all on function public.nxt_ai_reserve_request(uuid) from public, anon, authenticated;
grant execute on function public.nxt_ai_reserve_request(uuid) to service_role;
