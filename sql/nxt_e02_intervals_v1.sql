-- NXT E02: validated, case-grain process intervals for WoodCorp O2C.
-- Ground truth: use c.delivered_date for physical delivery. "Goods delivered" event
-- is NOT a valid real delivery timestamp in this dataset.
-- Raw negative intervals are retained to audit data quality, never included in medians.
CREATE TABLE IF NOT EXISTS public.nxt_e02_case_intervals (
 case_key text PRIMARY KEY,
 order_received_ts timestamp,
 start_production_ts timestamp,
 finished_production_ts timestamp,
 load_shipment_ts timestamp,
 actual_delivery_ts timestamp,
 order_to_start_days numeric,
 production_days numeric,
 production_to_ship_days numeric,
 ship_to_delivery_days numeric,
 order_to_delivery_days numeric,
 has_source_anomaly boolean NOT NULL DEFAULT false,
 computed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nxt_e02_case_intervals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.nxt_e02_case_intervals FROM PUBLIC,anon;
GRANT SELECT ON TABLE public.nxt_e02_case_intervals TO authenticated;
DROP POLICY IF EXISTS nxt_e02_interval_member_read ON public.nxt_e02_case_intervals;
CREATE POLICY nxt_e02_interval_member_read ON public.nxt_e02_case_intervals
 FOR SELECT TO authenticated
 USING (EXISTS (SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid())));

-- Source files are a fixed historical snapshot; re-running this migration recalculates
-- the preaggregated intervals, without ever mutating the two WoodCorp source tables.
WITH stages AS (
 SELECT case_key,
 MIN(eventtime) FILTER (WHERE activity_en='Order received') AS ordered,
 MIN(eventtime) FILTER (WHERE activity_en='Start production') AS started,
 MIN(eventtime) FILTER (WHERE activity_en='Finished production') AS finished,
 MIN(eventtime) FILTER (WHERE activity_en='Load shipment') AS shipped,
 COALESCE(bool_or(is_timestamp_anomaly) FILTER (WHERE activity_en IN
   ('Order received','Start production','Finished production','Load shipment')),false) AS anomaly
 FROM public.woodcorp_activities GROUP BY case_key
)
INSERT INTO public.nxt_e02_case_intervals(
 case_key,order_received_ts,start_production_ts,finished_production_ts,
 load_shipment_ts,actual_delivery_ts,order_to_start_days,production_days,
 production_to_ship_days,ship_to_delivery_days,order_to_delivery_days,has_source_anomaly,computed_at
)
SELECT c.case_key,e.ordered,e.started,e.finished,e.shipped,c.delivered_date,
 EXTRACT(EPOCH FROM (e.started-e.ordered))/86400,
 EXTRACT(EPOCH FROM (e.finished-e.started))/86400,
 EXTRACT(EPOCH FROM (e.shipped-e.finished))/86400,
 EXTRACT(EPOCH FROM (c.delivered_date-e.shipped))/86400,
 EXTRACT(EPOCH FROM (c.delivered_date-e.ordered))/86400,
 e.anomaly,now()
FROM public.woodcorp_cases c
LEFT JOIN stages e ON e.case_key=c.case_key
ON CONFLICT(case_key) DO UPDATE SET
 order_received_ts=excluded.order_received_ts,
 start_production_ts=excluded.start_production_ts,
 finished_production_ts=excluded.finished_production_ts,
 load_shipment_ts=excluded.load_shipment_ts,
 actual_delivery_ts=excluded.actual_delivery_ts,
 order_to_start_days=excluded.order_to_start_days,
 production_days=excluded.production_days,
 production_to_ship_days=excluded.production_to_ship_days,
 ship_to_delivery_days=excluded.ship_to_delivery_days,
 order_to_delivery_days=excluded.order_to_delivery_days,
 has_source_anomaly=excluded.has_source_anomaly,
 computed_at=excluded.computed_at;
ANALYZE public.nxt_e02_case_intervals;

