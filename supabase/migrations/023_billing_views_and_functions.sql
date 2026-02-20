-- Migration: 023_billing_views_and_functions.sql
-- Description: Billing Views and Settlement Functions

-- 1. VIEWS FOR REPORTING

-- 1.1 Pending Charge (Completed shipments ready to be billed)
CREATE OR REPLACE VIEW billing.v_shipments_pending_charge AS
SELECT 
    s.id AS shipment_id,
    s.tracking_code,
    s.remitente_org_id,
    s.cadeteria_org_id,
    s.delivered_at,
    s.service_type_id, -- Join with service_types for code/name
    st.name AS service_name,
    s.pricing_snapshot_id,
    snap.total_to_charge,
    snap.service_subtotal,
    snap.reimbursable_subtotal,
    sb.billing_state
FROM public.shipments s
JOIN billing.shipment_billing sb ON sb.shipment_id = s.id
LEFT JOIN pricing.shipment_pricing_snapshots snap ON snap.id = s.pricing_snapshot_id
LEFT JOIN public.service_types st ON st.id = s.service_type_id
WHERE s.status = 'entregado'
  AND s.delivered_at IS NOT NULL
  AND s.pricing_incomplete = false
  AND s.pricing_snapshot_id IS NOT NULL
  AND sb.billing_state = 'PENDING';

-- 1.2 Invoiced Shipments
CREATE OR REPLACE VIEW billing.v_shipments_invoiced AS
SELECT 
    s.id AS shipment_id,
    s.tracking_code,
    s.remitente_org_id,
    s.cadeteria_org_id,
    sb.settlement_id,
    sett.period_start,
    sett.period_end,
    sb.invoiced_at,
    snap.total_to_charge
FROM public.shipments s
JOIN billing.shipment_billing sb ON sb.shipment_id = s.id
JOIN billing.settlements sett ON sett.id = sb.settlement_id
LEFT JOIN pricing.shipment_pricing_snapshots snap ON snap.id = s.pricing_snapshot_id
WHERE sb.billing_state = 'INVOICED';

-- 2. SETTLEMENT FUNCTIONS

-- 2.1 Generate Settlement
CREATE OR REPLACE FUNCTION billing.generate_settlement(
    p_courier_org_id UUID,
    p_sender_org_id UUID,
    p_period_start DATE,
    p_period_end DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_settlement_id UUID;
    v_lock_key BIGINT;
    v_count INT;
    v_total_service NUMERIC := 0;
    v_total_reimbursable NUMERIC := 0;
    v_total_charge NUMERIC := 0;
BEGIN
    -- 1. Advisory Lock to prevent double submission for same period/client
    -- Hash the composite key to get a simpler int for locking
    v_lock_key := hashtext(p_courier_org_id::text || p_sender_org_id::text || p_period_start::text || p_period_end::text);
    PERFORM pg_advisory_xact_lock(v_lock_key);

    -- 2. Check if settlement already exists
    SELECT id INTO v_settlement_id FROM billing.settlements
    WHERE courier_org_id = p_courier_org_id 
      AND sender_org_id = p_sender_org_id
      AND period_start = p_period_start
      AND period_end = p_period_end;
      
    IF v_settlement_id IS NOT NULL THEN
        RAISE EXCEPTION 'Settlement already exists for this period';
    END IF;

    -- 3. Create Settlement Header
    INSERT INTO billing.settlements (
        courier_org_id, sender_org_id, period_start, period_end, status
    ) VALUES (
        p_courier_org_id, p_sender_org_id, p_period_start, p_period_end, 'DRAFT'
    ) RETURNING id INTO v_settlement_id;

    -- 4. Find Eligible Shipments and Create Lines
    -- Eligible: Delivered in period, PENDING, Pricing Completo
    -- We assume delivered_at determines the period.
    
    WITH eligible_shipments AS (
        SELECT 
            s.id AS shipment_id,
            s.pricing_snapshot_id,
            snap.service_subtotal,
            snap.reimbursable_subtotal,
            snap.total_to_charge
        FROM public.shipments s
        JOIN billing.shipment_billing sb ON sb.shipment_id = s.id
        JOIN pricing.shipment_pricing_snapshots snap ON snap.id = s.pricing_snapshot_id
        WHERE s.remitente_org_id = p_sender_org_id
          AND s.cadeteria_org_id = p_courier_org_id
          AND s.status = 'entregado'
          AND s.delivered_at::date BETWEEN p_period_start AND p_period_end
          AND s.pricing_incomplete = false
          AND sb.billing_state = 'PENDING'
          AND s.pricing_snapshot_id IS NOT NULL
    ),
    inserted_lines AS (
        INSERT INTO billing.settlement_lines (
            settlement_id, shipment_id, snapshot_id, service_subtotal, reimbursable_subtotal, total_to_charge
        )
        SELECT 
            v_settlement_id, shipment_id, pricing_snapshot_id, service_subtotal, reimbursable_subtotal, total_to_charge
        FROM eligible_shipments
        RETURNING service_subtotal, reimbursable_subtotal, total_to_charge, shipment_id
    )
    SELECT 
        count(*),
        COALESCE(sum(service_subtotal), 0),
        COALESCE(sum(reimbursable_subtotal), 0),
        COALESCE(sum(total_to_charge), 0)
    INTO v_count, v_total_service, v_total_reimbursable, v_total_charge
    FROM inserted_lines;

    -- 5. Update Shipments & Billing State
    IF v_count > 0 THEN
        -- Update Billing State to INVOICED
        UPDATE billing.shipment_billing
        SET billing_state = 'INVOICED',
            settlement_id = v_settlement_id,
            invoiced_at = NOW()
        WHERE shipment_id IN (SELECT shipment_id FROM billing.settlement_lines WHERE settlement_id = v_settlement_id);

        -- Lock Pricing
        UPDATE public.shipments
        SET pricing_locked = true
        WHERE id IN (SELECT shipment_id FROM billing.settlement_lines WHERE settlement_id = v_settlement_id);

        -- Update Settlement Totals and Status
        UPDATE billing.settlements
        SET service_subtotal = v_total_service,
            reimbursable_subtotal = v_total_reimbursable,
            total_to_charge = v_total_charge,
            issued_at = NOW(),
            status = 'ISSUED'
        WHERE id = v_settlement_id;
    ELSE
        -- No shipments? Delete skeleton settlement
        DELETE FROM billing.settlements WHERE id = v_settlement_id;
        RETURN NULL;
    END IF;

    RETURN v_settlement_id;
END;
$$;


-- 2.2 Mark Settlement Paid
CREATE OR REPLACE FUNCTION billing.mark_settlement_paid(
    p_settlement_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Update Settlement
    UPDATE billing.settlements
    SET status = 'PAID',
        paid_at = NOW()
    WHERE id = p_settlement_id
      AND status = 'ISSUED'; -- Only ISSUED can be PAID

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Update Shipments Billing State
    UPDATE billing.shipment_billing
    SET billing_state = 'PAID',
        paid_at = NOW()
    WHERE settlement_id = p_settlement_id;

    -- Logic for shipments table update if needed (pricing_locked is already true)
    
    RETURN TRUE;
END;
$$;
