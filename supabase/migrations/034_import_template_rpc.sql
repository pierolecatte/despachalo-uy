-- Migration: 034_import_template_rpc.sql
-- Description: RPC for importing zone templates to a courier's zones.

CREATE OR REPLACE FUNCTION pricing.import_zone_template(
    p_template_id UUID,
    p_courier_org_id UUID
) RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing
AS $$
DECLARE
    v_count INT := 0;
    v_zone RECORD;
    v_base_name TEXT;
    v_final_name TEXT;
    v_suffix INT;
BEGIN
    -- 1. Validate Permissions
    IF NOT public.is_super_admin() THEN
        IF p_courier_org_id != public.get_user_org_id() THEN
            RAISE EXCEPTION 'No permission to import for this organization';
        END IF;
    END IF;

    -- 2. Verify Template Exists and is Active (or allow if super admin?)
    IF NOT EXISTS (SELECT 1 FROM pricing.zone_templates WHERE id = p_template_id AND is_active = true) THEN
        RAISE EXCEPTION 'Template does not exist or is inactive';
    END IF;

    -- 3. Loop through template zones and insert
    FOR v_zone IN 
        SELECT * FROM pricing.zone_template_zones 
        WHERE template_id = p_template_id AND is_active = true
    LOOP
        v_base_name := v_zone.name;
        v_final_name := v_base_name;
        v_suffix := 1;

        -- Find a unique name
        WHILE EXISTS (
            SELECT 1 FROM pricing.zones 
            WHERE courier_org_id = p_courier_org_id 
              AND sender_org_id IS NULL 
              AND name = v_final_name
        ) LOOP
            v_suffix := v_suffix + 1;
            v_final_name := v_base_name || ' (' || v_suffix::text || ')';
        END LOOP;

        -- Insert Zone
        INSERT INTO pricing.zones (
            courier_org_id,
            sender_org_id,
            name,
            is_active,
            sort_order,
            source_template_id,
            geom
        ) VALUES (
            p_courier_org_id,
            NULL, -- Templates always import as generic zones
            v_final_name,
            true,
            v_zone.priority,
            p_template_id,
            v_zone.geom
        );
        
        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$;
