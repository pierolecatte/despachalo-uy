-- Migration: 037_zone_auto_crop
-- Implements automatic polygon clipping against existing zones

DROP FUNCTION IF EXISTS pricing.create_zone_from_geojson(UUID, UUID, TEXT, JSONB);
CREATE OR REPLACE FUNCTION pricing.create_zone_from_geojson(
    p_courier_org_id UUID,
    p_sender_org_id UUID,
    p_name TEXT,
    p_geojson JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing, extensions
AS $$
DECLARE
    v_new_id UUID;
    v_geom extensions.geometry;
    v_union extensions.geometry;
BEGIN
    -- Permission Check
    IF NOT public.is_super_admin() THEN
        IF p_courier_org_id != public.get_user_org_id() THEN
            RAISE EXCEPTION 'No permission to create zone for this organization';
        END IF;
    END IF;

    -- Extract geometry
    IF p_geojson ? 'type' AND (p_geojson->>'type') = 'Feature' THEN
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON((p_geojson->'geometry')::text)), 4326));
    ELSE
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON(p_geojson::text)), 4326));
    END IF;

    -- Auto-crop overlapping areas from existing zones for the same group
    SELECT ST_Union(geom) INTO v_union 
    FROM pricing.zones 
    WHERE courier_org_id = p_courier_org_id 
      AND sender_org_id IS NOT DISTINCT FROM p_sender_org_id;

    IF v_union IS NOT NULL THEN
        v_geom := ST_Multi(ST_MakeValid(ST_Difference(v_geom, v_union)));
    END IF;

    IF ST_IsEmpty(v_geom) OR v_geom IS NULL THEN
        RAISE EXCEPTION 'La zona queda vacía o es demasiado pequeña luego de recortar solapamientos.';
    END IF;

    INSERT INTO pricing.zones (courier_org_id, sender_org_id, name, geom)
    VALUES (p_courier_org_id, p_sender_org_id, p_name, v_geom)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object(
        'id', v_new_id,
        'geojson', ST_AsGeoJSON(v_geom)::jsonb
    );
END;
$$;

DROP FUNCTION IF EXISTS pricing.update_zone_from_geojson(UUID, UUID, UUID, TEXT, BOOLEAN, JSONB);
CREATE OR REPLACE FUNCTION pricing.update_zone_from_geojson(
    p_zone_id UUID,
    p_courier_org_id UUID,
    p_sender_org_id UUID,
    p_name TEXT,
    p_is_active BOOLEAN,
    p_geojson JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing, extensions
AS $$
DECLARE
    v_geom extensions.geometry;
    v_union extensions.geometry;
BEGIN
    -- Permission Check
    IF NOT public.is_super_admin() THEN
        IF p_courier_org_id != public.get_user_org_id() THEN
            RAISE EXCEPTION 'No permission to update zone for this organization';
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pricing.zones WHERE id = p_zone_id AND courier_org_id = p_courier_org_id) THEN
        RAISE EXCEPTION 'Zone not found or does not belong to your organization';
    END IF;

    IF p_geojson ? 'type' AND (p_geojson->>'type') = 'Feature' THEN
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON((p_geojson->'geometry')::text)), 4326));
    ELSE
        v_geom := ST_Multi(ST_SetSRID(ST_MakeValid(ST_GeomFromGeoJSON(p_geojson::text)), 4326));
    END IF;

    -- Auto-crop overlapping areas from existing zones for the same group, excluding self
    SELECT ST_Union(geom) INTO v_union 
    FROM pricing.zones 
    WHERE courier_org_id = p_courier_org_id 
      AND sender_org_id IS NOT DISTINCT FROM p_sender_org_id
      AND id != p_zone_id;

    IF v_union IS NOT NULL THEN
        v_geom := ST_Multi(ST_MakeValid(ST_Difference(v_geom, v_union)));
    END IF;

    IF ST_IsEmpty(v_geom) OR v_geom IS NULL THEN
        RAISE EXCEPTION 'La zona queda vacía o es demasiado pequeña luego de recortar solapamientos.';
    END IF;

    UPDATE pricing.zones 
    SET sender_org_id = p_sender_org_id, 
        name = p_name, 
        geom = v_geom,
        is_active = p_is_active
    WHERE id = p_zone_id;

    RETURN jsonb_build_object(
        'id', p_zone_id,
        'geojson', ST_AsGeoJSON(v_geom)::jsonb
    );
END;
$$;

NOTIFY pgrst, 'reload schema';
