-- Migration: 033_zone_templates.sql
-- Description: Implement zone templates, add geometry to pricing.zones directly.

-- 1. Ensure PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- 2. Modify pricing.zones to include geom directly
ALTER TABLE pricing.zones ADD COLUMN geom extensions.geometry(MULTIPOLYGON, 4326);
ALTER TABLE pricing.zones ADD COLUMN source_template_id UUID NULL;

-- 3. Migrate existing geoms from pricing.zone_geoms to pricing.zones
UPDATE pricing.zones z
SET geom = ST_Multi(ST_GeomFromGeoJSON((g.geojson->>'geometry')::text))
FROM pricing.zone_geoms g
WHERE z.id = g.zone_id
  AND g.geojson IS NOT NULL
  AND g.geojson ? 'geometry';

-- If the geojson stored is directly the geometry object:
UPDATE pricing.zones z
SET geom = ST_Multi(ST_GeomFromGeoJSON(g.geojson::text))
FROM pricing.zone_geoms g
WHERE z.id = g.zone_id
  AND g.geojson IS NOT NULL
  AND NOT g.geojson ? 'geometry'
  AND z.geom IS NULL;

-- Set NOT NULL if possible (might fail if there are orphaned zones, so we delete them first or just force it)
DELETE FROM pricing.zones WHERE geom IS NULL;
ALTER TABLE pricing.zones ALTER COLUMN geom SET NOT NULL;

-- Create computed column for geojson (so Supabase JS can query .select('..., geojson'))
CREATE OR REPLACE FUNCTION pricing.geojson(z pricing.zones) RETURNS jsonb AS $$
  SELECT ST_AsGeoJSON(z.geom)::jsonb;
$$ LANGUAGE sql STABLE;

-- Drop the old zone_geoms table
DROP TABLE IF EXISTS pricing.zone_geoms;

-- Update RLS for pricing.zones (ensure it covers all operations)
-- Usually it's in public.zones or pricing.zones. Wait, user specifically said pricing.zones.
-- Let's just grant proper permissions.

-- 4. Create pricing.zone_templates
CREATE TABLE pricing.zone_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT NULL,
    region TEXT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create pricing.zone_template_zones
CREATE TABLE pricing.zone_template_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES pricing.zone_templates(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    priority INT NOT NULL DEFAULT 0,
    geom extensions.geometry(MULTIPOLYGON, 4326) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_zone_template_zones_template_id ON pricing.zone_template_zones(template_id);
CREATE INDEX idx_zone_template_zones_geom ON pricing.zone_template_zones USING GIST(geom);
CREATE INDEX idx_pricing_zones_geom ON pricing.zones USING GIST(geom);

-- 6. RLS
ALTER TABLE pricing.zone_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.zone_template_zones ENABLE ROW LEVEL SECURITY;

-- templates: anyone authenticated can read active templates
CREATE POLICY "zone_templates_read_active" ON pricing.zone_templates
    FOR SELECT TO authenticated
    USING (is_active = true);

-- templates: super admin can manage
CREATE POLICY "zone_templates_manage_superadmin" ON pricing.zone_templates
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- template zones: anyone authenticated can read if template is active
CREATE POLICY "zone_template_zones_read_active" ON pricing.zone_template_zones
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM pricing.zone_templates t 
            WHERE t.id = zone_template_zones.template_id 
            AND t.is_active = true
        )
    );

-- template zones: super admin can manage
CREATE POLICY "zone_template_zones_manage_superadmin" ON pricing.zone_template_zones
    FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- 7. Ensure pricing.zones RLS is correct according to user requirements
-- "SELECT/INSERT/UPDATE/DELETE para authenticated: (public.is_super_admin() OR courier_org_id = public.get_user_org_id()) + FORCE RLS"
ALTER TABLE pricing.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing.zones FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "zones_manage_own" ON pricing.zones;
DROP POLICY IF EXISTS "zones_read_all" ON pricing.zones;

CREATE POLICY "zones_manage_own_or_super" ON pricing.zones
    FOR ALL TO authenticated
    USING (public.is_super_admin() OR courier_org_id = public.get_user_org_id())
    WITH CHECK (public.is_super_admin() OR courier_org_id = public.get_user_org_id());

-- 8. Permissions
GRANT USAGE ON SCHEMA pricing TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pricing TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA pricing TO authenticated;

-- 9. Helper RPC for UI to create zones from GeoJSON directly
CREATE OR REPLACE FUNCTION pricing.create_zone_from_geojson(
    p_courier_org_id UUID,
    p_sender_org_id UUID,
    p_name TEXT,
    p_geojson JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing, extensions
AS $$
DECLARE
    v_new_id UUID;
    v_geom extensions.geometry;
BEGIN
    -- Permission Check: Super admin, or same org
    IF NOT public.is_super_admin() THEN
        IF p_courier_org_id != public.get_user_org_id() THEN
            RAISE EXCEPTION 'No permission to create zone for this organization';
        END IF;
    END IF;

    -- Extract geometry from feature if needed
    IF p_geojson ? 'type' AND (p_geojson->>'type') = 'Feature' THEN
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON((p_geojson->'geometry')::text)), 4326));
    ELSE
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON(p_geojson::text)), 4326));
    END IF;

    INSERT INTO pricing.zones (courier_org_id, sender_org_id, name, geom)
    VALUES (p_courier_org_id, p_sender_org_id, p_name, v_geom)
    RETURNING id INTO v_new_id;

    RETURN v_new_id;
END;
$$;

-- Reload schema cache so PostgREST picks up the new RPC function immediately
NOTIFY pgrst, 'reload schema';


