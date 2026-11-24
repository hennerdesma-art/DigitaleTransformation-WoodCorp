-- Customer names are sourced directly from the case table. No customer data is copied or invented.
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
    'cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','cust_name','quantity_change_group','delivery_month'];
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
      'delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','cust_name','quantity_change_group','delivery_month');
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
        WHEN 'cust_name' THEN c.cust_name
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
 'cust_name',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT cust_name v FROM public.woodcorp_cases WHERE cust_name IS NOT NULL AND btrim(cust_name)<>'')x),
 'cust_id',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT c.cust_id v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'quantity_change_group',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT CASE WHEN pf.quantity_change_count IS NULL THEN 'Unbekannt' WHEN pf.quantity_change_count>=3 THEN '3+' ELSE pf.quantity_change_count::text END v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'delivery_month',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT to_char(c.delivered_date,'YYYY-MM') v FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key) x WHERE v IS NOT NULL),
 'otif_status',jsonb_build_array('on_time_in_full','on_time_not_full','late_in_full','late_not_full','unknown')
) $function$
;
ALTER TABLE public.nxt_filter_catalog DROP CONSTRAINT IF EXISTS nxt_filter_catalog_field_key_check;
ALTER TABLE public.nxt_filter_catalog ADD CONSTRAINT nxt_filter_catalog_field_key_check CHECK (field_key IN ('factory', 'product_type', 'delivery_company', 'warehouse_type', 'cust_country', 'delivery_year', 'cust_market', 'delivered_quantity_unit', 'cust_addr_code', 'order_tolerance_met', 'otif_status', 'delivered_date', 'promised_date', 'ordered_quantity', 'delivered_quantity', 'order_value', 'days_to_del_deadline', 'quantity_change_count', 'delivery_date_change_count', 'production_start_change_count', 'price_change_count', 'anomalous_event_count', 'factory_product', 'quantity_deviation_class', 'credit_block', 'quantity_change_phase', 'process_order_quality', 'process_variant', 'order_size_class', 'cust_id', 'cust_name', 'quantity_change_group', 'delivery_month', 'quantity_deviation_pct', 'penalty_eur', 'order_confirmation_days', 'production_preparation_days', 'order_to_start_days', 'production_days', 'production_to_ship_days', 'ship_to_delivery_days', 'order_to_delivery_days', 'shipment_buffer_days', 'start_buffer_days', 'end_buffer_days', 'quantity_changes_after_start', 'quantity_changes_after_end', 'quantity_changes_after_ship', 'min_order_tolerance', 'max_order_tolerance', 'unit_price', 'order_received_date'));
INSERT INTO public.nxt_filter_catalog(field_key,display_name,enabled,sort_order) VALUES ('cust_name','Kundenname',true,196) ON CONFLICT (field_key) DO NOTHING;
