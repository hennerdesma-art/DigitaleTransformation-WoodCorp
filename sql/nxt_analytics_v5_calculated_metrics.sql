-- v5: Curated, parameterized calculated KPI templates.
-- This function NEVER runs SQL submitted by a client. Formula and rate are explicit.
CREATE OR REPLACE FUNCTION public.nxt_calculated_metric(
 p_template text,
 p_filters jsonb DEFAULT '[]'::jsonb,
 p_rate_eur_per_kg numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $fn$
DECLARE result jsonb;
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_template NOT IN ('late_orders', 'shortfall_kg', 'estimated_shortfall_cost_eur') THEN
  RAISE EXCEPTION 'Unknown calculation template' USING ERRCODE='22023';
 END IF;
 IF p_template = 'estimated_shortfall_cost_eur' AND
    (p_rate_eur_per_kg IS NULL OR p_rate_eur_per_kg <= 0 OR p_rate_eur_per_kg > 10000) THEN
  RAISE EXCEPTION 'An approved rate > 0 and <= 10000 EUR/kg must be provided' USING ERRCODE='22023';
 END IF;
 SELECT jsonb_build_object(
   'template',p_template,
   'value', CASE p_template
      WHEN 'late_orders' THEN count(*) FILTER(WHERE c.delivered_date > c.promised_date)::numeric
      WHEN 'shortfall_kg' THEN COALESCE(sum(GREATEST(c.ordered_quantity-c.delivered_quantity,0))
        FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0)
      WHEN 'estimated_shortfall_cost_eur' THEN ROUND(COALESCE(sum(GREATEST(c.ordered_quantity-c.delivered_quantity,0))
        FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL),0)*p_rate_eur_per_kg,2)
      END,
   'unit', CASE p_template WHEN 'late_orders' THEN 'Aufträge' WHEN 'shortfall_kg' THEN 'kg' ELSE 'EUR (Schätzung)' END,
   'caseCount', count(*),
   'eligibleCases', CASE WHEN p_template = 'late_orders' THEN count(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL)
     ELSE count(*) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.delivered_quantity IS NOT NULL) END,
   'excludedCases', CASE WHEN p_template = 'late_orders' THEN count(*) FILTER(WHERE c.delivered_date IS NULL OR c.promised_date IS NULL)
     ELSE count(*) FILTER(WHERE c.delivered_quantity_unit IS DISTINCT FROM 'kg' OR c.ordered_quantity IS NULL OR c.delivered_quantity IS NULL) END,
   'rateEurPerKg', CASE WHEN p_template='estimated_shortfall_cost_eur' THEN p_rate_eur_per_kg ELSE NULL END,
   'isEstimate',p_template='estimated_shortfall_cost_eur'
 ) INTO result
 FROM public.woodcorp_cases c
 WHERE public.nxt_case_matches(c,p_filters);
 RETURN result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.nxt_calculated_metric(text,jsonb,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_calculated_metric(text,jsonb,numeric) TO authenticated;
COMMENT ON FUNCTION public.nxt_calculated_metric(text,jsonb,numeric)
 IS 'Only vetted, case-grain KPI templates; no arbitrary SQL. EUR formula requires user-provided rate and excludes non-kg quantities.';
