-- Migration: 029_assign_zone_wrapper.sql
-- Description: Public wrapper for Zone Assignment to avoid direct table updates from client/server actions

CREATE OR REPLACE FUNCTION public.assign_zone(
    p_shipment_id UUID,
    p_zone_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing
AS $$
DECLARE
    v_locked BOOLEAN;
BEGIN
    -- Check lock
    SELECT pricing_locked INTO v_locked FROM shipments WHERE id = p_shipment_id;
    
    IF v_locked THEN
        RAISE EXCEPTION 'Shipment locked. Cannot assign zone.';
    END IF;

    -- Update Zone
    UPDATE public.shipments
    SET zone_id = p_zone_id
    WHERE id = p_shipment_id;
    
    -- NOTE: Reprice is triggered by the caller (server action) separately, 
    -- or we could call it here, but keeping it separate allows more control in the action.
END;
$$;

GRANT EXECUTE ON FUNCTION public.assign_zone(UUID, UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
