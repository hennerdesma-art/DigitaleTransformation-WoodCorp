-- NXT Analytics: validated, administrator-enabled additional categorical filter fields
-- Only case-level columns with verified data and controlled cardinality may be registered.
ALTER TABLE public.nxt_filter_catalog DROP CONSTRAINT IF EXISTS nxt_filter_catalog_field_key_check;
ALTER TABLE public.nxt_filter_catalog ADD CONSTRAINT nxt_filter_catalog_field_key_check
 CHECK(field_key IN (
 'factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year',
 'cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met'
 ));
GRANT INSERT ON public.nxt_filter_catalog TO authenticated;
DROP POLICY IF EXISTS nxt_filter_catalog_admin_insert ON public.nxt_filter_catalog;
CREATE POLICY nxt_filter_catalog_admin_insert ON public.nxt_filter_catalog FOR INSERT TO authenticated
WITH CHECK(EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin'));

CREATE OR REPLACE FUNCTION public.nxt_validate_filters(p_filters jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
DECLARE f jsonb;
BEGIN
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'array' OR jsonb_array_length(p_filters)>12 THEN
  RAISE EXCEPTION 'Invalid filters format';
 END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_filters)
 LOOP
  IF f->>'field' NOT IN (
     'factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year',
     'cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met')
    OR f->>'op'<>'eq' OR jsonb_typeof(f->'value')<>'string'
    OR length(f->>'value')=0 OR length(f->>'value')>200 THEN
   RAISE EXCEPTION 'Invalid filter definition';
  END IF;
 END LOOP;
 RETURN TRUE;
END $f$;

CREATE OR REPLACE FUNCTION public.nxt_case_matches(c public.woodcorp_cases,p_filters jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(p_filters) AS predicate
  WHERE (CASE predicate->>'field'
   WHEN 'factory' THEN c.factory
   WHEN 'product_type' THEN c.product_type
   WHEN 'delivery_company' THEN c.delivery_company
   WHEN 'warehouse_type' THEN c.warehouse_type
   WHEN 'cust_country' THEN c.cust_country
   WHEN 'delivery_year' THEN EXTRACT(year FROM c.delivered_date)::int::text
   WHEN 'cust_market' THEN c.cust_market
   WHEN 'delivered_quantity_unit' THEN c.delivered_quantity_unit
   WHEN 'cust_addr_code' THEN c.cust_addr_code
   WHEN 'order_tolerance_met' THEN c.order_tolerance_met::text
   ELSE NULL END) IS DISTINCT FROM predicate->>'value'
 );
$f$;

CREATE OR REPLACE FUNCTION public.nxt_breakdown(p_field text,p_filters jsonb DEFAULT '[]'::jsonb)
RETURNS TABLE(label text,orders bigint,on_time_rate numeric,volume_rate numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_field NOT IN (
 'factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year',
 'cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met'
 ) THEN RAISE EXCEPTION 'Unsupported breakdown field'; END IF;
 RETURN QUERY SELECT (CASE p_field
   WHEN 'factory' THEN c.factory
   WHEN 'product_type' THEN c.product_type
   WHEN 'delivery_company' THEN c.delivery_company
   WHEN 'warehouse_type' THEN c.warehouse_type
   WHEN 'cust_country' THEN c.cust_country
   WHEN 'delivery_year' THEN EXTRACT(year FROM c.delivered_date)::int::text
   WHEN 'cust_market' THEN c.cust_market
   WHEN 'delivered_quantity_unit' THEN c.delivered_quantity_unit
   WHEN 'cust_addr_code' THEN c.cust_addr_code
   WHEN 'order_tolerance_met' THEN c.order_tolerance_met::text
  END)::text,
  COUNT(*)::bigint,
  ROUND(100.0*COUNT(*) FILTER(WHERE c.delivered_date<=c.promised_date)
    /NULLIF(COUNT(*) FILTER(WHERE c.delivered_date IS NOT NULL AND c.promised_date IS NOT NULL),0),1),
  ROUND(100.0*COUNT(*) FILTER(WHERE c.order_tolerance_met=1)
    /NULLIF(COUNT(*) FILTER(WHERE c.order_tolerance_met IS NOT NULL),0),1)
 FROM public.woodcorp_cases c
 WHERE public.nxt_case_matches(c,p_filters)
 GROUP BY 1 ORDER BY 2 DESC NULLS LAST;
END $f$;

CREATE OR REPLACE FUNCTION public.nxt_dimensions()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
 SELECT jsonb_build_object(
 'factory',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT factory v FROM public.woodcorp_cases WHERE factory IS NOT NULL)x),
 'product_type',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT product_type v FROM public.woodcorp_cases WHERE product_type IS NOT NULL)x),
 'delivery_company',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT delivery_company v FROM public.woodcorp_cases WHERE delivery_company IS NOT NULL)x),
 'warehouse_type',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT warehouse_type v FROM public.woodcorp_cases WHERE warehouse_type IS NOT NULL)x),
 'cust_country',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT cust_country v FROM public.woodcorp_cases WHERE cust_country IS NOT NULL)x),
 'delivery_year',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT EXTRACT(year FROM delivered_date)::int::text v FROM public.woodcorp_cases WHERE delivered_date IS NOT NULL)x),
 'cust_market',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT cust_market v FROM public.woodcorp_cases WHERE cust_market IS NOT NULL)x),
 'delivered_quantity_unit',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT delivered_quantity_unit v FROM public.woodcorp_cases WHERE delivered_quantity_unit IS NOT NULL)x),
 'cust_addr_code',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT cust_addr_code v FROM public.woodcorp_cases WHERE cust_addr_code IS NOT NULL)x),
 'order_tolerance_met',(SELECT coalesce(jsonb_agg(v ORDER BY v),'[]'::jsonb) FROM (SELECT DISTINCT order_tolerance_met::text v FROM public.woodcorp_cases WHERE order_tolerance_met IS NOT NULL)x)
 );
