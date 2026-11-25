-- P2.A: read-only process mining, scoped to the same case grain and existing KPI/filter definitions.
-- No data writes, no change to the original RPC, no SECURITY DEFINER and no arbitrary SQL.
create or replace function public.nxt_process_analysis(p_mode text,p_filters jsonb default '[]'::jsonb,p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $process$
declare
 v_pattern jsonb;v_kind text;v_a text;v_b text;v_min int;v_reference text[];v_selected text;v_status text;v_sort text;v_page int;v_size int;v_search text;matched_count int;result jsonb;
begin
 perform public.nxt_validate_filters(p_filters);
 if p_mode is null or p_mode not in ('catalog','conformance','bottlenecks','rework','patterns','cases','case') then raise exception 'INVALID_PROCESS_MODE' using errcode='22023';end if;
 if p_options is null or jsonb_typeof(p_options)<>'object' or length(p_options::text)>10000 then raise exception 'INVALID_PROCESS_OPTIONS' using errcode='22023';end if;
 v_status:=nullif(p_options->>'status','');v_sort:=coalesce(p_options->>'sort','cost');v_page:=coalesce((p_options->>'page')::int,0);v_size:=coalesce((p_options->>'pageSize')::int,25);v_search:=coalesce(p_options->>'search','');
 if v_status is not null and v_status not in ('on_time_in_full','on_time_not_full','late_in_full','late_not_full','unknown') or v_sort not in ('cost','late','short','weight','key','orders') or v_page<0 or v_page>100000 or v_size not in(10,25,50,100) or length(v_search)>180 then raise exception 'INVALID_PROCESS_SCOPE' using errcode='22023';end if;
 if p_mode='case' and (nullif(p_options->>'caseKey','') is null or length(p_options->>'caseKey')>180) then raise exception 'INVALID_CASE_KEY' using errcode='22023';end if;
 if p_mode='catalog' then
  return jsonb_build_object('activityNames',coalesce((select jsonb_agg(activity_en order by activity_en) from (select distinct activity_en from public.woodcorp_activities where activity_en is not null) a),'[]'::jsonb),'researchVersion',2,'definitionVersion','woodcorp-otif-financial-v1','penaltyRate',0.75);
 end if;
 if p_options ? 'pattern' then
  v_pattern:=p_options->'pattern';if jsonb_typeof(v_pattern)<>'object' or exists(select 1 from jsonb_object_keys(v_pattern) k where k not in ('kind','a','b','minOccurrences')) then raise exception 'INVALID_ACTIVITY_PATTERN' using errcode='22023';end if;
  v_kind:=v_pattern->>'kind';v_a:=v_pattern->>'a';v_b:=v_pattern->>'b';v_min:=coalesce((v_pattern->>'minOccurrences')::int,2);
  if v_kind is null or v_kind not in ('contains','missing','repeated','direct','eventually') or v_a is null or length(v_a)>100 or v_min not between 2 and 10 or (v_kind in ('direct','eventually') and (v_b is null or length(v_b)>100)) or (v_kind not in ('direct','eventually') and v_b is not null) or not exists(select 1 from public.woodcorp_activities where activity_en=v_a) or (v_b is not null and not exists(select 1 from public.woodcorp_activities where activity_en=v_b)) then raise exception 'INVALID_ACTIVITY_PATTERN' using errcode='22023';end if;
 end if;
 if p_mode='conformance' or p_options ? 'reference' then
  if p_options ? 'reference' and jsonb_typeof(p_options->'reference')<>'array' then raise exception 'INVALID_PROCESS_REFERENCE' using errcode='22023';end if;
  select array_agg(x order by ord) into v_reference from jsonb_array_elements_text(coalesce(p_options->'reference','["Order received","Confirm sale","Start production","Finished production","Load shipment"]'::jsonb)) with ordinality d(x,ord);
  if coalesce(cardinality(v_reference),0) not between 2 and 8 or cardinality(v_reference)<>(select count(distinct x) from unnest(v_reference) x) or exists(select 1 from unnest(v_reference) x where x is null or length(x)>100 or not exists(select 1 from public.woodcorp_activities a where a.activity_en=x)) then raise exception 'INVALID_PROCESS_REFERENCE' using errcode='22023';end if;
 end if;
 v_selected:=coalesce(p_options->>'patternState',p_options->>'referenceState','match');
 if v_selected not in ('match','no_match','unknown') or v_pattern is not null and v_reference is not null or p_mode='patterns' and v_pattern is null or p_mode in ('cases','case') and v_pattern is null and v_reference is null then raise exception 'INVALID_PROCESS_SELECTION' using errcode='22023';end if;
 if v_pattern is not null and p_mode in ('patterns','cases','case') then
 
 if p_mode='case' then
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
 counts as (select case_key,count(*) event_count,count(*) filter(where activity_en=v_a) a_count,count(*) filter(where activity_en=v_b) b_count,
 min(eventtime) filter(where activity_en=v_a and eventtime is not null and not coalesce(is_timestamp_anomaly,false)) a_first,
 max(eventtime) filter(where activity_en=v_b and eventtime is not null and not coalesce(is_timestamp_anomaly,false)) b_last,
 count(*) filter(where (eventtime is null or coalesce(is_timestamp_anomaly,false)) and activity_en in(v_a,v_b)) bad_relevant,
 count(*) filter(where eventtime is null or coalesce(is_timestamp_anomaly,false)) bad_any from events group by case_key),
 steps as (select case_key,eventtime,count(*) step_n,min(activity_en) activity,bool_or(activity_en=v_a) has_a,bool_or(activity_en=v_b) has_b from events where eventtime is not null and not coalesce(is_timestamp_anomaly,false) group by case_key,eventtime),
 seq as (select *,lag(step_n) over w prior_n,lag(activity) over w prior_activity from steps window w as(partition by case_key order by eventtime)),
 flags as (select case_key,bool_or(step_n=1 and prior_n=1 and prior_activity=v_a and activity=v_b) direct_match,
 bool_or(step_n>1 and has_a and has_b) simultaneous,bool_or(step_n>1 and (has_a or has_b)) ambiguous from seq group by case_key),
 classified as materialized (select b.*,case
 when coalesce(c.event_count,0)=0 then 'unknown'
 when v_kind='contains' then case when c.a_count>0 then 'match' else 'no_match' end
 when v_kind='missing' then case when c.a_count=0 then 'match' else 'no_match' end
 when v_kind='repeated' then case when c.a_count>=v_min then 'match' else 'no_match' end
 when v_kind='eventually' then case when c.a_first<c.b_last then 'match' when c.a_count=0 or c.b_count=0 then 'no_match' when c.bad_relevant>0 or coalesce(f.simultaneous,false) then 'unknown' else 'no_match' end
 when v_kind='direct' then case when coalesce(f.direct_match,false) then 'match' when c.a_count=0 or c.b_count=0 then 'no_match' when c.bad_any>0 or coalesce(f.ambiguous,false) then 'unknown' else 'no_match' end
 else 'unknown' end pattern_state from base b left join counts c on c.case_key=b.case_key left join flags f on f.case_key=b.case_key)
  select count(*) into matched_count from classified where pattern_state=v_selected;
  if matched_count=0 then return jsonb_build_object('case',null,'events','[]'::jsonb,'researchVersion',2,'definitionVersion','woodcorp-otif-financial-v1','penaltyRate',0.75);end if;
  return public.nxt_deep_analysis('case',p_filters,p_options- 'pattern'-'patternState'-'reference'-'referenceState');
 elsif p_mode='cases' then
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
 counts as (select case_key,count(*) event_count,count(*) filter(where activity_en=v_a) a_count,count(*) filter(where activity_en=v_b) b_count,
 min(eventtime) filter(where activity_en=v_a and eventtime is not null and not coalesce(is_timestamp_anomaly,false)) a_first,
 max(eventtime) filter(where activity_en=v_b and eventtime is not null and not coalesce(is_timestamp_anomaly,false)) b_last,
 count(*) filter(where (eventtime is null or coalesce(is_timestamp_anomaly,false)) and activity_en in(v_a,v_b)) bad_relevant,
 count(*) filter(where eventtime is null or coalesce(is_timestamp_anomaly,false)) bad_any from events group by case_key),
 steps as (select case_key,eventtime,count(*) step_n,min(activity_en) activity,bool_or(activity_en=v_a) has_a,bool_or(activity_en=v_b) has_b from events where eventtime is not null and not coalesce(is_timestamp_anomaly,false) group by case_key,eventtime),
 seq as (select *,lag(step_n) over w prior_n,lag(activity) over w prior_activity from steps window w as(partition by case_key order by eventtime)),
 flags as (select case_key,bool_or(step_n=1 and prior_n=1 and prior_activity=v_a and activity=v_b) direct_match,
 bool_or(step_n>1 and has_a and has_b) simultaneous,bool_or(step_n>1 and (has_a or has_b)) ambiguous from seq group by case_key),
 classified as materialized (select b.*,case
 when coalesce(c.event_count,0)=0 then 'unknown'
 when v_kind='contains' then case when c.a_count>0 then 'match' else 'no_match' end
 when v_kind='missing' then case when c.a_count=0 then 'match' else 'no_match' end
 when v_kind='repeated' then case when c.a_count>=v_min then 'match' else 'no_match' end
 when v_kind='eventually' then case when c.a_first<c.b_last then 'match' when c.a_count=0 or c.b_count=0 then 'no_match' when c.bad_relevant>0 or coalesce(f.simultaneous,false) then 'unknown' else 'no_match' end
 when v_kind='direct' then case when coalesce(f.direct_match,false) then 'match' when c.a_count=0 or c.b_count=0 then 'no_match' when c.bad_any>0 or coalesce(f.ambiguous,false) then 'unknown' else 'no_match' end
 else 'unknown' end pattern_state from base b left join counts c on c.case_key=b.case_key left join flags f on f.case_key=b.case_key),
  matching as materialized (select b.* from classified b where b.pattern_state=v_selected and (v_search='' or strpos(lower(b.case_key),lower(v_search))>0)),
 page as (select case_key,factory,product_type,cust_id,cust_name,cust_country,ordered_quantity,delivered_quantity,delivered_quantity_unit,promised_date,delivered_date,status,round(delay_days,2) delay_days,quantity_change_count,process_variant,process_order_quality,round(late_cost,2) late_cost,round(short_cost,2) short_cost,round(late_cost+short_cost,2) total_cost
 from matching order by case when v_sort='cost' then late_cost+short_cost when v_sort='late' then late_cost when v_sort='short' then short_cost when v_sort='weight' and delivered_quantity_unit='kg' then ordered_quantity end desc nulls last,case_key offset v_page::bigint*v_size limit v_size)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by case when v_sort='cost' then p.total_cost when v_sort='late' then p.late_cost when v_sort='short' then p.short_cost when v_sort='weight' and p.delivered_quantity_unit='kg' then p.ordered_quantity end desc nulls last,p.case_key) from page p),'[]'::jsonb),'page',v_page,'pageSize',v_size) into result;

 else
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
 counts as (select case_key,count(*) event_count,count(*) filter(where activity_en=v_a) a_count,count(*) filter(where activity_en=v_b) b_count,
 min(eventtime) filter(where activity_en=v_a and eventtime is not null and not coalesce(is_timestamp_anomaly,false)) a_first,
 max(eventtime) filter(where activity_en=v_b and eventtime is not null and not coalesce(is_timestamp_anomaly,false)) b_last,
 count(*) filter(where (eventtime is null or coalesce(is_timestamp_anomaly,false)) and activity_en in(v_a,v_b)) bad_relevant,
 count(*) filter(where eventtime is null or coalesce(is_timestamp_anomaly,false)) bad_any from events group by case_key),
 steps as (select case_key,eventtime,count(*) step_n,min(activity_en) activity,bool_or(activity_en=v_a) has_a,bool_or(activity_en=v_b) has_b from events where eventtime is not null and not coalesce(is_timestamp_anomaly,false) group by case_key,eventtime),
 seq as (select *,lag(step_n) over w prior_n,lag(activity) over w prior_activity from steps window w as(partition by case_key order by eventtime)),
 flags as (select case_key,bool_or(step_n=1 and prior_n=1 and prior_activity=v_a and activity=v_b) direct_match,
 bool_or(step_n>1 and has_a and has_b) simultaneous,bool_or(step_n>1 and (has_a or has_b)) ambiguous from seq group by case_key),
 classified as materialized (select b.*,case
 when coalesce(c.event_count,0)=0 then 'unknown'
 when v_kind='contains' then case when c.a_count>0 then 'match' else 'no_match' end
 when v_kind='missing' then case when c.a_count=0 then 'match' else 'no_match' end
 when v_kind='repeated' then case when c.a_count>=v_min then 'match' else 'no_match' end
 when v_kind='eventually' then case when c.a_first<c.b_last then 'match' when c.a_count=0 or c.b_count=0 then 'no_match' when c.bad_relevant>0 or coalesce(f.simultaneous,false) then 'unknown' else 'no_match' end
 when v_kind='direct' then case when coalesce(f.direct_match,false) then 'match' when c.a_count=0 or c.b_count=0 then 'no_match' when c.bad_any>0 or coalesce(f.ambiguous,false) then 'unknown' else 'no_match' end
 else 'unknown' end pattern_state from base b left join counts c on c.case_key=b.case_key left join flags f on f.case_key=b.case_key),
  grouped as (select pattern_state status,count(*)::int orders,
 count(on_time)::int date_n,count(*) filter(where on_time)::int on_time_n,
 count(in_full)::int volume_n,count(*) filter(where in_full)::int in_full_n,
 count(otif)::int otif_n,count(*) filter(where otif)::int otif_ok,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time is not null)::int late_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false)::int late_kg_orders,
 coalesce(sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false),0) late_kg,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null)::int short_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null and delivered_quantity<ordered_quantity)::int short_orders,
 coalesce(sum(greatest(ordered_quantity-delivered_quantity,0)) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null),0) short_kg,
 sum(ordered_quantity) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and ordered_quantity>=0) ordered_kg,
 sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and delivered_quantity>=0) delivered_kg,
 round(coalesce(sum(late_cost),0),2) late_cost,round(coalesce(sum(short_cost),0),2) short_cost,round(coalesce(sum(late_cost+short_cost),0),2) total_cost from classified group by pattern_state)
 select jsonb_build_object('cases',(select count(*) from base),'baseline',(select to_jsonb(t) from (select count(*)::int orders,
 count(on_time)::int date_n,count(*) filter(where on_time)::int on_time_n,
 count(in_full)::int volume_n,count(*) filter(where in_full)::int in_full_n,
 count(otif)::int otif_n,count(*) filter(where otif)::int otif_ok,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time is not null)::int late_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false)::int late_kg_orders,
 coalesce(sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false),0) late_kg,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null)::int short_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null and delivered_quantity<ordered_quantity)::int short_orders,
 coalesce(sum(greatest(ordered_quantity-delivered_quantity,0)) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null),0) short_kg,
 sum(ordered_quantity) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and ordered_quantity>=0) ordered_kg,
 sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and delivered_quantity>=0) delivered_kg,
 round(coalesce(sum(late_cost),0),2) late_cost,round(coalesce(sum(short_cost),0),2) short_cost,round(coalesce(sum(late_cost+short_cost),0),2) total_cost from base)t),'rows',coalesce((select jsonb_agg(to_jsonb(g) order by status) from grouped g),'[]'::jsonb),'pattern',v_pattern) into result;
 end if;
 elsif v_reference is not null and p_mode in ('conformance','cases','case') then
 
 if p_mode='case' then
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
 event_presence as (select case_key,count(*) n from events group by case_key),
 observed as (select case_key,activity_en,count(*) occurrences,min(eventtime) filter(where eventtime is not null and not coalesce(is_timestamp_anomaly,false)) first_ts,count(*) filter(where eventtime is null or coalesce(is_timestamp_anomaly,false)) bad_time from events where activity_en=any(v_reference) group by case_key,activity_en),
 required as (select b.case_key,d.ord,d.activity,coalesce(o.occurrences,0) occurrences,o.first_ts,coalesce(o.bad_time,0) bad_time,coalesce(e.n,0) event_count from base b cross join unnest(v_reference) with ordinality d(activity,ord) left join observed o on o.case_key=b.case_key and o.activity_en=d.activity left join event_presence e on e.case_key=b.case_key),
 paired as (select *,lag(activity) over w prior_activity,lag(occurrences) over w prior_n,lag(first_ts) over w prior_ts,lag(bad_time) over w prior_bad from required window w as(partition by case_key order by ord)),
 rules as materialized (select case_key,ord,prior_activity||' → '||activity rule,case when event_count=0 then 'unknown' when occurrences=0 or prior_n=0 then 'no_match' when first_ts is null or prior_ts is null or bad_time>0 or prior_bad>0 or first_ts=prior_ts then 'unknown' when prior_ts<first_ts then 'match' else 'no_match' end rule_state from paired where ord>1),
 statuses as (select case_key,case when bool_or(rule_state='no_match') then 'no_match' when bool_or(rule_state='unknown') then 'unknown' else 'match' end pattern_state from rules group by case_key),
 classified as materialized (select b.*,coalesce(s.pattern_state,'unknown') pattern_state from base b left join statuses s on s.case_key=b.case_key)
  select count(*) into matched_count from classified where pattern_state=v_selected;
  if matched_count=0 then return jsonb_build_object('case',null,'events','[]'::jsonb,'researchVersion',2,'definitionVersion','woodcorp-otif-financial-v1','penaltyRate',0.75);end if;
  return public.nxt_deep_analysis('case',p_filters,p_options- 'pattern'-'patternState'-'reference'-'referenceState');
 elsif p_mode='cases' then
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
 event_presence as (select case_key,count(*) n from events group by case_key),
 observed as (select case_key,activity_en,count(*) occurrences,min(eventtime) filter(where eventtime is not null and not coalesce(is_timestamp_anomaly,false)) first_ts,count(*) filter(where eventtime is null or coalesce(is_timestamp_anomaly,false)) bad_time from events where activity_en=any(v_reference) group by case_key,activity_en),
 required as (select b.case_key,d.ord,d.activity,coalesce(o.occurrences,0) occurrences,o.first_ts,coalesce(o.bad_time,0) bad_time,coalesce(e.n,0) event_count from base b cross join unnest(v_reference) with ordinality d(activity,ord) left join observed o on o.case_key=b.case_key and o.activity_en=d.activity left join event_presence e on e.case_key=b.case_key),
 paired as (select *,lag(activity) over w prior_activity,lag(occurrences) over w prior_n,lag(first_ts) over w prior_ts,lag(bad_time) over w prior_bad from required window w as(partition by case_key order by ord)),
 rules as materialized (select case_key,ord,prior_activity||' → '||activity rule,case when event_count=0 then 'unknown' when occurrences=0 or prior_n=0 then 'no_match' when first_ts is null or prior_ts is null or bad_time>0 or prior_bad>0 or first_ts=prior_ts then 'unknown' when prior_ts<first_ts then 'match' else 'no_match' end rule_state from paired where ord>1),
 statuses as (select case_key,case when bool_or(rule_state='no_match') then 'no_match' when bool_or(rule_state='unknown') then 'unknown' else 'match' end pattern_state from rules group by case_key),
 classified as materialized (select b.*,coalesce(s.pattern_state,'unknown') pattern_state from base b left join statuses s on s.case_key=b.case_key),
  matching as materialized (select b.* from classified b where b.pattern_state=v_selected and (v_search='' or strpos(lower(b.case_key),lower(v_search))>0)),
 page as (select case_key,factory,product_type,cust_id,cust_name,cust_country,ordered_quantity,delivered_quantity,delivered_quantity_unit,promised_date,delivered_date,status,round(delay_days,2) delay_days,quantity_change_count,process_variant,process_order_quality,round(late_cost,2) late_cost,round(short_cost,2) short_cost,round(late_cost+short_cost,2) total_cost
 from matching order by case when v_sort='cost' then late_cost+short_cost when v_sort='late' then late_cost when v_sort='short' then short_cost when v_sort='weight' and delivered_quantity_unit='kg' then ordered_quantity end desc nulls last,case_key offset v_page::bigint*v_size limit v_size)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by case when v_sort='cost' then p.total_cost when v_sort='late' then p.late_cost when v_sort='short' then p.short_cost when v_sort='weight' and p.delivered_quantity_unit='kg' then p.ordered_quantity end desc nulls last,p.case_key) from page p),'[]'::jsonb),'page',v_page,'pageSize',v_size) into result;

 else
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
 event_presence as (select case_key,count(*) n from events group by case_key),
 observed as (select case_key,activity_en,count(*) occurrences,min(eventtime) filter(where eventtime is not null and not coalesce(is_timestamp_anomaly,false)) first_ts,count(*) filter(where eventtime is null or coalesce(is_timestamp_anomaly,false)) bad_time from events where activity_en=any(v_reference) group by case_key,activity_en),
 required as (select b.case_key,d.ord,d.activity,coalesce(o.occurrences,0) occurrences,o.first_ts,coalesce(o.bad_time,0) bad_time,coalesce(e.n,0) event_count from base b cross join unnest(v_reference) with ordinality d(activity,ord) left join observed o on o.case_key=b.case_key and o.activity_en=d.activity left join event_presence e on e.case_key=b.case_key),
 paired as (select *,lag(activity) over w prior_activity,lag(occurrences) over w prior_n,lag(first_ts) over w prior_ts,lag(bad_time) over w prior_bad from required window w as(partition by case_key order by ord)),
 rules as materialized (select case_key,ord,prior_activity||' → '||activity rule,case when event_count=0 then 'unknown' when occurrences=0 or prior_n=0 then 'no_match' when first_ts is null or prior_ts is null or bad_time>0 or prior_bad>0 or first_ts=prior_ts then 'unknown' when prior_ts<first_ts then 'match' else 'no_match' end rule_state from paired where ord>1),
 statuses as (select case_key,case when bool_or(rule_state='no_match') then 'no_match' when bool_or(rule_state='unknown') then 'unknown' else 'match' end pattern_state from rules group by case_key),
 classified as materialized (select b.*,coalesce(s.pattern_state,'unknown') pattern_state from base b left join statuses s on s.case_key=b.case_key),
  rule_summary as (select rule,ord,count(*) orders,count(*) filter(where rule_state='match') matched_cases,count(*) filter(where rule_state='no_match') deviation_cases,count(*) filter(where rule_state='unknown') unknown_cases from rules group by rule,ord),
  grouped as (select pattern_state status,count(*)::int orders,
 count(on_time)::int date_n,count(*) filter(where on_time)::int on_time_n,
 count(in_full)::int volume_n,count(*) filter(where in_full)::int in_full_n,
 count(otif)::int otif_n,count(*) filter(where otif)::int otif_ok,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time is not null)::int late_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false)::int late_kg_orders,
 coalesce(sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false),0) late_kg,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null)::int short_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null and delivered_quantity<ordered_quantity)::int short_orders,
 coalesce(sum(greatest(ordered_quantity-delivered_quantity,0)) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null),0) short_kg,
 sum(ordered_quantity) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and ordered_quantity>=0) ordered_kg,
 sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and delivered_quantity>=0) delivered_kg,
 round(coalesce(sum(late_cost),0),2) late_cost,round(coalesce(sum(short_cost),0),2) short_cost,round(coalesce(sum(late_cost+short_cost),0),2) total_cost from classified group by pattern_state)
 select jsonb_build_object('cases',(select count(*) from base),'baseline',(select to_jsonb(t) from (select count(*)::int orders,
 count(on_time)::int date_n,count(*) filter(where on_time)::int on_time_n,
 count(in_full)::int volume_n,count(*) filter(where in_full)::int in_full_n,
 count(otif)::int otif_n,count(*) filter(where otif)::int otif_ok,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time is not null)::int late_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false)::int late_kg_orders,
 coalesce(sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and on_time=false),0) late_kg,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null)::int short_eligible,
 count(*) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null and delivered_quantity<ordered_quantity)::int short_orders,
 coalesce(sum(greatest(ordered_quantity-delivered_quantity,0)) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and delivered_quantity is not null),0) short_kg,
 sum(ordered_quantity) filter(where delivered_quantity_unit='kg' and ordered_quantity is not null and ordered_quantity>=0) ordered_kg,
 sum(delivered_quantity) filter(where delivered_quantity_unit='kg' and delivered_quantity is not null and delivered_quantity>=0) delivered_kg,
 round(coalesce(sum(late_cost),0),2) late_cost,round(coalesce(sum(short_cost),0),2) short_cost,round(coalesce(sum(late_cost+short_cost),0),2) total_cost from base)t),'rows',coalesce((select jsonb_agg(to_jsonb(g) order by status) from grouped g),'[]'::jsonb),'reference',to_jsonb(v_reference),'rules',coalesce((select jsonb_agg(to_jsonb(r) order by ord) from rule_summary r),'[]'::jsonb)) into result;
 end if;
 elsif p_mode='rework' then
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
  per_case as materialized (select case_key,activity_en activity,count(*) occurrences from events group by case_key,activity_en),
  summary as (select p.activity,(select count(*) from base) orders,sum(p.occurrences) events,count(*) present_cases,count(*) filter(where p.occurrences>1) repeated_cases,sum(greatest(p.occurrences-1,0)) repeat_events,count(*) filter(where p.occurrences=1) single_cases,
  count(b.otif) filter(where p.occurrences>1) repeated_otif_n,count(*) filter(where p.occurrences>1 and b.otif) repeated_otif_ok,
  count(b.otif) filter(where p.occurrences=1) single_otif_n,count(*) filter(where p.occurrences=1 and b.otif) single_otif_ok,
  round(coalesce(sum(b.late_cost+b.short_cost) filter(where p.occurrences>1),0),2) total_cost from per_case p join base b on b.case_key=p.case_key group by p.activity)
  select jsonb_build_object('cases',(select count(*) from base),'representedCases',(select count(distinct case_key) from events),'events',(select count(*) from events),'rows',coalesce((select jsonb_agg(to_jsonb(s) order by repeated_cases desc,activity) from summary s),'[]'::jsonb)) into result;
 elsif p_mode='bottlenecks' then
  with scope as materialized (
 select c.*,pf.case_key as feature_key,pf.quantity_change_count,pf.delivery_date_change_count,pf.production_start_change_count,pf.price_change_count,pf.anomalous_event_count,pf.credit_block_count,pf.confirm_sale_ts,pf.order_confirmation_days,pf.production_preparation_days,pf.quantity_changes_after_start,pf.quantity_changes_after_end,pf.quantity_changes_after_ship,pf.quantity_change_phase,pf.process_order_quality,pf.process_variant,pf.snapshot_at,
 ei.case_key as interval_key,ei.order_received_ts,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts,ei.actual_delivery_ts,ei.order_to_start_days,ei.production_days,ei.production_to_ship_days,ei.ship_to_delivery_days,ei.order_to_delivery_days,
 c.delivered_date<=c.promised_date as on_time,case when c.order_tolerance_met is null then null else c.order_tolerance_met=1 end as in_full,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then null else c.delivered_date<=c.promised_date and c.order_tolerance_met=1 end as otif,
 case when c.delivered_date is null or c.promised_date is null or c.order_tolerance_met is null then 'unknown' when c.delivered_date<=c.promised_date and c.order_tolerance_met=1 then 'on_time_in_full' when c.delivered_date<=c.promised_date then 'on_time_not_full' when c.order_tolerance_met=1 then 'late_in_full' else 'late_not_full' end as status,
 case when c.delivered_date>c.promised_date and c.delivered_quantity_unit='kg' and c.delivered_quantity is not null then c.delivered_quantity*0.75 else 0 end as late_cost,
 case when c.delivered_quantity_unit='kg' and c.ordered_quantity is not null and c.delivered_quantity is not null then greatest(c.ordered_quantity-c.delivered_quantity,0)*0.75 else 0 end as short_cost,
 extract(epoch from c.delivered_date-c.promised_date)/86400 as delay_days
 from public.woodcorp_cases c
 left join public.nxt_case_process_features pf on pf.case_key=c.case_key
 left join public.nxt_e02_case_intervals ei on ei.case_key=c.case_key
 where public.nxt_case_matches(c,p_filters)
), base as materialized (select * from scope where (v_status is null or status=v_status) and (p_mode<>'case' or case_key=p_options->>'caseKey')),
 
  events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key where a.activity_en is not null),
  steps as (select case_key,eventtime,count(*) step_n,min(activity_en) activity from events where eventtime is not null and not coalesce(is_timestamp_anomaly,false) group by case_key,eventtime),
  seq as (select *,lag(step_n) over w prior_n,lag(activity) over w source,lag(eventtime) over w prior_ts from steps window w as(partition by case_key order by eventtime)),
  transitions as materialized (select case_key,source,activity target,extract(epoch from eventtime-prior_ts)/86400 duration from seq where step_n=1 and prior_n=1 and source is not null and prior_ts<eventtime),
  per_link as (select source,target,count(*) transitions,count(distinct case_key) cases,count(duration) valid_duration,round((percentile_cont(.5) within group(order by duration))::numeric,3) median_days,round((percentile_cont(.9) within group(order by duration))::numeric,3) p90_days,round(sum(duration),3) total_days from transitions group by source,target),
  exposure as (select d.source,d.target,round(sum(b.late_cost+b.short_cost),2) total_cost,count(b.otif) otif_n,count(*) filter(where b.otif) otif_ok from (select distinct source,target,case_key from transitions)d join base b on b.case_key=d.case_key group by d.source,d.target),
  links as (select l.*,e.total_cost,e.otif_n,e.otif_ok from per_link l join exposure e using(source,target)),
  activities as (select activity_en activity,count(*) events,count(distinct case_key) cases,min(sorting) display_order from events where eventtime is not null and not coalesce(is_timestamp_anomaly,false) group by activity_en)
  select jsonb_build_object('cases',(select count(*) from base),'events',(select count(*) from events),'retained',(select coalesce(sum(step_n),0) from steps),'representedCases',(select count(distinct case_key) from steps),'sequence','chronological','eligibleTransitions',(select count(*) from transitions),'links',coalesce((select jsonb_agg(to_jsonb(l) order by total_days desc,source,target) from links l),'[]'::jsonb),'activities',coalesce((select jsonb_agg(to_jsonb(a) order by display_order,activity) from activities a),'[]'::jsonb)) into result;
 else raise exception 'INVALID_PROCESS_MODE_OR_CONFIGURATION' using errcode='22023';
 end if;
 return result||jsonb_build_object('researchVersion',2,'definitionVersion','woodcorp-otif-financial-v1','penaltyRate',0.75);
end
$process$;
revoke all on function public.nxt_process_analysis(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.nxt_process_analysis(text,jsonb,jsonb) to authenticated;
