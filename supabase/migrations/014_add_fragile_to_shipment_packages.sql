
-- 1. Add column
ALTER TABLE public.shipment_packages 
ADD COLUMN IF NOT EXISTS fragile boolean NOT NULL DEFAULT false;

-- 2. Update RPC to handle fragile
CREATE OR REPLACE FUNCTION create_shipment_with_packages(
    p_shipment_data JSONB,
    p_packages_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shipment_id UUID;
    v_tracking_code TEXT;
    v_pkg JSONB;
    v_result JSONB;
    v_package_count INT;
BEGIN
    -- 1. Insert Shipment
    INSERT INTO shipments (
        tracking_code,
        remitente_org_id,
        cadeteria_org_id,
        agencia_org_id,
        service_type_id,
        status,
        recipient_name,
        recipient_phone,
        recipient_email,
        recipient_address,
        department_id,
        locality_id,
        locality_manual,
        recipient_department,
        recipient_city,
        delivery_type,
        package_size,
        package_count,
        weight_kg,
        description,
        notes,
        shipping_cost,
        is_freight_paid,
        freight_amount,
        recipient_observations,
        recipient_lat,
        recipient_lng
    ) VALUES (
        p_shipment_data->>'tracking_code',
        (p_shipment_data->>'remitente_org_id')::UUID,
        (p_shipment_data->>'cadeteria_org_id')::UUID,
        (p_shipment_data->>'agencia_org_id')::UUID,
        (p_shipment_data->>'service_type_id')::UUID,
        COALESCE(p_shipment_data->>'status', 'pendiente')::shipment_status,
        p_shipment_data->>'recipient_name',
        p_shipment_data->>'recipient_phone',
        p_shipment_data->>'recipient_email',
        p_shipment_data->>'recipient_address',
        (p_shipment_data->>'department_id')::INT,
        (p_shipment_data->>'locality_id')::INT,
        p_shipment_data->>'locality_manual',
        p_shipment_data->>'recipient_department',
        p_shipment_data->>'recipient_city',
        COALESCE((p_shipment_data->>'delivery_type')::delivery_type, 'domicilio'),
        (p_shipment_data->>'package_size')::package_size,
        COALESCE((p_shipment_data->>'package_count')::INT, 1),
        (p_shipment_data->>'weight_kg')::DECIMAL,
        p_shipment_data->>'description',
        p_shipment_data->>'notes',
        (p_shipment_data->>'shipping_cost')::DECIMAL,
        COALESCE((p_shipment_data->>'is_freight_paid')::BOOLEAN, false),
        (p_shipment_data->>'freight_amount')::DECIMAL,
        p_shipment_data->>'recipient_observations',
        (p_shipment_data->>'recipient_lat')::FLOAT,
        (p_shipment_data->>'recipient_lng')::FLOAT
    )
    RETURNING id, tracking_code INTO v_shipment_id, v_tracking_code;

    -- 2. Insert Packages
    IF jsonb_array_length(p_packages_data) > 0 THEN
        FOR v_pkg IN SELECT * FROM jsonb_array_elements(p_packages_data)
        LOOP
            INSERT INTO shipment_packages (
                shipment_id,
                index,
                size,
                weight_kg,
                shipping_cost,
                content_description,
                fragile
            ) VALUES (
                v_shipment_id,
                (v_pkg->>'index')::INT,
                (v_pkg->>'size')::package_size,
                (v_pkg->>'weight_kg')::DECIMAL,
                (v_pkg->>'shipping_cost')::DECIMAL,
                v_pkg->>'content_description',
                COALESCE((v_pkg->>'fragile')::BOOLEAN, false)
            );
        END LOOP;
    ELSE
        -- Fallback safety
        INSERT INTO shipment_packages (shipment_id, index, size, fragile)
        VALUES (v_shipment_id, 1, (p_shipment_data->>'package_size')::package_size, false);
    END IF;

    -- 3. Return result
    SELECT jsonb_build_object(
        'id', v_shipment_id,
        'tracking_code', v_tracking_code
    ) INTO v_result;

    RETURN v_result;
END;
$$;