$f$;

CREATE OR REPLACE FUNCTION public.nxt_filter_candidates()
RETURNS TABLE(field_key text,suggested_name text,distinct_values bigint,available boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $f$
WITH candidate(field_key,suggested_name,distinct_values) AS (
 VALUES
 ('cust_market'::text,'Kundenmarkt'::text,(SELECT COUNT(DISTINCT cust_market) FROM public.woodcorp_cases)),
 ('delivered_quantity_unit'::text,'Mengeneinheit'::text,(SELECT COUNT(DISTINCT delivered_quantity_unit) FROM public.woodcorp_cases)),
 ('cust_addr_code'::text,'Adresscode'::text,(SELECT COUNT(DISTINCT cust_addr_code) FROM public.woodcorp_cases)),
 ('order_tolerance_met'::text,'Mengentoleranz erfüllt'::text,(SELECT COUNT(DISTINCT order_tolerance_met) FROM public.woodcorp_cases))
)
SELECT candidate.field_key,candidate.suggested_name,candidate.distinct_values,
(candidate.distinct_values BETWEEN 1 AND 100 AND f.field_key IS NULL)
FROM candidate LEFT JOIN public.nxt_filter_catalog f ON f.field_key=candidate.field_key
WHERE EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()))
ORDER BY candidate.field_key;
$f$;
REVOKE ALL ON FUNCTION public.nxt_filter_candidates() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_filter_candidates() TO authenticated;

CREATE OR REPLACE FUNCTION public.nxt_register_filter(p_field_key text,p_display_name text)
RETURNS SETOF public.nxt_filter_catalog
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $f$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.woodcorp_access a WHERE a.user_id=(SELECT auth.uid()) AND a.role='admin') THEN
  RAISE EXCEPTION 'Administratorrechte erforderlich' USING ERRCODE='42501';
 END IF;
 IF p_display_name IS NULL OR char_length(trim(p_display_name)) NOT BETWEEN 2 AND 80
    OR p_display_name ~ '[<>]' THEN
  RAISE EXCEPTION 'Ungültige Bezeichnung' USING ERRCODE='22023';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.nxt_filter_candidates() c WHERE c.field_key=p_field_key AND c.available) THEN
  RAISE EXCEPTION 'Feld nicht verfügbar oder bereits registriert' USING ERRCODE='22023';
 END IF;
 RETURN QUERY INSERT INTO public.nxt_filter_catalog(field_key,display_name,enabled,sort_order)
 VALUES(p_field_key,trim(p_display_name),true,70)
 RETURNING *;
END $f$;
REVOKE ALL ON FUNCTION public.nxt_register_filter(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_register_filter(text,text) TO authenticated;

REVOKE ALL ON FUNCTION public.nxt_validate_filters(jsonb),
 public.nxt_case_matches(public.woodcorp_cases,jsonb),
 public.nxt_breakdown(text,jsonb),
 public.nxt_dimensions() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_validate_filters(jsonb),
 public.nxt_case_matches(public.woodcorp_cases,jsonb),
 public.nxt_breakdown(text,jsonb),
 public.nxt_dimensions() TO authenticated;
