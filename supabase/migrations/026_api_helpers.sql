-- Migration: 026_api_helpers.sql
-- Description: Helper RPCs for Server Actions (Edit/Add Lines safely)

-- 1. Update Pricing Line Manual
CREATE OR REPLACE FUNCTION pricing.update_pricing_line_manual(
    p_line_id UUID,
    p_amount NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_snapshot_id UUID;
    v_locked BOOLEAN;
BEGIN
    SELECT snapshot_id INTO v_snapshot_id FROM pricing.shipment_pricing_lines WHERE id = p_line_id;
    
    -- Check lock on shipment
    SELECT pricing_locked INTO v_locked
    FROM shipments s
    JOIN pricing.shipment_pricing_snapshots snap ON snap.shipment_id = s.id
    WHERE snap.id = v_snapshot_id;
    
    IF v_locked THEN
        RAISE EXCEPTION 'Shipment locked. Cannot edit line.';
    END IF;

    -- Update
    UPDATE pricing.shipment_pricing_lines
    SET unit_amount = p_amount,
        line_amount = p_amount * quantity, -- Assume qty doesn't change for now
        is_manual = true
    WHERE id = p_line_id;
    
    RETURN FOUND;
END;
$$;

-- 2. Add Manual Line (e.g. Reimbursable)
CREATE OR REPLACE FUNCTION pricing.add_manual_line(
    p_shipment_id UUID,
    p_line_type TEXT,
    p_amount NUMERIC,
    p_description TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_snapshot_id UUID;
    v_line_id UUID;
    v_locked BOOLEAN;
BEGIN
    -- Get latest snapshot
    SELECT pricing_snapshot_id, pricing_locked INTO v_snapshot_id, v_locked
    FROM shipments WHERE id = p_shipment_id;
    
    IF v_snapshot_id IS NULL THEN
        RAISE EXCEPTION 'No pricing snapshot exists. Please quote first.';
    END IF;
    
    IF v_locked THEN
         RAISE EXCEPTION 'Shipment locked.';
    END IF;

    -- Insert Line
    INSERT INTO pricing.shipment_pricing_lines (
        snapshot_id, line_type, description, quantity, unit_amount, line_amount, is_manual
    ) VALUES (
        v_snapshot_id, p_line_type, p_description, 1, p_amount, p_amount, true
    ) RETURNING id INTO v_line_id;
    
    RETURN v_line_id;
END;
$$;
