-- Verification Script: 000_verify_pricing.sql
-- Run this in Supabase SQL Editor to verify the Pricing Engine Logic

DO $$
DECLARE
    v_courier_id UUID;
    v_sender_id UUID;
    v_zone_id UUID;
    v_tariff_set_id UUID;
    v_shipment_id UUID;
    v_snapshot_id UUID;
    v_total NUMERIC;
BEGIN
    RAISE NOTICE '--- STARTING VERIFICATION ---';

    -- 1. Setup Data
    -- Assume we have an admin org or similar, but let's try to grab existing ones or create dummies if safely possible.
    -- Better: Select existing ones.
    SELECT id INTO v_courier_id FROM organizations WHERE type = 'cadeteria' LIMIT 1;
    SELECT id INTO v_sender_id FROM organizations WHERE type = 'remitente' LIMIT 1;
    
    IF v_courier_id IS NULL OR v_sender_id IS NULL THEN
        RAISE NOTICE 'Skipping verification: Missing Courier or Sender orgs.';
        RETURN;
    END IF;

    -- Create Zone
    INSERT INTO pricing.zones (courier_org_id, name) 
    VALUES (v_courier_id, 'Zona Test')
    RETURNING id INTO v_zone_id;

    -- Create Tariff Set
    INSERT INTO pricing.tariff_sets (courier_org_id, scope, name)
    VALUES (v_courier_id, 'GENERIC', 'Tarifa Test')
    RETURNING id INTO v_tariff_set_id;

    -- Create Rules (Express 24h)
    -- Service Code match lowercase 'express_24h'
    
    -- Stop Fee
    INSERT INTO pricing.tariff_rules (tariff_set_id, service_type, rule_kind, zone_id, amount)
    VALUES (v_tariff_set_id, 'express_24h', 'STOP_FEE_BY_ZONE', v_zone_id, 150);

    -- Package Fee (Mediano)
    INSERT INTO pricing.tariff_rules (tariff_set_id, service_type, rule_kind, package_size, amount)
    VALUES (v_tariff_set_id, 'express_24h', 'PACKAGE_FEE_BY_SIZE', 'mediano', 50);

    RAISE NOTICE 'Setup Complete. Zone: %, TariffSet: %', v_zone_id, v_tariff_set_id;

    -- 2. Create Shipment
    INSERT INTO shipments (
        remitente_org_id, cadeteria_org_id, service_type_id,
        tracking_code, recipient_name, recipient_address,
        zone_id, status, package_size, package_count,
        locality_manual, recipient_department -- Added validation fields
    ) VALUES (
        v_sender_id, v_courier_id, (SELECT id FROM service_types WHERE code = 'express_24h' LIMIT 1),
        'TEST-PRICE-001', 'Test User', '123 Test St',
        v_zone_id, 'pendiente', 'mediano', 1,
        'Montevideo', 'Montevideo' -- Satisfy chk_shipments_locality_xor
    ) RETURNING id INTO v_shipment_id;

    -- Ensure package exists (trigger or manual)
    -- Migration 012 adds it usually, but let's check
    IF NOT EXISTS (SELECT 1 FROM shipment_packages WHERE shipment_id = v_shipment_id) THEN
        INSERT INTO shipment_packages (shipment_id, index, size) VALUES (v_shipment_id, 1, 'mediano');
    END IF;

    RAISE NOTICE 'Shipment Created: %', v_shipment_id;

    -- 3. Execute Reprice
    v_snapshot_id := pricing.reprice_shipment(v_shipment_id, 'REGENERATE_ALL');
    
    -- 4. Verify Results
    SELECT total_to_charge INTO v_total FROM pricing.shipment_pricing_snapshots WHERE id = v_snapshot_id;
    
    IF v_total = 200 THEN
        RAISE NOTICE 'SUCCESS: Calculated Total is 200 (150 Stop + 50 Package)';
    ELSE
        RAISE NOTICE 'FAILURE: Calculated Total is %, expected 200', v_total;
    END IF;
    
    -- 5. Test Override
    -- Edit line manually
    UPDATE pricing.shipment_pricing_lines 
    SET unit_amount = 80, line_amount = 80, is_manual = true 
    WHERE snapshot_id = v_snapshot_id AND line_type = 'PACKAGE_FEE';
    
    -- Regen
    v_snapshot_id := pricing.reprice_shipment(v_shipment_id, 'REGENERATE_ALL');
    
    SELECT total_to_charge INTO v_total FROM pricing.shipment_pricing_snapshots WHERE id = v_snapshot_id;
    
    IF v_total = 230 THEN -- 150 Stop + 80 Manual Package
        RAISE NOTICE 'SUCCESS: Manual Override Persisted. Total 230.';
    ELSE
        RAISE NOTICE 'FAILURE: Override lost or wrong calculation. Total %, expected 230', v_total;
    END IF;

    -- Clean up (Optional, or leave for inspection)
    -- ROLLBACK; -- Uncomment to dry run
END $$;
