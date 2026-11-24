-- NXT Intelligence policy and quotas. Only the Edge Function service role can access these objects.
-- Preserves previous UTC usage counters. No prompts, credentials or workspace content are stored.
create table if not exists nxt_private.ai_model_checks(
 model text primary key check(model in ('eu.anthropic.claude-sonnet-4-6','eu.anthropic.claude-opus-4-6-v1')),
 verified_at timestamptz not null
);
insert into nxt_private.ai_model_checks(model,verified_at)
values ('eu.anthropic.claude-sonnet-4-6','2026-11-24T12:41:49Z')
on conflict(model) do nothing;
create table if not exists nxt_private.ai_project_policy(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default true,
 default_limit integer not null default 20 check(default_limit between 1 and 200),
 project_limit integer not null default 100 check(project_limit between 1 and 1000),
 default_model text not null default 'eu.anthropic.claude-sonnet-4-6' references nxt_private.ai_model_checks(model),
 updated_at timestamptz not null default now()
);
-- The project owner explicitly requested activation; standard request limits remain unchanged.
insert into nxt_private.ai_project_policy(singleton) values(true) on conflict(singleton) do nothing;
create table if not exists nxt_private.ai_user_policy(
 user_id uuid primary key references public.woodcorp_access(user_id) on delete cascade,
 enabled boolean,
 daily_limit integer check(daily_limit between 1 and 200),
 bonus integer not null default 0 check(bonus between 0 and 180),
 model_override text references nxt_private.ai_model_checks(model),
 updated_at timestamptz not null default now()
);
alter table nxt_private.ai_model_checks enable row level security;
alter table nxt_private.ai_project_policy enable row level security;
alter table nxt_private.ai_user_policy enable row level security;
revoke all on schema nxt_private from public,anon,authenticated;
revoke all on nxt_private.ai_model_checks,nxt_private.ai_project_policy,nxt_private.ai_user_policy,nxt_private.ai_usage from public,anon,authenticated;
grant usage on schema nxt_private to service_role;
grant select,insert,update,delete on nxt_private.ai_model_checks,nxt_private.ai_project_policy,nxt_private.ai_user_policy,nxt_private.ai_usage to service_role;
create or replace function public.nxt_ai_control(p_actor uuid,p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 r text; target uuid; g nxt_private.ai_project_policy%rowtype; u nxt_private.ai_user_policy%rowtype;
 d date:=(now() at time zone 'UTC')::date; personal_used integer; global_used integer; last_at timestamptz;
 personal_enabled boolean; lim integer; mdl text; chosen text; v_enabled boolean; v_limit integer; v_bonus integer;
 v_default integer; v_project integer;
begin
 select role into r from public.woodcorp_access where user_id=p_actor;
 if not found then return jsonb_build_object('allowed',false,'reason','membership'); end if;
 if p_action in ('admin_list','update_project','update_user','reserve_test','mark_verified') and r<>'admin' then
  return jsonb_build_object('allowed',false,'reason','admin_required');
 end if;
 if p_action in ('reserve','reserve_test','update_project','update_user','mark_verified') then
  perform pg_catalog.pg_advisory_xact_lock(729451013);
 end if;
 select * into g from nxt_private.ai_project_policy where singleton;
 if not found then return jsonb_build_object('allowed',false,'reason','policy_missing');end if;
 select * into u from nxt_private.ai_user_policy where user_id=p_actor;
 personal_enabled:=coalesce(u.enabled,r in ('analyst','admin'));
 lim:=least(200,coalesce(u.daily_limit,g.default_limit)+coalesce(u.bonus,0));
 mdl:=coalesce(u.model_override,g.default_model);
 select used,last_request into personal_used,last_at from nxt_private.ai_usage where day=d and principal=p_actor::text;
 select used into global_used from nxt_private.ai_usage where day=d and principal='global';
 personal_used:=coalesce(personal_used,0); global_used:=coalesce(global_used,0);
 if p_action='status' then
  return jsonb_build_object('allowed',true,'projectEnabled',g.enabled,'userEnabled',personal_enabled,
   'model',mdl,'used',personal_used,'limit',lim,'projectUsed',global_used,'projectLimit',g.project_limit,
   'remaining',greatest(0,least(lim-personal_used,g.project_limit-global_used)),'day',d);
 elsif p_action='admin_list' then
  return jsonb_build_object('allowed',true,'project',jsonb_build_object('enabled',g.enabled,'defaultLimit',g.default_limit,'projectLimit',g.project_limit,'defaultModel',g.default_model,'used',global_used,'day',d),
   'models',coalesce((select jsonb_agg(jsonb_build_object('id',x.model,'verifiedAt',x.verified_at) order by x.model) from nxt_private.ai_model_checks x),'[]'::jsonb),
   'members',coalesce((select jsonb_agg(jsonb_build_object('userId',a.user_id,'role',a.role,'enabled',coalesce(p.enabled,a.role in ('analyst','admin')),
    'enabledOverride',p.enabled,'dailyLimit',p.daily_limit,'bonus',coalesce(p.bonus,0),'modelOverride',p.model_override,
    'model',coalesce(p.model_override,g.default_model),'limit',least(200,coalesce(p.daily_limit,g.default_limit)+coalesce(p.bonus,0)),
    'used',coalesce(x.used,0),'lastRequest',x.last_request) order by a.user_id)
    from public.woodcorp_access a left join nxt_private.ai_user_policy p on p.user_id=a.user_id
    left join nxt_private.ai_usage x on x.day=d and x.principal=a.user_id::text),'[]'::jsonb));
 elsif p_action='update_project' then
  v_enabled:=(p_payload->>'enabled')::boolean;
  v_default:=(p_payload->>'defaultLimit')::integer;v_project:=(p_payload->>'projectLimit')::integer;
  chosen:=p_payload->>'defaultModel';
  if v_enabled is null or v_default is null or v_default not between 1 and 200 or v_project is null or v_project not between 1 and 1000 or not exists(select 1 from nxt_private.ai_model_checks where model=chosen) then
   return jsonb_build_object('allowed',false,'reason','invalid_project');
  end if;
  update nxt_private.ai_project_policy set enabled=v_enabled,default_limit=v_default,project_limit=v_project,default_model=chosen,updated_at=now() where singleton;
  return jsonb_build_object('allowed',true);
 elsif p_action='update_user' then
  target:=(p_payload->>'userId')::uuid;
  if not exists(select 1 from public.woodcorp_access where user_id=target) then return jsonb_build_object('allowed',false,'reason','member_missing');end if;
  v_enabled:=(p_payload->>'enabledOverride')::boolean; v_limit:=(p_payload->>'dailyLimit')::integer;v_bonus:=coalesce((p_payload->>'bonus')::integer,0);chosen:=p_payload->>'modelOverride';
  if (v_limit is not null and v_limit not between 1 and 200) or v_bonus not between 0 and 180 or (chosen is not null and not exists(select 1 from nxt_private.ai_model_checks where model=chosen)) then
   return jsonb_build_object('allowed',false,'reason','invalid_user');
  end if;
  insert into nxt_private.ai_user_policy(user_id,enabled,daily_limit,bonus,model_override,updated_at)
  values(target,v_enabled,v_limit,v_bonus,chosen,now()) on conflict(user_id) do update
  set enabled=excluded.enabled,daily_limit=excluded.daily_limit,bonus=excluded.bonus,model_override=excluded.model_override,updated_at=excluded.updated_at;
  return jsonb_build_object('allowed',true);
 elsif p_action='mark_verified' then
  chosen:=p_payload->>'model';
  if chosen is null or chosen not in ('eu.anthropic.claude-sonnet-4-6','eu.anthropic.claude-opus-4-6-v1') then return jsonb_build_object('allowed',false,'reason','invalid_model');end if;
  insert into nxt_private.ai_model_checks(model,verified_at) values(chosen,now()) on conflict(model) do update set verified_at=excluded.verified_at;
  return jsonb_build_object('allowed',true);
 elsif p_action in ('reserve','reserve_test') then
  if not g.enabled or not personal_enabled then return jsonb_build_object('allowed',false,'reason','disabled');end if;
  if personal_used>=lim or global_used>=g.project_limit then return jsonb_build_object('allowed',false,'reason','quota');end if;
  if last_at is not null and last_at>now()-interval '5 seconds' then return jsonb_build_object('allowed',false,'reason','cooldown');end if;
  if p_action='reserve_test' then
   mdl:=p_payload->>'model';
   if mdl is null or mdl not in ('eu.anthropic.claude-sonnet-4-6','eu.anthropic.claude-opus-4-6-v1') then return jsonb_build_object('allowed',false,'reason','invalid_model');end if;
  elsif not exists(select 1 from nxt_private.ai_model_checks where model=mdl) then return jsonb_build_object('allowed',false,'reason','invalid_model');end if;
  delete from nxt_private.ai_usage where day<d-14;
  insert into nxt_private.ai_usage as usage(day,principal,used,last_request)
   values(d,'global',1,now()),(d,p_actor::text,1,now()) on conflict(day,principal) do update set used=usage.used+1,last_request=excluded.last_request;
  return jsonb_build_object('allowed',true,'model',mdl,'remaining',greatest(0,least(lim-personal_used-1,g.project_limit-global_used-1)));
 end if;
 return jsonb_build_object('allowed',false,'reason','unknown_action');
end $$;
revoke all on function public.nxt_ai_control(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.nxt_ai_control(uuid,text,jsonb) to service_role;
-- Disable the old quota RPC for new clients; retain it for rollback of the previous Edge Function.
