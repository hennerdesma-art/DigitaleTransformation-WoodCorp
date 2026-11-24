-- WoodCorp root-cause analytics expansion. Existing source data and KPI definitions retained.
-- Feature snapshot: derived from the same existing case/event tables and E02 intervals.
ALTER TABLE public.nxt_case_process_features
 ADD COLUMN IF NOT EXISTS credit_block_count integer,
 ADD COLUMN IF NOT EXISTS confirm_sale_ts timestamp,
 ADD COLUMN IF NOT EXISTS order_confirmation_days numeric,
 ADD COLUMN IF NOT EXISTS production_preparation_days numeric,
 ADD COLUMN IF NOT EXISTS quantity_changes_after_start integer,
 ADD COLUMN IF NOT EXISTS quantity_changes_after_end integer,
 ADD COLUMN IF NOT EXISTS quantity_changes_after_ship integer,
 ADD COLUMN IF NOT EXISTS quantity_change_phase text,
 ADD COLUMN IF NOT EXISTS process_order_quality text,
 ADD COLUMN IF NOT EXISTS process_variant text;
WITH e AS (
 SELECT a.case_key,
 count(*) FILTER (WHERE activity_en='Credit order block')::integer AS credit_blocks,
 min(eventtime) FILTER (WHERE activity_en='Confirm sale' AND NOT is_timestamp_anomaly) AS confirmation,
 max(eventtime) FILTER (WHERE activity_en='Change quantity' AND NOT is_timestamp_anomaly) AS last_change,
 count(*) FILTER (WHERE activity_en='Change quantity')::integer AS quantity_events,
 count(*) FILTER (WHERE activity_en='Change quantity' AND is_timestamp_anomaly)::integer AS invalid_changes,
 CASE WHEN ei.start_production_ts IS NOT NULL THEN count(*) FILTER (WHERE activity_en='Change quantity' AND NOT is_timestamp_anomaly AND eventtime::date>ei.start_production_ts::date)::integer END AS after_start,
 CASE WHEN ei.finished_production_ts IS NOT NULL THEN count(*) FILTER (WHERE activity_en='Change quantity' AND NOT is_timestamp_anomaly AND eventtime::date>ei.finished_production_ts::date)::integer END AS after_end,
 CASE WHEN ei.load_shipment_ts IS NOT NULL THEN count(*) FILTER (WHERE activity_en='Change quantity' AND NOT is_timestamp_anomaly AND eventtime::date>ei.load_shipment_ts::date)::integer END AS after_ship,
 string_agg(CASE activity_en WHEN 'Order received' THEN 'OR' WHEN 'Check Credit Score' THEN 'CC' WHEN 'Credit order block' THEN 'CB' WHEN 'Confirm sale' THEN 'CS' WHEN 'Change quantity' THEN 'CQ' WHEN 'Change delivery date' THEN 'CD' WHEN 'Change production start date' THEN 'CP' WHEN 'Change price' THEN 'PR' WHEN 'Start production' THEN 'SP' WHEN 'Finished production' THEN 'FP' WHEN 'Load shipment' THEN 'LS' WHEN 'Goods delivered' THEN 'GD' ELSE '?' END,'>' ORDER BY sorting,event_id) AS variant
 FROM public.woodcorp_activities a LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=a.case_key
 GROUP BY a.case_key,ei.start_production_ts,ei.finished_production_ts,ei.load_shipment_ts
)
UPDATE public.nxt_case_process_features pf SET
 credit_block_count=e.credit_blocks,confirm_sale_ts=e.confirmation,
 order_confirmation_days=extract(epoch FROM(e.confirmation-ei.order_received_ts))/86400,
 production_preparation_days=extract(epoch FROM(ei.start_production_ts-e.confirmation))/86400,
 quantity_changes_after_start=e.after_start,quantity_changes_after_end=e.after_end,quantity_changes_after_ship=e.after_ship,
 quantity_change_phase=CASE WHEN e.quantity_events=0 THEN 'Keine Änderung'
 WHEN e.invalid_changes>0 OR e.last_change IS NULL OR ei.start_production_ts IS NULL OR ei.finished_production_ts IS NULL OR ei.load_shipment_ts IS NULL
 OR ei.start_production_ts>ei.finished_production_ts OR ei.finished_production_ts>ei.load_shipment_ts
 OR e.last_change::date IN (ei.start_production_ts::date,ei.finished_production_ts::date,ei.load_shipment_ts::date) THEN 'Nicht eindeutig'
 WHEN e.last_change::date<ei.start_production_ts::date THEN 'Vor Produktion'
 WHEN e.last_change::date<ei.finished_production_ts::date THEN 'Während Produktion'
 WHEN e.last_change::date<ei.load_shipment_ts::date THEN 'Nach Produktion'
 ELSE 'Nach Verladung' END,
 process_order_quality=CASE WHEN ei.has_source_anomaly OR pf.anomalous_event_count>0 THEN 'Zeitstempel-Anomalie'
 WHEN ei.order_received_ts IS NULL OR e.confirmation IS NULL OR ei.start_production_ts IS NULL OR ei.finished_production_ts IS NULL OR ei.load_shipment_ts IS NULL OR ei.actual_delivery_ts IS NULL THEN 'Meilenstein fehlt'
 WHEN ei.production_days<0 OR ei.production_to_ship_days<0 OR ei.ship_to_delivery_days<0 OR e.confirmation<ei.order_received_ts THEN 'Reihenfolge auffällig'
 WHEN ei.order_to_start_days<0 THEN 'Produktion vor Auftrag'
 ELSE 'Chronologisch plausibel' END,
 process_variant=e.variant
 FROM e JOIN public.nxt_e02_case_intervals ei ON ei.case_key=e.case_key WHERE pf.case_key=e.case_key;

