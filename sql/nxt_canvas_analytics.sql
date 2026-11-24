-- Additive measures and explicitly selected aggregate groupings; existing measures and RLS unchanged.
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
  'delivery_year','cust_market','delivered_quantity_unit','cust_addr_code','order_tolerance_met','otif_status','factory_product','quantity_deviation_class','credit_block','quantity_change_phase','process_order_quality','process_variant','order_size_class','cust_id','cust_name','quantity_change_group','delivery_month','order_received_month','promised_month','customer_product','all')
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
        WHEN 'cust_name' THEN c.cust_name
        WHEN 'customer_product' THEN c.cust_id||' · '||c.product_type
        WHEN 'order_received_month' THEN to_char(ei.order_received_ts,'YYYY-MM')
        WHEN 'promised_month' THEN to_char(c.promised_date,'YYYY-MM')
        WHEN 'all' THEN 'Gesamt'
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
   END AS label, c.*, pf.case_key AS feature_case_key, pf.credit_block_count, pf.order_confirmation_days, pf.production_preparation_days, pf.quantity_changes_after_start, pf.quantity_changes_after_end, pf.quantity_changes_after_ship, pf.delivery_date_change_count, pf.production_start_change_count, pf.process_variant, pf.process_order_quality, ei.load_shipment_ts
  FROM public.woodcorp_cases c LEFT JOIN public.nxt_case_process_features pf ON pf.case_key=c.case_key
 LEFT JOIN public.nxt_e02_case_intervals ei ON ei.case_key=c.case_key WHERE public.nxt_case_matches(c,p_filters)
 ), segments AS (
  SELECT label,
    COUNT(*)::bigint AS orders,
    SUM(ordered_quantity) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND ordered_quantity>=0) AS "orderedKg",
    SUM(delivered_quantity) FILTER(WHERE delivered_quantity_unit='kg' AND delivered_quantity IS NOT NULL AND delivered_quantity>=0) AS "deliveredKg",
    ROUND(AVG(ordered_quantity) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND ordered_quantity>=0),2) AS "avgOrderedKg",
    COUNT(*) FILTER(WHERE delivered_date IS NOT NULL AND promised_date IS NOT NULL) AS date_coverage,
    COUNT(*) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND ordered_quantity>=0) AS ordered_kg_cases,
    COUNT(*) FILTER(WHERE delivered_quantity_unit='kg' AND delivered_quantity IS NOT NULL AND delivered_quantity>=0) AS delivered_kg_cases,
    CASE WHEN p_field IN ('cust_id','cust_name','customer_product') THEN string_agg(DISTINCT cust_name,', ' ORDER BY cust_name) END AS customer_name,
    CASE WHEN p_field IN ('cust_id','cust_name','customer_product') THEN string_agg(DISTINCT btrim(cust_country),', ' ORDER BY btrim(cust_country)) END AS customer_country,
    CASE WHEN p_field IN ('cust_id','cust_name','customer_product') THEN COUNT(DISTINCT cust_id) END AS customer_id_count,

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
  ,
    ROUND(SUM(CASE WHEN delivered_quantity_unit='kg' THEN CASE WHEN delivered_date>promised_date THEN COALESCE(delivered_quantity,0)*0.75 ELSE 0 END + CASE WHEN ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL THEN GREATEST(ordered_quantity-delivered_quantity,0)*0.75 ELSE 0 END END) FILTER (WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL AND promised_date IS NOT NULL AND delivered_date IS NOT NULL)/NULLIF(COUNT(*) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL AND promised_date IS NOT NULL AND delivered_date IS NOT NULL),0),2) AS "penaltyPerOrderEur",
    ROUND(SUM(CASE WHEN delivered_quantity_unit='kg' THEN CASE WHEN delivered_date>promised_date THEN COALESCE(delivered_quantity,0)*0.75 ELSE 0 END + CASE WHEN ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL THEN GREATEST(ordered_quantity-delivered_quantity,0)*0.75 ELSE 0 END END) FILTER (WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL AND promised_date IS NOT NULL AND delivered_date IS NOT NULL)/NULLIF(SUM(ordered_quantity) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL AND promised_date IS NOT NULL AND delivered_date IS NOT NULL),0),4) AS "penaltyPerKgEur",
    ROUND(100*SUM(CASE WHEN delivered_quantity_unit='kg' THEN CASE WHEN delivered_date>promised_date THEN COALESCE(delivered_quantity,0)*0.75 ELSE 0 END + CASE WHEN ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL THEN GREATEST(ordered_quantity-delivered_quantity,0)*0.75 ELSE 0 END END) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL AND promised_date IS NOT NULL AND delivered_date IS NOT NULL AND order_value>0)/NULLIF(SUM(order_value) FILTER(WHERE delivered_quantity_unit='kg' AND ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL AND promised_date IS NOT NULL AND delivered_date IS NOT NULL AND order_value>0),0),2) AS "penaltyOrderValueRate",
    ROUND(100.0*COUNT(*) FILTER (WHERE delivered_quantity<ordered_quantity)/NULLIF(COUNT(*) FILTER (WHERE ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL),0),2) AS "underDeliveryRate",
    ROUND(100.0*COUNT(*) FILTER (WHERE delivered_quantity>ordered_quantity)/NULLIF(COUNT(*) FILTER (WHERE ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL),0),2) AS "overDeliveryRate",
    COALESCE(SUM(GREATEST(delivered_quantity-ordered_quantity,0)) FILTER(WHERE ordered_quantity IS NOT NULL AND delivered_quantity IS NOT NULL AND delivered_quantity_unit='kg'),0) AS "overDeliveryKg",
    ROUND(AVG(100*(delivered_quantity-ordered_quantity)/NULLIF(ordered_quantity,0)),2) AS "quantityDeviationPct",
    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY order_confirmation_days) FILTER (WHERE order_confirmation_days>=0))::numeric,2) AS "orderConfirmationDays",
    ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY production_preparation_days) FILTER (WHERE production_preparation_days>=0))::numeric,2) AS "productionPreparationDays",
    ROUND((percentile_cont(0.5) WITHIN GROUP(ORDER BY extract(epoch FROM(promised_date-load_shipment_ts))/86400) FILTER (WHERE promised_date IS NOT NULL AND load_shipment_ts IS NOT NULL))::numeric,2) AS "shipmentBufferDays",
    SUM(quantity_changes_after_start) AS "quantityChangesAfterStart",
    SUM(quantity_changes_after_end) AS "quantityChangesAfterEnd",
    SUM(quantity_changes_after_ship) AS "quantityChangesAfterShip",
    ROUND(100.0*COUNT(*) FILTER (WHERE credit_block_count>0)/NULLIF(COUNT(*) FILTER (WHERE credit_block_count IS NOT NULL),0),2) AS "creditBlockRate",
    ROUND(100.0*COUNT(*) FILTER (WHERE delivery_date_change_count>0 OR production_start_change_count>0)/NULLIF(COUNT(*) FILTER (WHERE feature_case_key IS NOT NULL),0),2) AS "scheduleChangeRate",
    COUNT(DISTINCT process_variant) AS "processVariantCount",
    ROUND(100.0*COUNT(*) FILTER (WHERE process_order_quality='Chronologisch plausibel')/NULLIF(COUNT(*) FILTER (WHERE true),0),2) AS "dataQualityCoverageRate"
  FROM labelled GROUP BY label
 ), results AS (
  SELECT label,orders,"orderedKg","deliveredKg","avgOrderedKg",date_coverage,ordered_kg_cases,delivered_kg_cases,customer_name,customer_country,customer_id_count,otif_cases,on_time_not_full_cases,late_in_full_cases,late_not_full_cases,unknown_cases,late_orders,
    otif_rate,on_time_rate,volume_rate,late_penalty_eur,shortfall_penalty_eur,
    late_penalty_eur+shortfall_penalty_eur AS total_penalty_eur,
    "penaltyPerOrderEur","penaltyPerKgEur","penaltyOrderValueRate","underDeliveryRate","overDeliveryRate","overDeliveryKg","quantityDeviationPct","orderConfirmationDays","productionPreparationDays","shipmentBufferDays","quantityChangesAfterStart","quantityChangesAfterEnd","quantityChangesAfterShip","creditBlockRate","scheduleChangeRate","processVariantCount","dataQualityCoverageRate"
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
 'orderedKg',SUM(c.ordered_quantity) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.ordered_quantity>=0),
 'deliveredKg',SUM(c.delivered_quantity) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.delivered_quantity IS NOT NULL AND c.delivered_quantity>=0),
 'avgOrderedKg',ROUND(AVG(c.ordered_quantity) FILTER(WHERE c.delivered_quantity_unit='kg' AND c.ordered_quantity IS NOT NULL AND c.ordered_quantity>=0),2),
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