CREATE OR REPLACE FUNCTION public.nxt_e02_interval_summary(
 p_filters jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 WITH base AS (
  SELECT i.*,
   CASE WHEN c.delivered_date IS NULL OR c.promised_date IS NULL OR c.order_tolerance_met IS NULL THEN 'unknown'
    WHEN c.delivered_date<=c.promised_date AND c.order_tolerance_met=1 THEN 'otif'
    ELSE 'non_otif' END AS otif_group
  FROM public.woodcorp_cases c
  JOIN public.nxt_e02_case_intervals i ON i.case_key=c.case_key
  WHERE public.nxt_case_matches(c,p_filters)
 ), intervals AS (
  SELECT v.position,v.interval_key,v.days,b.otif_group,b.has_source_anomaly
  FROM base b
  CROSS JOIN LATERAL (VALUES
   (1,'order_to_production',b.order_to_start_days),
   (2,'production_duration',b.production_days),
   (3,'production_to_shipment',b.production_to_ship_days),
   (4,'shipment_to_delivery',b.ship_to_delivery_days),
   (5,'order_to_delivery',b.order_to_delivery_days)
  ) AS v(position,interval_key,days)
 ), stats AS (
  SELECT position,interval_key,COUNT(*)::bigint AS case_count,
   COUNT(*) FILTER(WHERE days>=0 AND NOT has_source_anomaly)::bigint AS valid_cases,
   COUNT(*) FILTER(WHERE days IS NULL)::bigint AS missing_cases,
   COUNT(*) FILTER(WHERE days<0)::bigint AS negative_cases,
   COUNT(*) FILTER(WHERE has_source_anomaly)::bigint AS anomaly_cases,
   COUNT(*) FILTER(WHERE days>=0 AND NOT has_source_anomaly AND otif_group='otif')::bigint AS otif_valid_cases,
   COUNT(*) FILTER(WHERE days>=0 AND NOT has_source_anomaly AND otif_group='non_otif')::bigint AS non_otif_valid_cases,
   ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY days::double precision)
     FILTER(WHERE days>=0 AND NOT has_source_anomaly))::numeric,2) AS median_days,
   ROUND((PERCENTILE_CONT(0.9) WITHIN GROUP(ORDER BY days::double precision)
     FILTER(WHERE days>=0 AND NOT has_source_anomaly))::numeric,2) AS p90_days,
   ROUND(AVG(days) FILTER(WHERE days>=0 AND NOT has_source_anomaly),2) AS mean_days,
   ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY days::double precision)
     FILTER(WHERE days>=0 AND NOT has_source_anomaly AND otif_group='otif'))::numeric,2) AS otif_median_days,
   ROUND((PERCENTILE_CONT(0.5) WITHIN GROUP(ORDER BY days::double precision)
     FILTER(WHERE days>=0 AND NOT has_source_anomaly AND otif_group='non_otif'))::numeric,2) AS non_otif_median_days
  FROM intervals GROUP BY position,interval_key
 )
 SELECT jsonb_build_object(
  'definitionVersion','woodcorp-e02-case-intervals-v1',
  'caseCount',(SELECT COUNT(*) FROM base),
  'source','woodcorp_activities (event times) + woodcorp_cases.delivered_date (actual delivery)',
  'units','days',
  'intervals',COALESCE(jsonb_agg(jsonb_build_object(
    'key',interval_key,'position',position,'caseCount',case_count,
    'validCases',valid_cases,'missingCases',missing_cases,'negativeCases',negative_cases,'anomalyCases',anomaly_cases,
    'coveragePct',ROUND(100.0*valid_cases/NULLIF(case_count,0),1),
    'medianDays',median_days,'p90Days',p90_days,'meanDays',mean_days,
    'otifValidCases',otif_valid_cases,'nonOtifValidCases',non_otif_valid_cases,
    'otifMedianDays',otif_median_days,'nonOtifMedianDays',non_otif_median_days
   ) ORDER BY position),'[]'::jsonb)
 ) INTO result FROM stats;
 RETURN result;
END $fn$;

CREATE OR REPLACE FUNCTION public.nxt_e02_interval_distribution(
 p_interval text,p_filters jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_interval NOT IN('order_to_production','production_duration','production_to_shipment','shipment_to_delivery','order_to_delivery')
 THEN RAISE EXCEPTION 'INVALID_PROCESS_INTERVAL' USING ERRCODE='22023'; END IF;
 WITH source AS (
  SELECT c.delivered_date,c.promised_date,c.order_tolerance_met,i.has_source_anomaly,
   CASE p_interval
    WHEN 'order_to_production' THEN i.order_to_start_days
    WHEN 'production_duration' THEN i.production_days
    WHEN 'production_to_shipment' THEN i.production_to_ship_days
    WHEN 'shipment_to_delivery' THEN i.ship_to_delivery_days
    WHEN 'order_to_delivery' THEN i.order_to_delivery_days
   END AS days
  FROM public.woodcorp_cases c JOIN public.nxt_e02_case_intervals i USING(case_key)
  WHERE public.nxt_case_matches(c,p_filters)
 ), grouped AS (
  SELECT
   CASE WHEN days IS NULL THEN 9 WHEN has_source_anomaly OR days<0 THEN 8
    WHEN days<1 THEN 1 WHEN days<7 THEN 2 WHEN days<14 THEN 3
    WHEN days<30 THEN 4 WHEN days<60 THEN 5 ELSE 6 END AS sort_order,
   CASE WHEN days IS NULL THEN 'Fehlende Werte'
    WHEN has_source_anomaly OR days<0 THEN 'Ungültig/negativ'
    WHEN days<1 THEN '0–1 Tag' WHEN days<7 THEN '1–7 Tage'
    WHEN days<14 THEN '7–14 Tage' WHEN days<30 THEN '14–30 Tage'
    WHEN days<60 THEN '30–60 Tage' ELSE '60+ Tage' END AS bucket,
   COUNT(*)::bigint AS cases,
   COUNT(*) FILTER(WHERE delivered_date<=promised_date AND order_tolerance_met=1)::bigint AS otif_cases,
   COUNT(*) FILTER(WHERE delivered_date IS NOT NULL AND promised_date IS NOT NULL
     AND order_tolerance_met IS NOT NULL
     AND NOT(delivered_date<=promised_date AND order_tolerance_met=1))::bigint AS non_otif_cases
  FROM source GROUP BY 1,2
 )
 SELECT COALESCE(jsonb_agg(to_jsonb(grouped) ORDER BY sort_order),'[]'::jsonb) INTO result FROM grouped;
 RETURN result;
END $fn$;

REVOKE ALL ON FUNCTION public.nxt_e02_interval_summary(jsonb),
 public.nxt_e02_interval_distribution(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_e02_interval_summary(jsonb),
 public.nxt_e02_interval_distribution(text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.nxt_e02_interval_summary(jsonb)
 IS 'Case-grain E02 intervals, validated filters, nonnegative durations only in medians and P90. Actual delivery from delivered_date.';
COMMENT ON FUNCTION public.nxt_e02_interval_distribution(text,jsonb)
 IS 'Case-grain E02 interval bins, with explicit negative and missing buckets. No dynamic SQL.';

