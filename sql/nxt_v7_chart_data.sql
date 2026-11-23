-- NXT v7: bounded, authenticated, case-grain datasets for a broad visual library.
-- No dynamic SQL, no event-row duplication, only allowlisted segment dimensions.
CREATE OR REPLACE FUNCTION public.nxt_chart_segments(
 p_field text, p_filters jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_field NOT IN ('factory','product_type','delivery_company','warehouse_type','cust_country',
  'delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status')
 THEN RAISE EXCEPTION 'INVALID_CHART_DIMENSION' USING ERRCODE='22023'; END IF;
 WITH labelled AS (
  SELECT CASE p_field
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
  FROM public.woodcorp_cases c WHERE public.nxt_case_matches(c,p_filters)
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
  FROM segments ORDER BY orders DESC LIMIT 30
 )
 SELECT COALESCE(jsonb_agg(to_jsonb(results) ORDER BY results.orders DESC),'[]'::jsonb) INTO result FROM results;
 RETURN result;
END $fn$;

CREATE OR REPLACE FUNCTION public.nxt_chart_heatmap(
 p_x_field text,p_y_field text,p_filters jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_x_field=p_y_field OR p_x_field NOT IN ('factory','product_type','delivery_company','cust_market','cust_country','warehouse_type')
 OR p_y_field NOT IN ('factory','product_type','delivery_company','cust_market','cust_country','warehouse_type')
 THEN RAISE EXCEPTION 'INVALID_HEATMAP_PAIR' USING ERRCODE='22023';END IF;
 WITH cells AS (
  SELECT
   CASE p_x_field WHEN 'factory' THEN c.factory WHEN 'product_type' THEN c.product_type
    WHEN 'delivery_company' THEN c.delivery_company WHEN 'cust_market' THEN c.cust_market
    WHEN 'cust_country' THEN c.cust_country WHEN 'warehouse_type' THEN c.warehouse_type END AS x,
   CASE p_y_field WHEN 'factory' THEN c.factory WHEN 'product_type' THEN c.product_type
    WHEN 'delivery_company' THEN c.delivery_company WHEN 'cust_market' THEN c.cust_market
    WHEN 'cust_country' THEN c.cust_country WHEN 'warehouse_type' THEN c.warehouse_type END AS y,
   COUNT(*)::bigint AS orders,
   ROUND(100.0*COUNT(*) FILTER(WHERE c.delivered_date<=c.promised_date AND c.order_tolerance_met=1)/
    NULLIF(COUNT(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL AND c.order_tolerance_met IS NOT NULL),0),1) AS otif_rate,
   ROUND(
      (COALESCE(SUM(c.delivered_quantity) FILTER(WHERE c.delivered_date>c.promised_date AND c.delivered_quantity_unit='kg'),0)
      +COALESCE(SUM(GREATEST(c.ordered_quantity-c.delivered_quantity,0)) FILTER(
          WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0))*0.75,2) AS total_penalty_eur
  FROM public.woodcorp_cases c WHERE public.nxt_case_matches(c,p_filters)
  GROUP BY 1,2 ORDER BY orders DESC LIMIT 150
 )
 SELECT COALESCE(jsonb_agg(to_jsonb(cells)),'[]'::jsonb) INTO result FROM cells;
 RETURN result;
END $fn$;

CREATE OR REPLACE FUNCTION public.nxt_chart_distribution(
 p_measure text,p_filters jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_measure NOT IN ('quantity_change_count','lateness_days') THEN RAISE EXCEPTION 'INVALID_DISTRIBUTION' USING ERRCODE='22023';END IF;
 WITH bins AS (
  SELECT CASE p_measure
    WHEN 'quantity_change_count' THEN CASE WHEN coalesce(pf.quantity_change_count,0)>=3 THEN '3+' ELSE coalesce(pf.quantity_change_count,0)::text END
    WHEN 'lateness_days' THEN CASE WHEN c.delivered_date IS NULL OR c.promised_date IS NULL THEN 'Unbekannt'
      WHEN c.delivered_date<=c.promised_date THEN 'Pünktlich'
      WHEN c.delivered_date-c.promised_date<=interval '7 days' THEN '1–7 Tage'
      WHEN c.delivered_date-c.promised_date<=interval '30 days' THEN '8–30 Tage'
      ELSE '>30 Tage' END END AS bucket,
   c.case_key,c.delivered_date,c.promised_date,c.order_tolerance_met
  FROM public.woodcorp_cases c
  LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
     AND p_measure='quantity_change_count'
  WHERE public.nxt_case_matches(c,p_filters)
 ), aggregated AS (
  SELECT bucket,COUNT(*)::bigint AS orders,
   ROUND(100.0*COUNT(*) FILTER(WHERE delivered_date<=promised_date AND order_tolerance_met=1)/NULLIF(COUNT(*),0),1) AS otif_rate
  FROM bins GROUP BY bucket
 )
 SELECT COALESCE(jsonb_agg(to_jsonb(aggregated)),'[]'::jsonb) INTO result FROM aggregated;
 RETURN result;
END $fn$;
REVOKE ALL ON FUNCTION public.nxt_chart_segments(text,jsonb),
 public.nxt_chart_heatmap(text,text,jsonb),
 public.nxt_chart_distribution(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_chart_segments(text,jsonb),
 public.nxt_chart_heatmap(text,text,jsonb),
 public.nxt_chart_distribution(text,jsonb) TO authenticated;
COMMENT ON FUNCTION public.nxt_chart_segments(text,jsonb) IS
 'Filtered case-grain O2C segment breakdown; computed contractual penalties 0.75 EUR/kg, not paid invoices.';
