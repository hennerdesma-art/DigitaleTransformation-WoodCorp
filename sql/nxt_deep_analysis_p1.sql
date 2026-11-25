-- P1 deep analysis: single case-grain scope and strictly allowlisted dimensions.
-- This migration is additive. The original KPI functions, filters, tables and policies are unchanged.
create or replace function public.nxt_deep_analysis(p_mode text,p_filters jsonb default '[]'::jsonb,p_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security invoker set search_path='' as $research$
declare
 v_dims text[]; v_exposure text; v_a text; v_b text; v_variant text; v_status text; v_search text;
 v_page int; v_size int; v_sort text; v_order text; result jsonb;
begin
 perform public.nxt_validate_filters(p_filters);
 if p_mode is null or p_mode not in ('cases','case','process','groups','compare','quality','costs') then raise exception 'INVALID_RESEARCH_MODE' using errcode='22023'; end if;
 if p_options is null or jsonb_typeof(p_options)<>'object' or length(p_options::text)>10000 then raise exception 'INVALID_RESEARCH_OPTIONS' using errcode='22023'; end if;
 v_variant:=nullif(p_options->>'variant','');v_status:=nullif(p_options->>'status','');v_search:=coalesce(p_options->>'search','');
 v_page:=coalesce((p_options->>'page')::int,0);v_size:=coalesce((p_options->>'pageSize')::int,25);
 v_sort:=coalesce(p_options->>'sort','cost');v_order:=coalesce(p_options->>'sequence','chronological');
 if v_page<0 or v_page>100000 or v_size not in (10,25,50,100) or length(v_search)>180 or length(v_variant)>200
 or (v_status is not null and v_status not in ('on_time_in_full','on_time_not_full','late_in_full','late_not_full','unknown'))
 or v_sort not in ('cost','late','short','weight','key','orders') or v_order not in ('chronological','source')
 then raise exception 'INVALID_RESEARCH_PAGING_OR_FILTER' using errcode='22023';end if;
 if p_mode in ('groups','compare','costs') then
  if p_options ? 'dimensions' and jsonb_typeof(p_options->'dimensions')<>'array' then raise exception 'INVALID_RESEARCH_DIMENSIONS' using errcode='22023'; end if;
  select coalesce(array_agg(x order by ord),array[]::text[]) into v_dims from jsonb_array_elements_text(coalesce(p_options->'dimensions','[]'::jsonb)) with ordinality d(x,ord);
  if cardinality(v_dims)>3 or cardinality(v_dims)<>(select count(distinct x) from unnest(v_dims) x) or exists(select 1 from unnest(v_dims) x where not (x=any(array['factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','cust_name','quantity_change_group','delivery_month','order_received_month','promised_month']::text[]))) then raise exception 'INVALID_RESEARCH_DIMENSIONS' using errcode='22023';end if;
 end if;
 if p_mode='compare' then
  v_exposure:=p_options->>'exposure';v_a:=p_options->>'a';v_b:=p_options->>'b';
  if v_exposure is null or not(v_exposure=any(array['factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','cust_name','quantity_change_group','delivery_month','order_received_month','promised_month']::text[])) or v_exposure in ('otif_status','order_tolerance_met','quantity_deviation_class','process_order_quality')
  or v_a is null or v_b is null or v_a=v_b or length(v_a)>200 or length(v_b)>200
  or v_exposure=any(v_dims) or exists(select 1 from unnest(v_dims) x where not(x=any(array['factory','product_type','warehouse_type','cust_market','order_size_class','delivery_year','credit_block','delivery_company']::text[])))
  then raise exception 'INVALID_COMPARISON_GROUPS' using errcode='22023';end if;
 end if;
 if p_mode='cases' then
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
 and (v_variant is null or pf.process_variant=v_variant)
), base as materialized (select * from scope where v_status is null or status=v_status),
 matching as materialized (select b.* from base b where v_search='' or strpos(lower(b.case_key),lower(v_search))>0),
 page as (select case_key,factory,product_type,cust_id,cust_name,cust_country,ordered_quantity,delivered_quantity,delivered_quantity_unit,promised_date,delivered_date,status,round(delay_days,2) delay_days,quantity_change_count,process_variant,process_order_quality,round(late_cost,2) late_cost,round(short_cost,2) short_cost,round(late_cost+short_cost,2) total_cost
 from matching order by case when v_sort='cost' then late_cost+short_cost when v_sort='late' then late_cost when v_sort='short' then short_cost when v_sort='weight' and delivered_quantity_unit='kg' then ordered_quantity end desc nulls last,case_key offset v_page::bigint*v_size limit v_size)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by case when v_sort='cost' then p.total_cost when v_sort='late' then p.late_cost when v_sort='short' then p.short_cost when v_sort='weight' and p.delivered_quantity_unit='kg' then p.ordered_quantity end desc nulls last,p.case_key) from page p),'[]'::jsonb),'page',v_page,'pageSize',v_size) into result;
 elsif p_mode='case' then
 if nullif(p_options->>'caseKey','') is null or length(p_options->>'caseKey')>180 then raise exception 'INVALID_CASE_KEY' using errcode='22023';end if;
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
 and (v_variant is null or pf.process_variant=v_variant)
), base as materialized (select * from scope where v_status is null or status=v_status),
 chosen as (select * from base where case_key=p_options->>'caseKey')
 select jsonb_build_object('case',to_jsonb(b),'events',coalesce((select jsonb_agg(jsonb_build_object('event_id',a.event_id,'activity',a.activity_en,'eventtime',a.eventtime,'sorting',a.sorting,'anomaly',a.is_timestamp_anomaly) order by a.eventtime nulls last,a.sorting,a.event_id) from public.woodcorp_activities a where a.case_key=b.case_key),'[]'::jsonb))
 into result from chosen b;
 if result is null then return jsonb_build_object('case',null,'events','[]'::jsonb);end if;
 elsif p_mode='groups' or p_mode='costs' then
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
 and (v_variant is null or pf.process_variant=v_variant)
), base as materialized (select * from scope where v_status is null or status=v_status),
 labelled as (select b.*,coalesce((select jsonb_agg(case d.dim
 when 'factory' then b.factory
 when 'product_type' then b.product_type
 when 'delivery_company' then b.delivery_company
 when 'warehouse_type' then b.warehouse_type
 when 'cust_country' then b.cust_country
 when 'delivery_year' then extract(year from b.delivered_date)::int::text
 when 'cust_market' then b.cust_market
 when 'delivered_quantity_unit' then b.delivered_quantity_unit
 when 'cust_addr_code' then b.cust_addr_code
 when 'order_tolerance_met' then b.order_tolerance_met::text
 when 'otif_status' then b.status
 when 'factory_product' then case when b.factory is not null and b.product_type is not null then b.factory||' · '||b.product_type end
 when 'quantity_deviation_class' then case when b.ordered_quantity is null or b.delivered_quantity is null then 'Unbekannt' when b.delivered_quantity<b.ordered_quantity then 'Unterliefert' when b.delivered_quantity>b.ordered_quantity then 'Überliefert' else 'Exakt' end
 when 'credit_block' then case when b.credit_block_count is null then 'Unbekannt' when b.credit_block_count>0 then 'Ja' else 'Nein' end
 when 'quantity_change_phase' then b.quantity_change_phase
 when 'process_order_quality' then b.process_order_quality
 when 'process_variant' then b.process_variant
 when 'order_size_class' then case when b.delivered_quantity_unit is distinct from 'kg' or b.ordered_quantity is null or b.ordered_quantity<0 then 'Nicht klassifizierbar' when b.ordered_quantity<=1000 then '≤ 1.000 kg' when b.ordered_quantity<=5000 then '> 1.000–5.000 kg' when b.ordered_quantity<=10000 then '> 5.000–10.000 kg' else '> 10.000 kg' end
 when 'cust_id' then b.cust_id
 when 'cust_name' then b.cust_name
 when 'quantity_change_group' then case when b.quantity_change_count is null then 'Unbekannt' when b.quantity_change_count>=3 then '3+' else b.quantity_change_count::text end
 when 'delivery_month' then to_char(b.delivered_date,'YYYY-MM')
 when 'order_received_month' then to_char(b.order_received_ts,'YYYY-MM')
 when 'promised_month' then to_char(b.promised_date,'YYYY-MM')
 end order by d.ord) from unnest(v_dims) with ordinality d(dim,ord)),'[]'::jsonb) labels from base b),
 grouped as materialized(select labels,count(*)::int orders,
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
 round(coalesce(sum(late_cost),0),2) late_cost,round(coalesce(sum(short_cost),0),2) short_cost,round(coalesce(sum(late_cost+short_cost),0),2) total_cost from labelled group by labels),
 matching as materialized(select * from grouped where v_search='' or strpos(lower(labels::text),lower(v_search))>0),
 page as (select * from matching order by case v_sort when 'orders' then orders::numeric when 'late' then late_cost when 'short' then short_cost when 'weight' then ordered_kg else total_cost end desc nulls last,labels::text offset v_page::bigint*v_size limit v_size)
 select jsonb_build_object('total',(select count(*) from matching),'rows',coalesce((select jsonb_agg(to_jsonb(p) order by case v_sort when 'orders' then p.orders::numeric when 'late' then p.late_cost when 'short' then p.short_cost when 'weight' then p.ordered_kg else p.total_cost end desc nulls last,p.labels::text) from page p),'[]'::jsonb),'baseline',(select to_jsonb(t) from (select count(*)::int orders,
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
 round(coalesce(sum(late_cost),0),2) late_cost,round(coalesce(sum(short_cost),0),2) short_cost,round(coalesce(sum(late_cost+short_cost),0),2) total_cost from base)t),'dimensions',to_jsonb(v_dims)) into result;
 elsif p_mode='compare' then
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
 and (v_variant is null or pf.process_variant=v_variant)
), base as materialized (select * from scope where v_status is null or status=v_status),
 labelled as materialized (select b.*,case v_exposure
 when 'factory' then b.factory
 when 'product_type' then b.product_type
 when 'delivery_company' then b.delivery_company
 when 'warehouse_type' then b.warehouse_type
 when 'cust_country' then b.cust_country
 when 'delivery_year' then extract(year from b.delivered_date)::int::text
 when 'cust_market' then b.cust_market
 when 'delivered_quantity_unit' then b.delivered_quantity_unit
 when 'cust_addr_code' then b.cust_addr_code
 when 'order_tolerance_met' then b.order_tolerance_met::text
 when 'otif_status' then b.status
 when 'factory_product' then case when b.factory is not null and b.product_type is not null then b.factory||' · '||b.product_type end
 when 'quantity_deviation_class' then case when b.ordered_quantity is null or b.delivered_quantity is null then 'Unbekannt' when b.delivered_quantity<b.ordered_quantity then 'Unterliefert' when b.delivered_quantity>b.ordered_quantity then 'Überliefert' else 'Exakt' end
 when 'credit_block' then case when b.credit_block_count is null then 'Unbekannt' when b.credit_block_count>0 then 'Ja' else 'Nein' end
 when 'quantity_change_phase' then b.quantity_change_phase
 when 'process_order_quality' then b.process_order_quality
 when 'process_variant' then b.process_variant
 when 'order_size_class' then case when b.delivered_quantity_unit is distinct from 'kg' or b.ordered_quantity is null or b.ordered_quantity<0 then 'Nicht klassifizierbar' when b.ordered_quantity<=1000 then '≤ 1.000 kg' when b.ordered_quantity<=5000 then '> 1.000–5.000 kg' when b.ordered_quantity<=10000 then '> 5.000–10.000 kg' else '> 10.000 kg' end
 when 'cust_id' then b.cust_id
 when 'cust_name' then b.cust_name
 when 'quantity_change_group' then case when b.quantity_change_count is null then 'Unbekannt' when b.quantity_change_count>=3 then '3+' else b.quantity_change_count::text end
 when 'delivery_month' then to_char(b.delivered_date,'YYYY-MM')
 when 'order_received_month' then to_char(b.order_received_ts,'YYYY-MM')
 when 'promised_month' then to_char(b.promised_date,'YYYY-MM')
 end exposure,coalesce((select jsonb_agg(case d.dim
 when 'factory' then b.factory
 when 'product_type' then b.product_type
 when 'delivery_company' then b.delivery_company
 when 'warehouse_type' then b.warehouse_type
 when 'cust_country' then b.cust_country
 when 'delivery_year' then extract(year from b.delivered_date)::int::text
 when 'cust_market' then b.cust_market
 when 'delivered_quantity_unit' then b.delivered_quantity_unit
 when 'cust_addr_code' then b.cust_addr_code
 when 'order_tolerance_met' then b.order_tolerance_met::text
 when 'otif_status' then b.status
 when 'factory_product' then case when b.factory is not null and b.product_type is not null then b.factory||' · '||b.product_type end
 when 'quantity_deviation_class' then case when b.ordered_quantity is null or b.delivered_quantity is null then 'Unbekannt' when b.delivered_quantity<b.ordered_quantity then 'Unterliefert' when b.delivered_quantity>b.ordered_quantity then 'Überliefert' else 'Exakt' end
 when 'credit_block' then case when b.credit_block_count is null then 'Unbekannt' when b.credit_block_count>0 then 'Ja' else 'Nein' end
 when 'quantity_change_phase' then b.quantity_change_phase
 when 'process_order_quality' then b.process_order_quality
 when 'process_variant' then b.process_variant
 when 'order_size_class' then case when b.delivered_quantity_unit is distinct from 'kg' or b.ordered_quantity is null or b.ordered_quantity<0 then 'Nicht klassifizierbar' when b.ordered_quantity<=1000 then '≤ 1.000 kg' when b.ordered_quantity<=5000 then '> 1.000–5.000 kg' when b.ordered_quantity<=10000 then '> 5.000–10.000 kg' else '> 10.000 kg' end
 when 'cust_id' then b.cust_id
 when 'cust_name' then b.cust_name
 when 'quantity_change_group' then case when b.quantity_change_count is null then 'Unbekannt' when b.quantity_change_count>=3 then '3+' else b.quantity_change_count::text end
 when 'delivery_month' then to_char(b.delivered_date,'YYYY-MM')
 when 'order_received_month' then to_char(b.order_received_ts,'YYYY-MM')
 when 'promised_month' then to_char(b.promised_date,'YYYY-MM')
 end order by d.ord) from unnest(v_dims) with ordinality d(dim,ord)),'[]'::jsonb) labels from base b),
 matched as materialized (select *,case when exposure=v_a then 'A' else 'B' end as arm from labelled where exposure in(v_a,v_b)),
 grouped as (select arm,labels,count(*)::int orders,
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
 round(coalesce(sum(late_cost),0),2) late_cost,round(coalesce(sum(short_cost),0),2) short_cost,round(coalesce(sum(late_cost+short_cost),0),2) total_cost from matched group by arm,labels)
 select jsonb_build_object('total',(select count(*) from base),'rows',coalesce((select jsonb_agg(to_jsonb(g) order by labels::text,arm) from grouped g),'[]'::jsonb),'dimensions',to_jsonb(v_dims),'exposure',v_exposure,'a',v_a,'b',v_b) into result;
 elsif p_mode='process' then
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
 and (v_variant is null or pf.process_variant=v_variant)
), base as materialized (select * from scope where v_status is null or status=v_status),
 events as materialized (select a.* from public.woodcorp_activities a join base b on b.case_key=a.case_key),
 retained as (select *,count(*) over(partition by case_key,eventtime) tied from events where v_order='source' or (eventtime is not null and not coalesce(is_timestamp_anomaly,false))),
 seq as (select *,lag(activity_en) over w previous_activity,lag(eventtime) over w previous_time,lag(tied) over w previous_tied,lag(is_timestamp_anomaly) over w previous_anomaly from retained
 window w as(partition by case_key order by case when v_order='source' then sorting end nulls last,case when v_order='chronological' then eventtime end nulls last,sorting nulls last,event_id)),
 transitions as (select case_key,previous_activity source,activity_en target,case when v_order='chronological' and previous_time<eventtime and previous_tied=1 and tied=1 and not coalesce(previous_anomaly,false) and not coalesce(is_timestamp_anomaly,false) then extract(epoch from eventtime-previous_time)/86400 end duration from seq where previous_activity is not null and activity_en is not null),
 activities as (select activity_en activity,count(*) events,count(distinct case_key) cases,min(sorting) display_order from retained where activity_en is not null group by activity_en),
 links as (select source,target,count(*) transitions,count(distinct case_key) cases,count(duration) valid_duration,round((percentile_cont(.5) within group(order by duration))::numeric,3) median_days,round((percentile_cont(.9) within group(order by duration))::numeric,3) p90_days from transitions group by source,target)
 select jsonb_build_object('cases',(select count(*) from base),'events',(select count(*) from events),'retained',(select count(*) from retained),'representedCases',(select count(distinct case_key) from retained),'activities',coalesce((select jsonb_agg(to_jsonb(a) order by display_order,activity) from activities a),'[]'::jsonb),'links',coalesce((select jsonb_agg(to_jsonb(l) order by transitions desc,source,target) from links l),'[]'::jsonb),'sequence',v_order) into result;
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
 and (v_variant is null or pf.process_variant=v_variant)
), base as materialized (select * from scope where v_status is null or status=v_status),
 events as materialized (select a.*,b.delivered_date,b.promised_date from public.woodcorp_activities a join base b on b.case_key=a.case_key),
 timed as (select *,count(*) over(partition by case_key,eventtime) ties from events),
 event_flags as (select case_key,count(*) event_count,count(*) filter(where coalesce(is_timestamp_anomaly,false) or eventtime is null) bad_time,count(*) filter(where eventtime is not null and ties>1) tied_events,
 count(*) filter(where activity_en='Goods delivered') gd_count,
 count(*) filter(where activity_en='Goods delivered' and eventtime is not null and delivered_date is not null) gd_actual_n,
 count(*) filter(where activity_en='Goods delivered' and eventtime::date=delivered_date::date) gd_actual_match,
 count(*) filter(where activity_en='Goods delivered' and eventtime is not null and promised_date is not null) gd_promise_n,
 count(*) filter(where activity_en='Goods delivered' and eventtime::date=promised_date::date) gd_promise_match,
 array_agg(distinct activity_en) activity_set from timed group by case_key),
 required(activity) as (values ('Order received'),('Confirm sale'),('Check Credit Score'),('Start production'),('Finished production'),('Load shipment'),('Goods delivered')),
 activity_coverage as (select r.activity,count(*) filter(where r.activity=any(e.activity_set)) present,count(*) total from required r cross join base b left join event_flags e on e.case_key=b.case_key group by r.activity),
 interval_coverage as (select i.name,count(*) total,count(i.days) present,count(*) filter(where i.days<0) negative,count(*) filter(where i.days>=0) valid,round((percentile_cont(.5) within group(order by i.days) filter(where i.days>=0))::numeric,3) median_days,round((percentile_cont(.9) within group(order by i.days) filter(where i.days>=0))::numeric,3) p90_days from base b cross join lateral(values ('order_confirmation',b.order_confirmation_days),('production_preparation',b.production_preparation_days),('order_to_start',b.order_to_start_days),('production',b.production_days),('production_to_ship',b.production_to_ship_days),('ship_to_delivery',b.ship_to_delivery_days),('order_to_delivery',b.order_to_delivery_days)) i(name,days) group by i.name),
 checks as (select count(*) orders,count(distinct b.case_key) distinct_keys,count(*) filter(where e.case_key is null) missing_events,count(*) filter(where b.feature_key is null) missing_features,count(*) filter(where b.interval_key is null) missing_intervals,
 count(*) filter(where b.on_time is null) missing_dates,count(*) filter(where b.in_full is null) missing_tolerance,count(*) filter(where b.delivered_quantity_unit is distinct from 'kg') other_units,count(*) filter(where b.ordered_quantity is null or b.delivered_quantity is null) missing_quantity,
 count(*) filter(where b.ordered_quantity<0 or b.delivered_quantity<0) negative_quantity,
 count(*) filter(where b.order_date_met is not null and b.on_time is not null and (b.order_date_met=1)<>b.on_time) date_flag_mismatch,
 count(*) filter(where b.ordered_quantity>0 and b.delivered_quantity is not null and b.min_order_tolerance is not null and b.max_order_tolerance is not null and b.in_full is not null) tolerance_checked,
 count(*) filter(where b.ordered_quantity>0 and b.delivered_quantity is not null and b.min_order_tolerance is not null and b.max_order_tolerance is not null and b.in_full is not null and (100*(b.delivered_quantity-b.ordered_quantity)/nullif(b.ordered_quantity,0) between b.min_order_tolerance and b.max_order_tolerance)<>b.in_full) tolerance_mismatch,
 count(*) filter(where b.ordered_quantity is not null and b.sales_order_position_quantity is not null and b.ordered_quantity<>b.sales_order_position_quantity) alternate_quantity_mismatch,
 count(*) filter(where coalesce(e.bad_time,0)>0) bad_time_cases,coalesce(sum(e.bad_time),0) bad_time_events,count(*) filter(where coalesce(e.tied_events,0)>0) tied_cases,coalesce(sum(e.tied_events),0) tied_events,
 coalesce(sum(e.event_count),0) events,coalesce(sum(e.gd_actual_n),0) gd_actual_n,coalesce(sum(e.gd_actual_match),0) gd_actual_match,coalesce(sum(e.gd_promise_n),0) gd_promise_n,coalesce(sum(e.gd_promise_match),0) gd_promise_match,
 count(*) filter(where coalesce(e.gd_count,0)>1) multiple_goods_delivered,
 count(*) filter(where b.process_order_quality='Chronologisch plausibel') chronological_plausible
 from base b left join event_flags e on e.case_key=b.case_key)
 select jsonb_build_object('checks',(select to_jsonb(c) from checks c),'activities',coalesce((select jsonb_agg(to_jsonb(a) order by activity) from activity_coverage a),'[]'::jsonb),'intervals',coalesce((select jsonb_agg(to_jsonb(i) order by name) from interval_coverage i),'[]'::jsonb),'orphanEvents',case when p_filters='[]'::jsonb and v_variant is null and v_status is null then (select count(*) from public.woodcorp_activities a where not exists(select 1 from public.woodcorp_cases c where c.case_key=a.case_key)) else null end) into result;
 end if;
 return result||jsonb_build_object('definitionVersion','woodcorp-otif-financial-v1','researchVersion',1,'penaltyRate',0.75);
end
$research$;
revoke all on function public.nxt_deep_analysis(text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.nxt_deep_analysis(text,jsonb,jsonb) to authenticated;
