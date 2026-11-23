-- NXT v7: remove the 20k x feature-table join from ordinary KPI lookups.
-- Preserve every existing filter/operator. Event features are looked up only for event filters.
CREATE OR REPLACE FUNCTION public.nxt_case_matches(c public.woodcorp_cases,p_filters jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE
  f jsonb; field_name text; operation text;
  category text; date_value date; numeric_value numeric;
  is_category boolean; is_date boolean; matched boolean;
  pf public.nxt_case_process_features%ROWTYPE;
  feature_loaded boolean:=false;
BEGIN
  IF p_filters IS NULL OR p_filters = '[]'::jsonb THEN RETURN true; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
    field_name:=f->>'field';operation:=f->>'op';
    is_date:=field_name IN ('delivered_date','promised_date');
    is_category:=field_name IN ('factory','product_type','delivery_company','warehouse_type','cust_country',
      'delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status');
    category:=NULL;date_value:=NULL;numeric_value:=NULL;
    IF is_category THEN
      category:=CASE field_name
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
      date_value:=CASE field_name WHEN 'delivered_date' THEN c.delivered_date::date WHEN 'promised_date' THEN c.promised_date::date END;
    ELSE
      IF field_name IN ('quantity_change_count','delivery_date_change_count','production_start_change_count',
          'price_change_count','anomalous_event_count') AND NOT feature_loaded THEN
        SELECT * INTO pf FROM public.nxt_case_process_features z WHERE z.case_key=c.case_key;
        feature_loaded:=true;
      END IF;
      numeric_value:=CASE field_name
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
END $fn$;
REVOKE ALL ON FUNCTION public.nxt_case_matches(public.woodcorp_cases,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_case_matches(public.woodcorp_cases,jsonb) TO authenticated;
CREATE INDEX IF NOT EXISTS nxt_cases_delivered_date_idx ON public.woodcorp_cases (delivered_date);
CREATE INDEX IF NOT EXISTS nxt_cases_promised_date_idx ON public.woodcorp_cases (promised_date);
ANALYZE public.woodcorp_cases;
