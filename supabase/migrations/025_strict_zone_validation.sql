-- Migration: 025_strict_zone_validation.sql
-- Description: Trigger to validate Zone assignment constraints on Shipments

CREATE OR REPLACE FUNCTION pricing.validate_shipment_zone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_zone RECORD;
BEGIN
    -- Only validate if zone_id is present
    IF NEW.zone_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Fetch Zone details
    SELECT * INTO v_zone
    FROM pricing.zones
    WHERE id = NEW.zone_id;

    IF v_zone.id IS NULL THEN
        RAISE EXCEPTION 'Referenced zone not found' USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- 1. Validate Courier Match
    -- The zone must belong to the same courier as the shipment
    IF v_zone.courier_org_id != NEW.cadeteria_org_id THEN
         RAISE EXCEPTION 'Zone belongs to proper courier organization' USING ERRCODE = 'check_violation';
    END IF;

    -- 2. Validate Sender Match (if zone is specific)
    -- If zone.sender_org_id is NOT NULL, it must match shipment.remitente_org_id
    IF v_zone.sender_org_id IS NOT NULL AND v_zone.sender_org_id != NEW.remitente_org_id THEN
         RAISE EXCEPTION 'Zone is restricted to a different sender' USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_strict_zone ON public.shipments;

CREATE TRIGGER trg_validate_strict_zone
    BEFORE INSERT OR UPDATE OF zone_id, cadeteria_org_id, remitente_org_id
    ON public.shipments
    FOR EACH ROW
    EXECUTE FUNCTION pricing.validate_shipment_zone();