CREATE OR REPLACE FUNCTION public.nxt_validate_filters(p_filters jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE f jsonb; field text; op text; v jsonb; element jsonb;
  date_fields text[]:=ARRAY['delivered_date','promised_date','order_received_date'];
  number_fields text[]:=ARRAY['ordered_quantity','delivered_quantity','order_value','days_to_del_deadline',
    'quantity_change_count','delivery_date_change_count','production_start_change_count','price_change_count','anomalous_event_count','quantity_deviation_pct','penalty_eur','order_confirmation_days','production_preparation_days','order_to_start_days','production_days','production_to_ship_days','ship_to_delivery_days','order_to_delivery_days','shipment_buffer_days','start_buffer_days','end_buffer_days','quantity_changes_after_start','quantity_changes_after_end','quantity_changes_after_ship','min_order_tolerance','max_order_tolerance','unit_price'];
  cat_fields text[]:=ARRAY['factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year',
    'cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','quantity_change_group','delivery_month'];
BEGIN
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'array' OR jsonb_array_length(p_filters)>12 THEN
  RAISE EXCEPTION 'INVALID_FILTERS_FORMAT' USING ERRCODE='22023';
 END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
  IF jsonb_typeof(f)<>'object' THEN RAISE EXCEPTION 'INVALID_FILTER_OBJECT' USING ERRCODE='22023'; END IF;
  field:=f->>'field';op:=f->>'op';v:=f->'value';
  IF field=ANY(cat_fields) THEN
   IF op NOT IN ('eq','in') THEN RAISE EXCEPTION 'INVALID_CATEGORY_OPERATOR %',op USING ERRCODE='22023'; END IF;
   IF op='eq' AND (jsonb_typeof(v)<>'string' OR length(f->>'value') NOT BETWEEN 1 AND 200) THEN
    RAISE EXCEPTION 'INVALID_CATEGORY_VALUE' USING ERRCODE='22023';END IF;
   IF op='in' AND (jsonb_typeof(v)<>'array' OR jsonb_array_length(v) NOT BETWEEN 1 AND 20) THEN
    RAISE EXCEPTION 'INVALID_MULTISELECT' USING ERRCODE='22023';END IF;
   IF op='in' THEN
    FOR element IN SELECT value FROM jsonb_array_elements(v) LOOP
     IF jsonb_typeof(element)<>'string' OR length(trim(element#>>'{}')) NOT BETWEEN 1 AND 200 THEN
      RAISE EXCEPTION 'INVALID_MULTISELECT_VALUE' USING ERRCODE='22023';END IF;
    END LOOP;
   END IF;
  ELSIF field=ANY(date_fields) OR field=ANY(number_fields) THEN
   IF op NOT IN ('between','gte','lte','eq') THEN RAISE EXCEPTION 'INVALID_RANGE_OPERATOR' USING ERRCODE='22023';END IF;
   IF op='between' AND (jsonb_typeof(v)<>'array' OR jsonb_array_length(v)<>2) THEN
    RAISE EXCEPTION 'INVALID_RANGE' USING ERRCODE='22023';END IF;
   IF op<>'between' AND jsonb_typeof(v)<>'string' THEN RAISE EXCEPTION 'INVALID_SCALAR' USING ERRCODE='22023';END IF;
   FOR element IN SELECT value FROM (SELECT CASE WHEN op='between' THEN v ELSE jsonb_build_array(v) END AS arr) x,
       LATERAL jsonb_array_elements(x.arr) LOOP
    IF jsonb_typeof(element)<>'string' THEN RAISE EXCEPTION 'INVALID_RANGE_VALUE' USING ERRCODE='22023';END IF;
    IF field=ANY(date_fields) THEN
     IF NOT (element#>>'{}' ~ '^\d{4}-\d{2}-\d{2}$') THEN RAISE EXCEPTION 'INVALID_DATE' USING ERRCODE='22023';END IF;
     PERFORM (element#>>'{}')::date;
    ELSE
     IF NOT (element#>>'{}' ~ '^-?\d{1,12}(\.\d{1,6})?$') THEN RAISE EXCEPTION 'INVALID_NUMBER' USING ERRCODE='22023';END IF;
     PERFORM (element#>>'{}')::numeric;
    END IF;
   END LOOP;
   IF op='between' AND (v->>0)>(v->>1) AND field=ANY(date_fields) THEN RAISE EXCEPTION 'INVALID_DATE_ORDER' USING ERRCODE='22023';END IF;
   IF op='between' AND field=ANY(number_fields) AND (v->>0)::numeric>(v->>1)::numeric THEN RAISE EXCEPTION 'INVALID_NUMBER_ORDER' USING ERRCODE='22023';END IF;
  ELSE
   RAISE EXCEPTION 'UNSUPPORTED_FILTER_FIELD %',field USING ERRCODE='22023';
  END IF;
 END LOOP;
 RETURN TRUE;
END $function$
;

CREATE OR REPLACE FUNCTION public.nxt_case_matches(c woodcorp_cases, p_filters jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  f jsonb; field_name text; operation text;
  category text; date_value date; numeric_value numeric;
  is_category boolean; is_date boolean; matched boolean;
  pf public.nxt_case_process_features%ROWTYPE;
  feature_loaded boolean:=false;
  ei public.nxt_e02_case_intervals%ROWTYPE;
  interval_loaded boolean:=false;
BEGIN
  IF p_filters IS NULL OR p_filters = '[]'::jsonb THEN RETURN true; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
    field_name:=f->>'field';operation:=f->>'op';
    is_date:=field_name IN ('delivered_date','promised_date','order_received_date');
    is_category:=field_name IN ('factory','product_type','delivery_company','warehouse_type','cust_country',
      'delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','quantity_change_group','delivery_month');
    category:=NULL;date_value:=NULL;numeric_value:=NULL;
    IF field_name IN ('credit_block','quantity_change_phase','process_order_quality','process_variant','quantity_change_group','order_confirmation_days','production_preparation_days','quantity_changes_after_start','quantity_changes_after_end','quantity_changes_after_ship','quantity_change_count','delivery_date_change_count','production_start_change_count','price_change_count','anomalous_event_count') AND NOT feature_loaded THEN
      SELECT * INTO pf FROM public.nxt_case_process_features z WHERE z.case_key=c.case_key;feature_loaded:=true;
    END IF;
    IF field_name IN ('order_to_start_days','production_days','production_to_ship_days','ship_to_delivery_days','order_to_delivery_days','shipment_buffer_days','start_buffer_days','end_buffer_days','order_received_date') AND NOT interval_loaded THEN
      SELECT * INTO ei FROM public.nxt_e02_case_intervals z WHERE z.case_key=c.case_key;interval_loaded:=true;
    END IF;
    IF is_category THEN
      category:=CASE field_name
        WHEN 'factory_product' THEN CASE WHEN c.factory IS NOT NULL AND c.product_type IS NOT NULL THEN c.factory||' · '||c.product_type END
        WHEN 'quantity_deviation_class' THEN CASE WHEN c.ordered_quantity IS NULL OR c.delivered_quantity IS NULL THEN 'Unbekannt' WHEN c.delivered_quantity<c.ordered_quantity THEN 'Unterliefert' WHEN c.delivered_quantity>c.ordered_quantity THEN 'Überliefert' ELSE 'Exakt' END
        WHEN 'credit_block' THEN CASE WHEN pf.credit_block_count IS NULL THEN 'Unbekannt' WHEN pf.credit_block_count>0 THEN 'Ja' ELSE 'Nein' END
        WHEN 'quantity_change_phase' THEN pf.quantity_change_phase
        WHEN 'process_order_quality' THEN pf.process_order_quality
        WHEN 'process_variant' THEN pf.process_variant
        WHEN 'order_size_class' THEN CASE WHEN c.delivered_quantity_unit IS DISTINCT FROM 'kg' OR c.ordered_quantity IS NULL OR c.ordered_quantity<0 THEN 'Nicht klassifizierbar' WHEN c.ordered_quantity<=1000 THEN '≤ 1.000 kg' WHEN c.ordered_quantity<=5000 THEN '> 1.000–5.000 kg' WHEN c.ordered_quantity<=10000 THEN '> 5.000–10.000 kg' ELSE '> 10.000 kg' END
        WHEN 'cust_id' THEN c.cust_id
        WHEN 'quantity_change_group' THEN CASE WHEN pf.quantity_change_count IS NULL THEN 'Unbekannt' WHEN pf.quantity_change_count>=3 THEN '3+' ELSE pf.quantity_change_count::text END
        WHEN 'delivery_month' THEN to_char(c.delivered_date,'YYYY-MM')
        WHEN 'factory' THEN c.factory WHEN 'product_type' THEN c.product_type
        WHEN 'delivery_company' THEN c.delivery_company WHEN 'warehouse_type' THEN c.warehouse_type
        WHEN 'cust_country' THEN c.cust_country
        WHEN 'delivery_year' THEN extract(year from c.delivered_date)::int::text
        WHEN 'cust_market' THEN c.cust_market WHEN 'delivered_quantity_unit' THEN c.delivered_quantity_unit
        WHEN 'cust_addr_code' THEN c.cust_addr_code WHEN 'order_tolerance_met' THEN c.order_tolerance_met::text
        WHEN 'otif_status' THEN CASE
          WHEN c.delivered_date IS NULL OR c.promised_date IS NULL OR c.order_tolerance_met IS NULL THEN 'unknown'
          WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met=1 THEN 'on_time_in_full'
          WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met<>1 THEN 'on_time_not_full'
          WHEN c.delivered_date>c.promised_date AND c.order_tolerance_met=1 THEN 'late_in_full'
          ELSE 'late_not_full' END END;
    ELSIF is_date THEN
      date_value:=CASE field_name WHEN 'delivered_date' THEN c.delivered_date::date WHEN 'promised_date' THEN c.promised_date::date WHEN 'order_received_date' THEN ei.order_received_ts::date END;
    ELSE
      IF field_name IN ('quantity_change_count','delivery_date_change_count','production_start_change_count',
          'price_change_count','anomalous_event_count') AND NOT feature_loaded THEN
        SELECT * INTO pf FROM public.nxt_case_process_features z WHERE z.case_key=c.case_key;
        feature_loaded:=true;
      END IF;
      numeric_value:=CASE field_name
        WHEN 'quantity_deviation_pct' THEN 100*(c.delivered_quantity-c.ordered_quantity)/NULLIF(c.ordered_quantity,0)
        WHEN 'penalty_eur' THEN CASE WHEN c.delivered_quantity_unit='kg' THEN CASE WHEN c.delivered_date>c.promised_date THEN COALESCE(c.delivered_quantity,0)*0.75 ELSE 0 END + CASE WHEN c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL THEN GREATEST(c.ordered_quantity-c.delivered_quantity,0)*0.75 ELSE 0 END END
        WHEN 'order_confirmation_days' THEN pf.order_confirmation_days
        WHEN 'production_preparation_days' THEN pf.production_preparation_days
        WHEN 'order_to_start_days' THEN ei.order_to_start_days
        WHEN 'production_days' THEN ei.production_days
        WHEN 'production_to_ship_days' THEN ei.production_to_ship_days
        WHEN 'ship_to_delivery_days' THEN ei.ship_to_delivery_days
        WHEN 'order_to_delivery_days' THEN ei.order_to_delivery_days
        WHEN 'shipment_buffer_days' THEN extract(epoch FROM(c.promised_date-ei.load_shipment_ts))/86400
        WHEN 'start_buffer_days' THEN extract(epoch FROM(c.promised_date-ei.start_production_ts))/86400
        WHEN 'end_buffer_days' THEN extract(epoch FROM(c.promised_date-ei.finished_production_ts))/86400
        WHEN 'quantity_changes_after_start' THEN pf.quantity_changes_after_start
        WHEN 'quantity_changes_after_end' THEN pf.quantity_changes_after_end
        WHEN 'quantity_changes_after_ship' THEN pf.quantity_changes_after_ship
        WHEN 'min_order_tolerance' THEN c.min_order_tolerance
        WHEN 'max_order_tolerance' THEN c.max_order_tolerance
        WHEN 'unit_price' THEN c.unit_price
        WHEN 'ordered_quantity' THEN c.ordered_quantity
        WHEN 'delivered_quantity' THEN c.delivered_quantity
        WHEN 'order_value' THEN c.order_value
        WHEN 'days_to_del_deadline' THEN c.days_to_del_deadline
        WHEN 'quantity_change_count' THEN coalesce(pf.quantity_change_count,0)
        WHEN 'delivery_date_change_count' THEN coalesce(pf.delivery_date_change_count,0)
        WHEN 'production_start_change_count' THEN coalesce(pf.production_start_change_count,0)
        WHEN 'price_change_count' THEN coalesce(pf.price_change_count,0)
        WHEN 'anomalous_event_count' THEN coalesce(pf.anomalous_event_count,0)
        ELSE NULL END;
    END IF;
    matched:=CASE operation
      WHEN 'eq' THEN CASE WHEN is_category THEN category=f->>'value'
        WHEN is_date THEN date_value=(f->>'value')::date
        ELSE numeric_value=(f->>'value')::numeric END
      WHEN 'in' THEN is_category AND category IN(SELECT jsonb_array_elements_text(f->'value'))
      WHEN 'gte' THEN CASE WHEN is_date THEN date_value>=(f->>'value')::date ELSE numeric_value>=(f->>'value')::numeric END
      WHEN 'lte' THEN CASE WHEN is_date THEN date_value<=(f->>'value')::date ELSE numeric_value<=(f->>'value')::numeric END
      WHEN 'between' THEN CASE WHEN is_date THEN date_value BETWEEN (f->'value'->>0)::date AND (f->'value'->>1)::date
        ELSE numeric_value BETWEEN (f->'value'->>0)::numeric AND (f->'value'->>1)::numeric END
      ELSE false END;
    IF matched IS DISTINCT FROM true THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $function$
;

CREATE OR REPLACE FUNCTION public.nxt_dimensions()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
SELECT jsonb_build_object(
 'factory',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT factory v FROM public.woodcorp_cases WHERE factory IS NOT NULL)x),
 'product_type',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT product_type v FROM public.woodcorp_cases WHERE product_type IS NOT NULL)x),
 'delivery_company',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT delivery_company v FROM public.woodcorp_cases WHERE delivery_company IS NOT NULL)x),
 'warehouse_type',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT warehouse_type v FROM public.woodcorp_cases WHERE warehouse_type IS NOT NULL)x),
 'cust_country',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT cust_country v FROM public.woodcorp_cases WHERE cust_country IS NOT NULL)x),
 'delivery_year',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT extract(year FROM delivered_date)::int::text v FROM public.woodcorp_cases WHERE delivered_date IS NOT NULL)x),
 'cust_market',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT cust_market v FROM public.woodcorp_cases WHERE cust_market IS NOT NULL)x),
 'delivered_quantity_unit',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT delivered_quantity_unit v FROM public.woodcorp_cases WHERE delivered_quantity_unit IS NOT NULL)x),
 'cust_addr_code',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT cust_addr_code v FROM public.woodcorp_cases WHERE cust_addr_code IS NOT NULL)x),
 'order_tolerance_met',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT order_tolerance_met::text v FROM public.woodcorp_cases WHERE order_tolerance_met IS NOT NULL)x),
 'factory_product',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT CASE WHEN c.factory IS NOT NULL AND c.product_type IS NOT NULL THEN c.factory||' · '||c.product_type END v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'quantity_deviation_class',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT CASE WHEN c.ordered_quantity IS NULL OR c.delivered_quantity IS NULL THEN 'Unbekannt' WHEN c.delivered_quantity<c.ordered_quantity THEN 'Unterliefert' WHEN c.delivered_quantity>c.ordered_quantity THEN 'Überliefert' ELSE 'Exakt' END v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'credit_block',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT CASE WHEN pf.credit_block_count IS NULL THEN 'Unbekannt' WHEN pf.credit_block_count>0 THEN 'Ja' ELSE 'Nein' END v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'quantity_change_phase',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT pf.quantity_change_phase v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'process_order_quality',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT pf.process_order_quality v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'process_variant',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT pf.process_variant v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'order_size_class',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT CASE WHEN c.delivered_quantity_unit IS DISTINCT FROM 'kg' OR c.ordered_quantity IS NULL OR c.ordered_quantity<0 THEN 'Nicht klassifizierbar' WHEN c.ordered_quantity<=1000 THEN '≤ 1.000 kg' WHEN c.ordered_quantity<=5000 THEN '> 1.000–5.000 kg' WHEN c.ordered_quantity<=10000 THEN '> 5.000–10.000 kg' ELSE '> 10.000 kg' END v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'cust_id',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT c.cust_id v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'quantity_change_group',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT CASE WHEN pf.quantity_change_count IS NULL THEN 'Unbekannt' WHEN pf.quantity_change_count>=3 THEN '3+' ELSE pf.quantity_change_count::text END v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'delivery_month',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT to_char(c.delivered_date,'YYYY-MM') v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'otif_status',jsonb_build_array('on_time_in_full','on_time_not_full','late_in_full','late_not_full','unknown')
) $function$
;

