-- NXT Analytics Phase 1: typed filters, case-level process features, one KPI contract.
-- Append-only application infrastructure. No mutations of woodcorp_cases or woodcorp_activities.
CREATE TABLE IF NOT EXISTS public.nxt_case_process_features (
  case_key text PRIMARY KEY REFERENCES public.woodcorp_cases(case_key) ON DELETE CASCADE,
  quantity_change_count integer NOT NULL DEFAULT 0,
  delivery_date_change_count integer NOT NULL DEFAULT 0,
  production_start_change_count integer NOT NULL DEFAULT 0,
  price_change_count integer NOT NULL DEFAULT 0,
  anomalous_event_count integer NOT NULL DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nxt_case_process_features ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nxt_case_process_features FROM PUBLIC,anon;
GRANT SELECT ON public.nxt_case_process_features TO authenticated;
DROP POLICY IF EXISTS nxt_process_features_read ON public.nxt_case_process_features;
CREATE POLICY nxt_process_features_read ON public.nxt_case_process_features FOR SELECT TO authenticated
USING (EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid())));
INSERT INTO public.nxt_case_process_features(case_key,quantity_change_count,delivery_date_change_count,production_start_change_count,price_change_count,anomalous_event_count)
SELECT c.case_key,
 COALESCE(count(*) FILTER(WHERE a.activity_en='Change quantity'),0),
 COALESCE(count(*) FILTER(WHERE a.activity_en='Change delivery date'),0),
 COALESCE(count(*) FILTER(WHERE a.activity_en='Change production start date'),0),
 COALESCE(count(*) FILTER(WHERE a.activity_en='Change price'),0),
 COALESCE(count(*) FILTER(WHERE a.is_timestamp_anomaly IS TRUE),0)
FROM public.woodcorp_cases c LEFT JOIN public.woodcorp_activities a ON a.case_key=c.case_key
GROUP BY c.case_key
ON CONFLICT(case_key) DO UPDATE SET
 quantity_change_count=EXCLUDED.quantity_change_count,
 delivery_date_change_count=EXCLUDED.delivery_date_change_count,
 production_start_change_count=EXCLUDED.production_start_change_count,
 price_change_count=EXCLUDED.price_change_count,
 anomalous_event_count=EXCLUDED.anomalous_event_count,
 snapshot_at=now();

ALTER TABLE public.nxt_filter_catalog DROP CONSTRAINT IF EXISTS nxt_filter_catalog_field_key_check;
ALTER TABLE public.nxt_filter_catalog ADD CONSTRAINT nxt_filter_catalog_field_key_check CHECK(field_key IN (
 'factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year',
 'cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met',
 'otif_status','delivered_date','promised_date','ordered_quantity','delivered_quantity',
 'order_value','days_to_del_deadline','quantity_change_count','delivery_date_change_count',
 'production_start_change_count','price_change_count','anomalous_event_count'
));
INSERT INTO public.nxt_filter_catalog(field_key,display_name,sort_order)
VALUES
 ('otif_status','OTIF-Fehlerklasse',75),
 ('delivered_date','Tatsächliches Lieferdatum',80),
 ('promised_date','Zugesagtes Lieferdatum',85),
 ('ordered_quantity','Bestellmenge',90),
 ('delivered_quantity','Liefermenge',95),
 ('order_value','Auftragswert',100),
 ('days_to_del_deadline','Tage bis Lieferfrist (Rohfeld)',105),
 ('quantity_change_count','Anzahl Mengenänderungen',110),
 ('delivery_date_change_count','Anzahl Lieferterminänderungen',115),
 ('production_start_change_count','Anzahl Produktionsstartänderungen',120),
 ('price_change_count','Anzahl Preisänderungen',125),
 ('anomalous_event_count','Anzahl Zeitstempel-Anomalien',130)
