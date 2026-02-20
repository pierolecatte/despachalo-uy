-- Migration: 036_update_zone_rpc
CREATE OR REPLACE FUNCTION pricing.update_zone_from_geojson(
    p_zone_id UUID,
    p_courier_org_id UUID,
    p_sender_org_id UUID,
    p_name TEXT,
    p_is_active BOOLEAN,
    p_geojson JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing, extensions
AS $$
DECLARE
    v_geom extensions.geometry;
BEGIN
    -- Permission Check: Super admin, or same org
    IF NOT public.is_super_admin() THEN
        IF p_courier_org_id != public.get_user_org_id() THEN
            RAISE EXCEPTION 'No permission to update zone for this organization';
        END IF;
    END IF;

    -- Ensure the zone belongs to the courier org
    IF NOT EXISTS (SELECT 1 FROM pricing.zones WHERE id = p_zone_id AND courier_org_id = p_courier_org_id) THEN
        RAISE EXCEPTION 'Zone not found or does not belong to your organization';
    END IF;

    -- Extract geometry from feature if needed
    IF p_geojson ? 'type' AND (p_geojson->>'type') = 'Feature' THEN
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON((p_geojson->'geometry')::text)), 4326));
    ELSE
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON(p_geojson::text)), 4326));
    END IF;

    UPDATE pricing.zones 
    SET sender_org_id = p_sender_org_id, 
        name = p_name, 
        geom = v_geom,
        is_active = p_is_active
    WHERE id = p_zone_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
