-- Migration: 028_public_rpc_wrappers.sql
-- Description: Public wrappers for Pricing RPCs to avoid exposing 'pricing' schema directly to client

-- 1. Wrapper for Reprice Shipment
CREATE OR REPLACE FUNCTION public.reprice_shipment(
    p_shipment_id UUID,
    p_regen_mode TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing
AS $$
BEGIN
    RETURN pricing.reprice_shipment(p_shipment_id, p_regen_mode::pricing.regen_mode);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reprice_shipment(UUID, TEXT) TO authenticated, service_role;

-- 2. Wrapper for Update Manual Line
CREATE OR REPLACE FUNCTION public.update_pricing_line_manual(
    p_line_id UUID,
    p_amount NUMERIC,
    p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing
AS $$
BEGIN
    PERFORM pricing.update_pricing_line_manual(p_line_id, p_amount, p_description);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_pricing_line_manual(UUID, NUMERIC, TEXT) TO authenticated, service_role;

-- 3. Wrapper for Add Manual Line
CREATE OR REPLACE FUNCTION public.add_manual_line(
    p_shipment_id UUID,
    p_line_type TEXT,
    p_amount NUMERIC,
    p_description TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pricing
AS $$
BEGIN
    PERFORM pricing.add_manual_line(p_shipment_id, p_line_type, p_amount, p_description);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_manual_line(UUID, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

-- 4. Wrapper for Generate Settlement
CREATE OR REPLACE FUNCTION public.generate_settlement(
    p_courier_org_id UUID,
    p_sender_org_id UUID,
    p_period_start DATE,
    p_period_end DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, billing
AS $$
BEGIN
    RETURN billing.generate_settlement(p_courier_org_id, p_sender_org_id, p_period_start, p_period_end);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_settlement(UUID, UUID, DATE, DATE) TO authenticated, service_role;

-- Force schema cache reload
NOTIFY pgrst, 'reload schema';
