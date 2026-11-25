-- Run in a transaction with rollback when testing role claims.
do $p2$
declare x jsonb;y jsonb;z jsonb;n int;k text;a text;b text;pattern jsonb;
begin
 y:=public.nxt_case_metrics('[]');
 x:=public.nxt_process_analysis('catalog','[]','{}');
 if jsonb_array_length(x->'activityNames')<>(select count(distinct activity_en) from public.woodcorp_activities) then raise exception 'ACTIVITY_CATALOG_MISMATCH';end if;
 x:=public.nxt_process_analysis('conformance','[]','{}');
 if (x->>'cases')::int<>(y->>'orders')::int or (select sum((r->>'orders')::int) from jsonb_array_elements(x->'rows') r)<>(y->>'orders')::int or (select sum((r->>'total_cost')::numeric) from jsonb_array_elements(x->'rows') r)<>(y->>'totalPenaltyEur')::numeric then raise exception 'CONFORMANCE_PARTITION_MISMATCH';end if;
 if exists(select 1 from jsonb_array_elements(x->'rules') r where (r->>'matched_cases')::int+(r->>'deviation_cases')::int+(r->>'unknown_cases')::int<>(y->>'orders')::int) then raise exception 'RULE_COUNT_MISMATCH';end if;
 pattern:='{"kind":"repeated","a":"Change quantity","minOccurrences":2}';
 x:=public.nxt_process_analysis('patterns','[]',jsonb_build_object('pattern',pattern));
 select (r->>'orders')::int into n from jsonb_array_elements(x->'rows') r where r->>'status'='match';
 if n<>(select count(*) from (select case_key from public.woodcorp_activities where activity_en='Change quantity' group by case_key having count(*)>=2)t) then raise exception 'REPEATED_PATTERN_MISMATCH';end if;
 z:=public.nxt_process_analysis('cases','[]',jsonb_build_object('pattern',pattern,'patternState','match','pageSize',10));
 if (z->>'total')::int<>n then raise exception 'PATTERN_DRILL_MISMATCH';end if;
 k:=z->'rows'->0->>'case_key';z:=public.nxt_process_analysis('case','[]',jsonb_build_object('caseKey',k,'pattern',pattern,'patternState','match'));
 if z->'case'->>'case_key'<>k then raise exception 'PATTERN_CASE_DETAIL_MISMATCH';end if;
 z:=public.nxt_process_analysis('case','[]',jsonb_build_object('caseKey',k,'pattern',pattern,'patternState','no_match'));
 if z->'case'<>'null'::jsonb then raise exception 'PATTERN_CASE_SCOPE_LEAK';end if;
 x:=public.nxt_process_analysis('rework','[]','{}');
 if (select (r->>'repeated_cases')::int from jsonb_array_elements(x->'rows') r where r->>'activity'='Change quantity')<>n then raise exception 'REWORK_COUNT_MISMATCH';end if;
 x:=public.nxt_process_analysis('bottlenecks','[]','{}');
 if (x->>'events')::int<>(select count(*) from public.woodcorp_activities) or jsonb_array_length(x->'links')=0 then raise exception 'BOTTLENECK_COUNT_MISMATCH';end if;
 a:=x->'links'->0->>'source';b:=x->'links'->0->>'target';n:=(x->'links'->0->>'cases')::int;
 z:=public.nxt_process_analysis('patterns','[]',jsonb_build_object('pattern',jsonb_build_object('kind','direct','a',a,'b',b)));
 if (select (r->>'orders')::int from jsonb_array_elements(z->'rows') r where r->>'status'='match')<>n then raise exception 'BOTTLENECK_PATTERN_DRILL_MISMATCH';end if;
 x:=public.nxt_process_analysis('patterns','[{"field":"factory","op":"eq","value":"__nonexistent__"}]',jsonb_build_object('pattern',pattern));if (x->>'cases')::int<>0 then raise exception 'EMPTY_SCOPE_MISMATCH';end if;
 if has_function_privilege('anon','public.nxt_process_analysis(text,jsonb,jsonb)','execute') then raise exception 'ANON_EXECUTE';end if;
 begin perform public.nxt_process_analysis('patterns','[]','{"pattern":{"kind":"direct","a":"injected","b":"Load shipment"}}');raise exception 'INVALID_PATTERN_ACCEPTED';exception when sqlstate '22023' then null;end;
end $p2$;
