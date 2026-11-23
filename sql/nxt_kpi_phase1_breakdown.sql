-- Keep existing breakdown response shape, but allow OTIF status as a segmentation dimension.
CREATE OR REPLACE FUNCTION public.nxt_breakdown(p_field text,p_filters jsonb DEFAULT '[]'::jsonb)
RETURNS TABLE(label text,orders bigint,on_time_rate numeric,volume_rate numeric)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=''
AS $fn$
BEGIN
 PERFORM public.nxt_validate_filters(p_filters);
 IF p_field NOT IN ('factory','product_type','delivery_company','warehouse_type','cust_country','delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status')
 THEN RAISE EXCEPTION 'UNSUPPORTED_BREAKDOWN_DIMENSION' USING ERRCODE='22023';END IF;
 RETURN QUERY SELECT (CASE p_field
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
 FROM public.woodcorp_cases c
 WHERE public.nxt_case_matches(c,p_filters)
 GROUP BY 1 ORDER BY 2 DESC NULLS LAST;
END $fn$;
REVOKE ALL ON FUNCTION public.nxt_breakdown(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.nxt_breakdown(text,jsonb) TO authenticated;