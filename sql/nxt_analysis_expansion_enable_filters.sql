-- Extend the existing allowlist for the verified root-cause fields; no changes to RLS or existing rows.
ALTER TABLE public.nxt_filter_catalog DROP CONSTRAINT IF EXISTS nxt_filter_catalog_field_key_check;
ALTER TABLE public.nxt_filter_catalog ADD CONSTRAINT nxt_filter_catalog_field_key_check CHECK (field_key IN ('factory', 'product_type', 'delivery_company', 'warehouse_type', 'cust_country', 'delivery_year', 'cust_market', 'delivered_quantity_unit', 'cust_addr_code', 'order_tolerance_met', 'otif_status', 'delivered_date', 'promised_date', 'ordered_quantity', 'delivered_quantity', 'order_value', 'days_to_del_deadline', 'quantity_change_count', 'delivery_date_change_count', 'production_start_change_count', 'price_change_count', 'anomalous_event_count', 'factory_product', 'quantity_deviation_class', 'credit_block', 'quantity_change_phase', 'process_order_quality', 'process_variant', 'order_size_class', 'cust_id', 'quantity_change_group', 'delivery_month', 'quantity_deviation_pct', 'penalty_eur', 'order_confirmation_days', 'production_preparation_days', 'order_to_start_days', 'production_days', 'production_to_ship_days', 'ship_to_delivery_days', 'order_to_delivery_days', 'shipment_buffer_days', 'start_buffer_days', 'end_buffer_days', 'quantity_changes_after_start', 'quantity_changes_after_end', 'quantity_changes_after_ship', 'min_order_tolerance', 'max_order_tolerance', 'unit_price', 'order_received_date'));

-- Register missing, verified filter definitions. Preserve manually existing records and names.
INSERT INTO public.nxt_filter_catalog(field_key,display_name,enabled,sort_order) VALUES
('cust_market','Kundenmarkt',true,140),
('delivered_quantity_unit','Mengeneinheit',true,145),
('cust_addr_code','Adresscode',true,150),
('order_tolerance_met','Mengentoleranz erfüllt',true,155),
('factory_product','Werk × Produkt',true,160),
('quantity_deviation_class','Mengenabweichung',true,165),
('credit_block','Kreditsperre',true,170),
('quantity_change_phase','Letzte Mengenänderung · Prozessphase',true,175),
('process_order_quality','Prozessdaten · Qualitätsstatus',true,180),
('process_variant','Prozessvariante (Aktivitätsfolge)',true,185),
('order_size_class','Auftragsgrößenklasse (kg)',true,190),
('cust_id','Kunden-ID',true,195),
('quantity_change_group','Mengenänderungen · Klassen',true,200),
('delivery_month','Liefermonat',true,205),
('quantity_deviation_pct','Mengenabweichung (%)',true,210),
('penalty_eur','Modellierte Strafkosten je Auftrag (€)',true,215),
('order_confirmation_days','Auftrag → Bestätigung (Tage)',true,220),
('production_preparation_days','Bestätigung → Produktionsstart (Tage)',true,225),
('order_to_start_days','Auftrag → Produktionsstart (Tage)',true,230),
('production_days','Produktionsdauer (Tage)',true,235),
('production_to_ship_days','Produktionsende → Verladung (Tage)',true,240),
('ship_to_delivery_days','Verladung → Lieferung (Tage)',true,245),
('order_to_delivery_days','Auftrag → Lieferung (Tage)',true,250),
('shipment_buffer_days','Restpuffer bei Verladung (Tage)',true,255),
('start_buffer_days','Restpuffer bei Produktionsstart (Tage)',true,260),
('end_buffer_days','Restpuffer bei Produktionsende (Tage)',true,265),
('quantity_changes_after_start','Mengenänderungen nach Produktionsstart',true,270),
('quantity_changes_after_end','Mengenänderungen nach Produktionsende',true,275),
('quantity_changes_after_ship','Mengenänderungen nach Verladung',true,280),
('min_order_tolerance','Untere Mengentoleranz (Quellwert)',true,285),
('max_order_tolerance','Obere Mengentoleranz (Quellwert)',true,290),
('unit_price','Einheitspreis (Quellwert)',true,295),
('order_received_date','Auftragseingang',true,300)
ON CONFLICT (field_key) DO NOTHING;
