-- Migration: 032_pricing_explicit_fks.sql
-- Description: Enforce explicit foreign key names for PostgREST disambiguation

-- Ensure constraints have predictable names for PostgREST embedding
ALTER TABLE pricing.tariff_sets DROP CONSTRAINT IF EXISTS tariff_sets_courier_org_id_fkey;
ALTER TABLE pricing.tariff_sets ADD CONSTRAINT tariff_sets_courier_org_id_fkey 
    FOREIGN KEY (courier_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE pricing.tariff_sets DROP CONSTRAINT IF EXISTS tariff_sets_sender_org_id_fkey;
ALTER TABLE pricing.tariff_sets ADD CONSTRAINT tariff_sets_sender_org_id_fkey 
    FOREIGN KEY (sender_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Same for zones if they have multiple references
ALTER TABLE pricing.zones DROP CONSTRAINT IF EXISTS zones_courier_org_id_fkey;
ALTER TABLE pricing.zones ADD CONSTRAINT zones_courier_org_id_fkey 
    FOREIGN KEY (courier_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE pricing.zones DROP CONSTRAINT IF EXISTS zones_sender_org_id_fkey;
ALTER TABLE pricing.zones ADD CONSTRAINT zones_sender_org_id_fkey 
    FOREIGN KEY (sender_org_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Reload schema caches to pick up explicit relation names
NOTIFY pgrst, 'reload schema';
