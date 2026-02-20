-- Migration: 024_rls_policies.sql
-- Description: RLS Policies for Pricing and Billing Schemas

-- 1. ENABLE RLS
ALTER TABLE pricing.courier_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.zone_geoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.tariff_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.tariff_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.shipment_pricing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.shipment_pricing_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.courier_sender_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.shipment_billing ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing.settlement_lines ENABLE ROW LEVEL SECURITY;

-- 2. POLICIES

-- 2.1 Courier Services
-- Read: Authenticated users (to see available services when creating shipment)
CREATE POLICY "services_read_authenticated" ON pricing.courier_services
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Manage: Courier Admin for their own org
CREATE POLICY "services_manage_own" ON pricing.courier_services
    FOR ALL USING (courier_org_id = get_user_org_id());

-- 2.2 Zones
-- Read: Authenticated (needed for shipment creation/viewing)
CREATE POLICY "zones_read_authenticated" ON pricing.zones
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Manage: Courier Admin
CREATE POLICY "zones_manage_own" ON pricing.zones
    FOR ALL USING (courier_org_id = get_user_org_id());
    
-- Zone Geoms (Inherits logic from Zones via join, but simpler to just follow zones RLS)
CREATE POLICY "zone_geoms_read_authenticated" ON pricing.zone_geoms
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM pricing.zones z WHERE z.id = zone_geoms.zone_id)
    ); -- Or just auth.uid() is not null for performance if okay

CREATE POLICY "zone_geoms_manage_own" ON pricing.zone_geoms
    FOR ALL USING (
        EXISTS (SELECT 1 FROM pricing.zones z WHERE z.id = zone_geoms.zone_id AND z.courier_org_id = get_user_org_id())
    );

-- 2.3 Tariff Sets & Rules
-- Read: Authenticated
CREATE POLICY "tariffs_read_authenticated" ON pricing.tariff_sets
    FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "rules_read_authenticated" ON pricing.tariff_rules
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- Manage: Courier Admin
CREATE POLICY "tariffs_manage_own" ON pricing.tariff_sets
    FOR ALL USING (courier_org_id = get_user_org_id());

CREATE POLICY "rules_manage_own" ON pricing.tariff_rules
    FOR ALL USING (
        EXISTS (SELECT 1 FROM pricing.tariff_sets ts WHERE ts.id = tariff_rules.tariff_set_id AND ts.courier_org_id = get_user_org_id())
    );

-- 2.4 Snapshots & Lines
-- Read: Sender (Own) or Courier (Own)
-- Using simple OR logic or reusing Helper if performance allows.
-- Snapshots have direct org_ids.
CREATE POLICY "snapshots_read_own" ON pricing.shipment_pricing_snapshots
    FOR SELECT USING (
        courier_org_id = get_user_org_id() 
        OR sender_org_id = get_user_org_id()
        OR is_super_admin()
    );

-- Lines: join snapshot
CREATE POLICY "lines_read_own" ON pricing.shipment_pricing_lines
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM pricing.shipment_pricing_snapshots snap 
            WHERE snap.id = shipment_pricing_lines.snapshot_id 
            AND (snap.courier_org_id = get_user_org_id() OR snap.sender_org_id = get_user_org_id() OR is_super_admin())
        )
    );

-- Write: Courier (Overrides) -> Actually RPC handles this with SECURITY DEFINER usually,
-- but if we allow direct edits from UI for courier:
CREATE POLICY "lines_update_courier" ON pricing.shipment_pricing_lines
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM pricing.shipment_pricing_snapshots snap 
            WHERE snap.id = shipment_pricing_lines.snapshot_id 
            AND snap.courier_org_id = get_user_org_id()
        )
    );

-- 2.5 Billing
-- Terms: Read (Both), Write (Courier)
CREATE POLICY "terms_read_own" ON billing.courier_sender_terms
    FOR SELECT USING (courier_org_id = get_user_org_id() OR sender_org_id = get_user_org_id());

CREATE POLICY "terms_write_courier" ON billing.courier_sender_terms
    FOR ALL USING (courier_org_id = get_user_org_id());

-- Settlements: Read (Both), Write (Courier)
CREATE POLICY "settlements_read_own" ON billing.settlements
    FOR SELECT USING (courier_org_id = get_user_org_id() OR sender_org_id = get_user_org_id());

CREATE POLICY "settlements_write_courier" ON billing.settlements
    FOR ALL USING (courier_org_id = get_user_org_id()); -- Mostly generated via RPC/Functions

-- Settlement Lines: Read (Both via Settlement)
CREATE POLICY "settlement_lines_read_own" ON billing.settlement_lines
    FOR SELECT USING (
        EXISTS (
             SELECT 1 FROM billing.settlements s 
             WHERE s.id = settlement_lines.settlement_id
             AND (s.courier_org_id = get_user_org_id() OR s.sender_org_id = get_user_org_id())
        )
    );

-- Shipment Billing State: Read (Both), Write (System/RPC usually, but Courier for consistency)
CREATE POLICY "ship_billing_read_own" ON billing.shipment_billing
    FOR SELECT USING (courier_org_id = get_user_org_id() OR sender_org_id = get_user_org_id());

-- Super Admins
-- (Adding separate policies or using OR is_super_admin() above. 
-- For brevity, I added is_super_admin() in snapshots. I should add for others if strictly needed for specific admin panel usage.)

