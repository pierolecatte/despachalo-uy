-- Seed service types (Safe Version)
-- Uses EXISTS check instead of ON CONFLICT to avoid constraint errors

DO $$
DECLARE
    admin_org_id uuid;
BEGIN
    -- Get admin org id
    SELECT id INTO admin_org_id FROM organizations WHERE type = 'admin' LIMIT 1;

    -- Express 24hs
    IF NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'express_24h') THEN
        INSERT INTO service_types (code, name, description, pricing_mode, active, org_id)
        VALUES ('express_24h', 'Express 24hs', 'Entrega garantizada en 24 horas', 'fijo', true, admin_org_id);
    END IF;

    -- Común 48hs
    IF NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'comun_48h') THEN
        INSERT INTO service_types (code, name, description, pricing_mode, active, org_id)
        VALUES ('comun_48h', 'Común 48hs', 'Entrega estándar en 48 horas', 'fijo', true, admin_org_id);
    END IF;

    -- Despacho Agencia
    IF NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'despacho_agencia') THEN
        INSERT INTO service_types (code, name, description, pricing_mode, active, org_id)
        VALUES ('despacho_agencia', 'Despacho Agencia', 'Envío a través de agencia de transporte', 'fijo', true, admin_org_id);
    END IF;

    -- Por kilómetro
    IF NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'por_km') THEN
        INSERT INTO service_types (code, name, description, pricing_mode, active, org_id)
        VALUES ('por_km', 'Por kilómetro', 'Tarifa basada en distancia', 'por_km', true, admin_org_id);
    END IF;

    -- Por horas
    IF NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'por_horas') THEN
        INSERT INTO service_types (code, name, description, pricing_mode, active, org_id)
        VALUES ('por_horas', 'Por horas', 'Tarifa basada en tiempo', 'por_hora', true, admin_org_id);
    END IF;

    -- Especial
    IF NOT EXISTS (SELECT 1 FROM service_types WHERE code = 'especial') THEN
        INSERT INTO service_types (code, name, description, pricing_mode, active, org_id)
        VALUES ('especial', 'Especial', 'Servicio personalizado', 'custom', true, admin_org_id);
    END IF;
END $$;