CREATE OR REPLACE FUNCTION public.nxt_breakdown(p_field text, p_filters jsonb DEFAULT '[]'::jsonb)
 RETURNS TABLE(label text, orders bigint, on_time_rate numeric, volume_rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_field NOT IN ('factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','quantity_change_group','delivery_month')
 THEN RAISE EXCEPTION 'UNSUPPORTED_BREAKDOWN_DIMENSION' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT (CASE p_field
   WHEN 'factory_product' THEN CASE WHEN c.factory IS NOT NULL AND c.product_type IS NOT NULL THEN c.factory||' · '||c.product_type END
        WHEN 'quantity_deviation_class' THEN CASE WHEN c.ordered_quantity IS NULL OR c.delivered_quantity IS NULL THEN 'Unbekannt' WHEN c.delivered_quantity<c.ordered_quantity THEN 'Unterliefert' WHEN c.delivered_quantity>c.ordered_quantity THEN 'Überliefert' ELSE 'Exakt' END
        WHEN 'credit_block' THEN CASE WHEN pf.credit_block_count IS NULL THEN 'Unbekannt' WHEN pf.credit_block_count>0 THEN 'Ja' ELSE 'Nein' END
        WHEN 'quantity_change_phase' THEN pf.quantity_change_phase
        WHEN 'process_order_quality' THEN pf.process_order_quality
        WHEN 'process_variant' THEN pf.process_variant
        WHEN 'order_size_class' THEN CASE WHEN c.delivered_quantity_unit IS DISTINCT FROM 'kg' OR c.ordered_quantity IS NULL OR c.ordered_quantity<0 THEN 'Nicht klassifizierbar' WHEN c.ordered_quantity<=1000 THEN '≤ 1.000 kg' WHEN c.ordered_quantity<=5000 THEN '> 1.000–5.000 kg' WHEN c.ordered_quantity<=10000 THEN '> 5.000–10.000 kg' ELSE '> 10.000 kg' END
        WHEN 'cust_id' THEN c.cust_id
        WHEN 'quantity_change_group' THEN CASE WHEN pf.quantity_change_count IS NULL THEN 'Unbekannt' WHEN pf.quantity_change_count>=3 THEN '3+' ELSE pf.quantity_change_count::text END
        WHEN 'delivery_month' THEN to_char(c.delivered_date,'YYYY-MM')
    WHEN 'factory' THEN c.factory WHEN 'product_type' THEN c.product_type
   WHEN 'delivery_company' THEN c.delivery_company WHEN 'warehouse_type' THEN c.warehouse_type
   WHEN 'cust_country' THEN c.cust_country WHEN 'delivery_year' THEN extract(year FROM c.delivered_date)::int::text
   WHEN 'cust_market' THEN c.cust_market WHEN 'delivered_quantity_unit' THEN c.delivered_quantity_unit
   WHEN 'cust_addr_code' THEN c.cust_addr_code WHEN 'order_tolerance_met' THEN c.order_tolerance_met::text
   WHEN 'otif_status' THEN CASE WHEN c.delivered_date IS NULL OR c.promised_date IS NULL OR c.order_tolerance_met IS NULL THEN 'unknown'
      WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met=1 THEN 'on_time_in_full'
      WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met<>1 THEN 'on_time_not_full'
      WHEN c.delivered_date>c.promised_date AND c.order_tolerance_met=1 THEN 'late_in_full' ELSE 'late_not_full' END
   ELSE NULL END)::text,
   count(*)::bigint,
   round(100.0*count(*) FILTER(WHERE c.delivered_date<=c.promised_date)/NULLIF(count(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL),0),1),
   round(100.0*count(*) FILTER(WHERE c.order_tolerance_met=1)/NULLIF(count(*) FILTER(WHERE c.order_tolerance_met IS NOT NULL),0),1)
 FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key
 WHERE public.nxt_case_matches(c,p_filters)
 GROUP BY 1 ORDER BY 2 DESC NULLS LAST;
END $function$
;

CREATE OR REPLACE FUNCTION public.nxt_chart_segments(p_field text, p_filters jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_field NOT IN ('factory','product_type','delivery_company','warehouse_type','cust_country',
  'delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','quantity_change_group','delivery_month')
 THEN RAISE EXCEPTION 'INVALID_CHART_DIMENSION' USING ERRCODE='22023'; END IF;
 WITH labelled AS (
  SELECT CASE p_field
    WHEN 'factory_product' THEN CASE WHEN c.factory IS NOT NULL AND c.product_type IS NOT NULL THEN c.factory||' · '||c.product_type END
        WHEN 'quantity_deviation_class' THEN CASE WHEN c.ordered_quantity IS NULL OR c.delivered_quantity IS NULL THEN 'Unbekannt' WHEN c.delivered_quantity<c.ordered_quantity THEN 'Unterliefert' WHEN c.delivered_quantity>c.ordered_quantity THEN 'Überliefert' ELSE 'Exakt' END
        WHEN 'credit_block' THEN CASE WHEN pf.credit_block_count IS NULL THEN 'Unbekannt' WHEN pf.credit_block_count>0 THEN 'Ja' ELSE 'Nein' END
        WHEN 'quantity_change_phase' THEN pf.quantity_change_phase
        WHEN 'process_order_quality' THEN pf.process_order_quality
        WHEN 'process_variant' THEN pf.process_variant
        WHEN 'order_size_class' THEN CASE WHEN c.delivered_quantity_unit IS DISTINCT FROM 'kg' OR c.ordered_quantity IS NULL OR c.ordered_quantity<0 THEN 'Nicht klassifizierbar' WHEN c.ordered_quantity<=1000 THEN '≤ 1.000 kg' WHEN c.ordered_quantity<=5000 THEN '> 1.000–5.000 kg' WHEN c.ordered_quantity<=10000 THEN '> 5.000–10.000 kg' ELSE '> 10.000 kg' END
        WHEN 'cust_id' THEN c.cust_id
        WHEN 'quantity_change_group' THEN CASE WHEN pf.quantity_change_count IS NULL THEN 'Unbekannt' WHEN pf.quantity_change_count>=3 THEN '3+' ELSE pf.quantity_change_count::text END
        WHEN 'delivery_month' THEN to_char(c.delivered_date,'YYYY-MM')
    WHEN 'factory' THEN c.factory WHEN 'product_type' THEN c.product_type
    WHEN 'delivery_company' THEN c.delivery_company WHEN 'warehouse_type' THEN c.warehouse_type
    WHEN 'cust_country' THEN c.cust_country WHEN 'delivery_year' THEN EXTRACT(YEAR FROM c.delivered_date)::int::text
    WHEN 'cust_market' THEN c.cust_market WHEN 'delivered_quantity_unit' THEN c.delivered_quantity_unit
    WHEN 'cust_addr_code' THEN c.cust_addr_code WHEN 'order_tolerance_met' THEN c.order_tolerance_met::text
    WHEN 'otif_status' THEN CASE WHEN c.delivered_date IS NULL OR c.promised_date IS NULL OR c.order_tolerance_met IS NULL THEN 'unknown'
      WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met=1 THEN 'on_time_in_full'
      WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met<>1 THEN 'on_time_not_full'
      WHEN c.delivered_date>c.promised_date AND c.order_tolerance_met=1 THEN 'late_in_full'
      ELSE 'late_not_full' END
   END AS label, c.*
  FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key WHERE public.nxt_case_matches(c,p_filters)
 ), segments AS (
  SELECT label,
    COUNT(*)::bigint AS orders,
    COUNT(*) FILTER(WHERE delivered_date<=promised_date AND order_tolerance_met=1)::bigint AS otif_cases,
    COUNT(*) FILTER(WHERE delivered_date<=promised_date AND order_tolerance_met<>1)::bigint AS on_time_not_full_cases,
    COUNT(*) FILTER(WHERE delivered_date>promised_date AND order_tolerance_met=1)::bigint AS late_in_full_cases,
    COUNT(*) FILTER(WHERE delivered_date>promised_date AND order_tolerance_met<>1)::bigint AS late_not_full_cases,
    COUNT(*) FILTER(WHERE delivered_date IS NULL OR promised_date IS NULL OR order_tolerance_met IS NULL)::bigint AS unknown_cases,
    COUNT(*) FILTER(WHERE delivered_date>promised_date)::bigint AS late_orders,
    ROUND(100.0*COUNT(*) FILTER(WHERE delivered_date<=promised_date AND order_tolerance_met=1)/
      NULLIF(COUNT(*) FILTER(WHERE delivered_date IS NOT NULL AND promised_date IS NOT NULL AND order_tolerance_met IS NOT NULL),0),1) AS otif_rate,
    ROUND(100.0*COUNT(*) FILTER(WHERE delivered_date<=promised_date)/
      NULLIF(COUNT(*) FILTER(WHERE delivered_date IS NOT NULL AND promised_date IS NOT NULL),0),1) AS on_time_rate,
    ROUND(100.0*COUNT(*) FILTER(WHERE order_tolerance_met=1)/
      NULLIF(COUNT(*) FILTER(WHERE order_tolerance_met IS NOT NULL),0),1) AS volume_rate,
    ROUND(COALESCE(SUM(delivered_quantity) FILTER(WHERE delivered_date>promised_date AND delivered_quantity_unit='kg' AND delivered_quantity IS NOT NULL),0)*0.75,2) AS late_penalty_eur,
    ROUND(COALESCE(SUM(GREATEST(ordered_quantity-delivered_quantity,0)) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL),0)*0.75,2) AS shortfall_penalty_eur
  FROM labelled GROUP BY label
 ), results AS (
  SELECT label,orders,otif_cases,on_time_not_full_cases,late_in_full_cases,late_not_full_cases,unknown_cases,late_orders,
    otif_rate,on_time_rate,volume_rate,late_penalty_eur,shortfall_penalty_eur,
    late_penalty_eur+shortfall_penalty_eur AS total_penalty_eur
  FROM segments ORDER BY orders DESC, label
 )
 SELECT COALESCE(jsonb_agg(to_jsonb(results) ORDER BY results.orders DESC),'[]'::jsonb) INTO result FROM results;
 RETURN result;
END $function$
;

CREATE OR REPLACE FUNCTION public.nxt_kpi_summary(p_filters jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 SELECT jsonb_build_object(
  'definitionVersion','woodcorp-otif-financial-v1',
  'orders',COUNT(*),
  'dateCoverage',COUNT(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL),
  'volumeCoverage',COUNT(*) FILTER(WHERE c.order_tolerance_met IS NOT NULL),
  'otifCoverage',COUNT(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL AND c.order_tolerance_met IS NOT NULL),
  'onTimeCases',COUNT(*) FILTER(WHERE c.delivered_date<=c.promised_date),
  'inFullCases',COUNT(*) FILTER(WHERE c.order_tolerance_met=1),
  'otifCases',COUNT(*) FILTER(WHERE c.delivered_date<=c.promised_date AND c.order_tolerance_met=1),
  'onTimeNotFullCases',COUNT(*) FILTER(WHERE c.delivered_date<=c.promised_date AND c.order_tolerance_met<>1),
  'lateInFullCases',COUNT(*) FILTER(WHERE c.delivered_date>c.promised_date AND c.order_tolerance_met=1),
  'lateNotFullCases',COUNT(*) FILTER(WHERE c.delivered_date>c.promised_date AND c.order_tolerance_met<>1),
  'unclassifiedCases',COUNT(*) FILTER(WHERE c.delivered_date IS NULL OR c.promised_date IS NULL OR c.order_tolerance_met IS NULL),
  'onTimeRate',ROUND(100.0*COUNT(*) FILTER(WHERE c.delivered_date<=c.promised_date)/NULLIF(COUNT(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL),0),1),
  'volumeConformanceRate',ROUND(100.0*COUNT(*) FILTER(WHERE c.order_tolerance_met=1)/NULLIF(COUNT(*) FILTER(WHERE c.order_tolerance_met IS NOT NULL),0),1),
  'otifRate',ROUND(100.0*COUNT(*) FILTER(WHERE c.delivered_date<=c.promised_date AND c.order_tolerance_met=1)/NULLIF(COUNT(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL AND c.order_tolerance_met IS NOT NULL),0),1),
  'lateOrders',COUNT(*) FILTER(WHERE c.delivered_date>c.promised_date),
  'avgDelayDays',ROUND(AVG(extract(epoch FROM (c.delivered_date-c.promised_date))/86400) FILTER(WHERE c.delivered_date>c.promised_date)::numeric,1),
  'affectedFactories',COUNT(DISTINCT c.factory) FILTER(WHERE c.delivered_date>c.promised_date),
  'factories',COUNT(DISTINCT c.factory),
  'firstDelivery',MIN(c.delivered_date), 'lastDelivery',MAX(c.delivered_date),
  'kgEligibleCases',COUNT(*) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),
  'kgExcludedCases',COUNT(*) FILTER(WHERE c.delivered_quantity_unit IS DISTINCT FROM 'kg' OR c.ordered_quantity IS NULL OR c.delivered_quantity IS NULL),
  'lateKg',COALESCE(SUM(c.delivered_quantity) FILTER(WHERE c.delivered_date>c.promised_date AND c.delivered_quantity_unit='kg' AND c.delivered_quantity IS NOT NULL),0),
  'shortfallKg',COALESCE(SUM(GREATEST(c.ordered_quantity-c.delivered_quantity,0)) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0),
  'latePenaltyEur',ROUND(COALESCE(SUM(c.delivered_quantity) FILTER(WHERE c.delivered_date>c.promised_date AND c.delivered_quantity_unit='kg' AND c.delivered_quantity IS NOT NULL),0)*0.75,2),
  'shortfallPenaltyEur',ROUND(COALESCE(SUM(GREATEST(c.ordered_quantity-c.delivered_quantity,0)) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0)*0.75,2),
  'totalPenaltyEur',ROUND((COALESCE(SUM(c.delivered_quantity) FILTER(WHERE c.delivered_date>c.promised_date AND c.delivered_quantity_unit='kg' AND c.delivered_quantity IS NOT NULL),0)
   + COALESCE(SUM(GREATEST(c.ordered_quantity-c.delivered_quantity,0)) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0))*0.75,2),
  'penaltyRateEurPerKg',0.75,'penaltyIsModelled',true
 ) || jsonb_build_object(
 'penaltyPerOrderEur',ROUND(SUM(CASE WHEN c.delivered_quantity_unit='kg' THEN CASE WHEN c.delivered_date>c.promised_date THEN COALESCE(c.delivered_quantity,0)*0.75 ELSE 0 END + CASE WHEN c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL THEN GREATEST(c.ordered_quantity-c.delivered_quantity,0)*0.75 ELSE 0 END END) FILTER (WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL AND c.promised_date IS NOT NULL AND c.delivered_date IS NOT NULL)/NULLIF(COUNT(*) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL AND c.promised_date IS NOT NULL AND c.delivered_date IS NOT NULL),0),2),
 'penaltyPerKgEur',ROUND(SUM(CASE WHEN c.delivered_quantity_unit='kg' THEN CASE WHEN c.delivered_date>c.promised_date THEN COALESCE(c.delivered_quantity,0)*0.75 ELSE 0 END + CASE WHEN c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL THEN GREATEST(c.ordered_quantity-c.delivered_quantity,0)*0.75 ELSE 0 END END) FILTER (WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL AND c.promised_date IS NOT NULL AND c.delivered_date IS NOT NULL)/NULLIF(SUM(c.ordered_quantity) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL AND c.promised_date IS NOT NULL AND c.delivered_date IS NOT NULL),0),4),
 'penaltyOrderValueRate',ROUND(100*SUM(CASE WHEN c.delivered_quantity_unit='kg' THEN CASE WHEN c.delivered_date>c.promised_date THEN COALESCE(c.delivered_quantity,0)*0.75 ELSE 0 END + CASE WHEN c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL THEN GREATEST(c.ordered_quantity-c.delivered_quantity,0)*0.75 ELSE 0 END END) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL AND c.promised_date IS NOT NULL AND c.delivered_date IS NOT NULL AND c.order_value>0)/NULLIF(SUM(c.order_value) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL AND c.promised_date IS NOT NULL AND c.delivered_date IS NOT NULL AND c.order_value>0),0),2),
 'underDeliveryRate',ROUND(100.0*COUNT(*) FILTER (WHERE c.delivered_quantity<c.ordered_quantity)/NULLIF(COUNT(*) FILTER (WHERE c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0),2),
 'overDeliveryRate',ROUND(100.0*COUNT(*) FILTER (WHERE c.delivered_quantity>c.ordered_quantity)/NULLIF(COUNT(*) FILTER (WHERE c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0),2),
 'overDeliveryKg',COALESCE(SUM(GREATEST(c.delivered_quantity-c.ordered_quantity,0)) FILTER(WHERE c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL AND c.delivered_quantity_unit='kg'),0),
 'quantityDeviationPct',ROUND(AVG(100*(c.delivered_quantity-c.ordered_quantity)/NULLIF(c.ordered_quantity,0)),2),
 'orderConfirmationDays',ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY pf.order_confirmation_days) FILTER (WHERE pf.order_confirmation_days>=0))::numeric,2),
 'productionPreparationDays',ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY pf.production_preparation_days) FILTER (WHERE pf.production_preparation_days>=0))::numeric,2),
 'shipmentBufferDays',ROUND((percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM(c.promised_date-ei.load_shipment_ts))/86400) FILTER (WHERE c.promised_date IS NOT NULL AND ei.load_shipment_ts IS NOT NULL))::numeric,2),
 'quantityChangesAfterStart',SUM(pf.quantity_changes_after_start),
 'quantityChangesAfterEnd',SUM(pf.quantity_changes_after_end),
 'quantityChangesAfterShip',SUM(pf.quantity_changes_after_ship),
 'creditBlockRate',ROUND(100.0*COUNT(*) FILTER (WHERE pf.credit_block_count>0)/NULLIF(COUNT(*) FILTER (WHERE pf.credit_block_count IS NOT NULL),0),2),
 'scheduleChangeRate',ROUND(100.0*COUNT(*) FILTER (WHERE pf.delivery_date_change_count>0 OR pf.production_start_change_count>0)/NULLIF(COUNT(*) FILTER (WHERE pf.case_key IS NOT NULL),0),2),
 'processVariantCount',COUNT(DISTINCT pf.process_variant),
 'dataQualityCoverageRate',ROUND(100.0*COUNT(*) FILTER (WHERE pf.process_order_quality='Chronologisch plausibel')/NULLIF(COUNT(*) FILTER (WHERE true),0),2)
 ) INTO result FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key WHERE public.nxt_case_matches(c,p_filters);
 RETURN result;
END $function$
;

-- Idempotent catalog activation is separate from the schema/RPC update to keep old clients compatible.
-- Run after frontend deployment: see nxt_analysis_expansion_enable_filters.sql.