ON CONFLICT(field_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.nxt_validate_filters(p_filters jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE f jsonb; field text; op text; v jsonb; element jsonb;
  date_fields text[]:=ARRAY['delivered_date','promised_date'];
  number_fields text[]:=ARRAY['ordered_quantity','delivered_quantity','order_value','days_to_del_deadline',
    'quantity_change_count','delivery_date_change_count','production_start_change_count','price_change_count','anomalous_event_count'];
  cat_fields text[]:=ARRAY['factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year',
    'cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status'];
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
END $fn$;

CREATE OR REPLACE FUNCTION public.nxt_case_matches(c public.woodcorp_cases,p_filters jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
SELECT NOT EXISTS (
 SELECT 1 FROM jsonb_array_elements(p_filters) AS f(value)
 LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 CROSS JOIN LATERAL (
  SELECT (CASE f.value->>'field'
   WHEN 'factory' THEN c.factory WHEN 'product_type' THEN c.product_type
   WHEN 'delivery_company' THEN c.delivery_company WHEN 'warehouse_type' THEN c.warehouse_type
   WHEN 'cust_country' THEN c.cust_country WHEN 'delivery_year' THEN extract(year FROM c.delivered_date)::int::text
   WHEN 'cust_market' THEN c.cust_market WHEN 'delivered_quantity_unit' THEN c.delivered_quantity_unit
   WHEN 'cust_addr_code' THEN c.cust_addr_code WHEN 'order_tolerance_met' THEN c.order_tolerance_met::text
   WHEN 'otif_status' THEN CASE
    WHEN c.delivered_date IS NULL OR c.promised_date IS NULL OR c.order_tolerance_met IS NULL THEN 'unknown'
    WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met=1 THEN 'on_time_in_full'
    WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met<>1 THEN 'on_time_not_full'
    WHEN c.delivered_date>c.promised_date AND c.order_tolerance_met=1 THEN 'late_in_full'
    ELSE 'late_not_full' END
   ELSE NULL END) AS category,
   (CASE f.value->>'field'
    WHEN 'delivered_date' THEN c.delivered_date::date
    WHEN 'promised_date' THEN c.promised_date::date
    ELSE NULL END) AS dt,
   (CASE f.value->>'field'
    WHEN 'ordered_quantity' THEN c.ordered_quantity WHEN 'delivered_quantity' THEN c.delivered_quantity
    WHEN 'order_value' THEN c.order_value WHEN 'days_to_del_deadline' THEN c.days_to_del_deadline
    WHEN 'quantity_change_count' THEN COALESCE(pf.quantity_change_count,0)
    WHEN 'delivery_date_change_count' THEN COALESCE(pf.delivery_date_change_count,0)
    WHEN 'production_start_change_count' THEN COALESCE(pf.production_start_change_count,0)
    WHEN 'price_change_count' THEN COALESCE(pf.price_change_count,0)
    WHEN 'anomalous_event_count' THEN COALESCE(pf.anomalous_event_count,0)
    ELSE NULL END) AS num
 ) AS dims
 WHERE (CASE f.value->>'op'
   WHEN 'eq' THEN CASE WHEN f.value->>'field' IN ('delivered_date','promised_date')
    THEN dims.dt=(f.value->>'value')::date
    WHEN f.value->>'field' IN ('ordered_quantity','delivered_quantity','order_value','days_to_del_deadline',
      'quantity_change_count','delivery_date_change_count','production_start_change_count','price_change_count','anomalous_event_count')
    THEN dims.num=(f.value->>'value')::numeric
    ELSE dims.category=f.value->>'value' END
   WHEN 'in' THEN dims.category IN (SELECT jsonb_array_elements_text(f.value->'value'))
   WHEN 'gte' THEN CASE WHEN f.value->>'field' IN ('delivered_date','promised_date')
     THEN dims.dt>=(f.value->>'value')::date ELSE dims.num>=(f.value->>'value')::numeric END
   WHEN 'lte' THEN CASE WHEN f.value->>'field' IN ('delivered_date','promised_date')
     THEN dims.dt<=(f.value->>'value')::date ELSE dims.num<=(f.value->>'value')::numeric END
   WHEN 'between' THEN CASE WHEN f.value->>'field' IN ('delivered_date','promised_date')
     THEN dims.dt BETWEEN (f.value->'value'->>0)::date AND (f.value->'value'->>1)::date
     ELSE dims.num BETWEEN (f.value->'value'->>0)::numeric AND (f.value->'value'->>1)::numeric END
   ELSE false END) IS DISTINCT FROM TRUE
)
$fn$;

-- Shared KPI contract: counts, denominators, financial model, and quality context.
CREATE OR REPLACE FUNCTION public.nxt_kpi_summary(p_filters jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
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
 ) INTO result FROM public.woodcorp_cases c WHERE public.nxt_case_matches(c,p_filters);
 RETURN result;
END $fn$;

-- Keep existing API names compatible while exposing a uniform contract.
CREATE OR REPLACE FUNCTION public.nxt_case_metrics(p_filters jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$ SELECT public.nxt_kpi_summary(p_filters) $fn$;
CREATE OR REPLACE FUNCTION public.nxt_ribbon_kpis(p_filters jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$ SELECT s || jsonb_build_object('deliveryDateCount',(s->>'dateCoverage')::int) FROM (SELECT public.nxt_kpi_summary(p_filters) AS s) q $fn$;

-- Preserve original names and support new curated contract templates.
CREATE OR REPLACE FUNCTION public.nxt_calculated_metric(
 p_template text,p_filters jsonb DEFAULT '[]'::jsonb,p_rate_eur_per_kg numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE s jsonb; amount numeric; unit text; estimate boolean:=false;
BEGIN
 IF p_template NOT IN ('late_orders','shortfall_kg','estimated_shortfall_cost_eur',
  'otif_rate','late_penalty_eur','shortfall_penalty_eur','total_penalty_eur') THEN
  RAISE EXCEPTION 'INVALID_KPI_TEMPLATE' USING ERRCODE='22023';END IF;
 IF p_template='estimated_shortfall_cost_eur' AND (p_rate_eur_per_kg IS NULL OR p_rate_eur_per_kg<=0 OR p_rate_eur_per_kg>10000) THEN
  RAISE EXCEPTION 'RATE_REQUIRED' USING ERRCODE='22023';END IF;
 s:=public.nxt_kpi_summary(p_filters);
 CASE p_template
  WHEN 'late_orders' THEN amount:=(s->>'lateOrders')::numeric;unit:='Aufträge';
  WHEN 'shortfall_kg' THEN amount:=(s->>'shortfallKg')::numeric;unit:='kg';
  WHEN 'otif_rate' THEN amount:=(s->>'otifRate')::numeric;unit:='%';
  WHEN 'late_penalty_eur' THEN amount:=(s->>'latePenaltyEur')::numeric;unit:='EUR';
  WHEN 'shortfall_penalty_eur' THEN amount:=(s->>'shortfallPenaltyEur')::numeric;unit:='EUR';
  WHEN 'total_penalty_eur' THEN amount:=(s->>'totalPenaltyEur')::numeric;unit:='EUR';
  WHEN 'estimated_shortfall_cost_eur' THEN amount:=round((s->>'shortfallKg')::numeric*p_rate_eur_per_kg,2);unit:='EUR';estimate:=true;
 END CASE;
 RETURN jsonb_build_object(
  'template',p_template,'value',amount,'unit',unit,'caseCount',(s->>'orders')::bigint,
  'eligibleCases',CASE WHEN p_template='late_orders' THEN (s->>'dateCoverage')::bigint
    WHEN p_template='otif_rate' THEN (s->>'otifCoverage')::bigint ELSE (s->>'kgEligibleCases')::bigint END,
  'excludedCases',CASE WHEN p_template='late_orders' THEN (s->>'orders')::bigint-(s->>'dateCoverage')::bigint
    WHEN p_template='otif_rate' THEN (s->>'orders')::bigint-(s->>'otifCoverage')::bigint ELSE (s->>'kgExcludedCases')::bigint END,
  'rateEurPerKg',CASE WHEN estimate THEN p_rate_eur_per_kg WHEN p_template LIKE '%penalty_eur' THEN 0.75 ELSE NULL END,
  'isEstimate',estimate OR p_template LIKE '%penalty_eur',
  'isModelledPenalty',p_template LIKE '%penalty_eur',
  'definitionVersion',s->>'definitionVersion'
 );
END $fn$;

CREATE OR REPLACE FUNCTION public.nxt_dimensions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
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
 'otif_status',jsonb_build_array('on_time_in_full','on_time_not_full','late_in_full','late_not_full','unknown')
) $fn$;

REVOKE ALL ON FUNCTION public.nxt_validate_filters(jsonb),
 public.nxt_case_matches(public.woodcorp_cases,jsonb),
 public.nxt_kpi_summary(jsonb),public.nxt_case_metrics(jsonb),
 public.nxt_ribbon_kpis(jsonb),public.nxt_calculated_metric(text,jsonb,numeric),
 public.nxt_dimensions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_validate_filters(jsonb),
 public.nxt_case_matches(public.woodcorp_cases,jsonb),
 public.nxt_kpi_summary(jsonb),public.nxt_case_metrics(jsonb),
 public.nxt_ribbon_kpis(jsonb),public.nxt_calculated_metric(text,jsonb,numeric),
 public.nxt_dimensions() TO authenticated;
COMMENT ON FUNCTION public.nxt_kpi_summary(jsonb) IS
 'Single source of truth, case-grain OTIF and 0.75 EUR/kg contractual penalty model; estimated liability, not paid invoices.';