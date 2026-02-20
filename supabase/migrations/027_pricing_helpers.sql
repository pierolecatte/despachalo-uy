-- Migration: 027_pricing_helpers.sql
-- Description: RPCs for manual pricing overrides and adding lines

-- 1. Update Manual Line
DROP FUNCTION IF EXISTS pricing.update_pricing_line_manual(UUID, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION pricing.update_pricing_line_manual(
    p_line_id UUID,
    p_amount NUMERIC,
    p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing
AS $$
DECLARE
    v_snapshot_id UUID;
    v_locked BOOLEAN;
BEGIN
    -- Get snapshot and check lock
    SELECT snapshot_id INTO v_snapshot_id FROM pricing.shipment_pricing_lines WHERE id = p_line_id;
    
    SELECT s.pricing_locked INTO v_locked
    FROM shipments s
    JOIN pricing.shipment_pricing_snapshots sn ON sn.shipment_id = s.id
    WHERE sn.id = v_snapshot_id;

    IF v_locked AND NOT is_super_admin() THEN
        RAISE EXCEPTION 'Shipment is locked. Cannot edit lines.';
    END IF;

    UPDATE pricing.shipment_pricing_lines
    SET unit_amount = p_amount,
        line_amount = p_amount * quantity, -- Assumption: override sets unit amount
        is_manual = true,
        description = COALESCE(p_description, description)
    WHERE id = p_line_id;
END;
$$;

-- 2. Add Manual Line (e.g. Reimbursable)
DROP FUNCTION IF EXISTS pricing.add_manual_line(UUID, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION pricing.add_manual_line(
    p_shipment_id UUID,
    p_line_type TEXT, -- Changed from pricing.line_type to TEXT as it's a check constraint
    p_amount NUMERIC,
    p_description TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing
AS $$
DECLARE
    v_snapshot_id UUID;
    v_locked BOOLEAN;
BEGIN
    -- Get current snapshot
    SELECT pricing_snapshot_id, pricing_locked INTO v_snapshot_id, v_locked
    FROM shipments WHERE id = p_shipment_id;

    IF v_snapshot_id IS NULL THEN
        RAISE EXCEPTION 'No pricing snapshot exists. Run reprice first.';
    END IF;

    IF v_locked AND NOT is_super_admin() THEN
        RAISE EXCEPTION 'Shipment is locked.';
    END IF;

    INSERT INTO pricing.shipment_pricing_lines (
        snapshot_id, line_type, description, quantity, unit_amount, line_amount, is_manual
    ) VALUES (
        v_snapshot_id, p_line_type, p_description, 1, p_amount, p_amount, true
    );
END;
$$;

-- 3. Public View for Pricing Lines (to allow client fetching)
CREATE OR REPLACE VIEW public.shipment_pricing_lines_view AS
SELECT * FROM pricing.shipment_pricing_lines;

-- Grant access (if needed, usually public has access to public views)
GRANT SELECT ON public.shipment_pricing_lines_view TO authenticated, anon;
