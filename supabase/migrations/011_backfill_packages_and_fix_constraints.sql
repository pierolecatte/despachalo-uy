-- Migration 011: Backfill Packages & Fix QR Constraints
-- Objetivo: Asegurar que todo shipment tenga al menos 1 package con QR único.

-- 1. Asegurar extensión pgcrypto para gen_random_bytes
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. BACKFILL IDEMPOTENTE
-- Insertar packages faltantes para shipments que no tienen ninguno o tienen menos de lo que dice package_count
-- Estrategia:
-- a) Identificar shipments con packages faltantes
-- b) Insertar packages usando generate_series para cubrir la diferencia
-- c) Usar package_size del shipment como default

DO $$
DECLARE
    r RECORD;
    current_count INT;
    target_count INT;
    missing_count INT;
BEGIN
    FOR r IN 
        SELECT id, package_count, package_size, weight_kg, shipping_cost, description
        FROM shipments
    LOOP
        -- Cuántos paquetes tiene hoy
        SELECT COUNT(*) INTO current_count FROM shipment_packages WHERE shipment_id = r.id;
        
        -- Cuántos debería tener (mínimo 1, o lo que diga package_count)
        target_count := GREATEST(1, COALESCE(r.package_count, 1));
        
        IF current_count < target_count THEN
            missing_count := target_count - current_count;
            
            -- Insertar los faltantes
            -- Index empieza en current_count + 1
            INSERT INTO shipment_packages (
                shipment_id, 
                index, 
                size, 
                weight_kg, 
                shipping_cost, 
                content_description
            )
            SELECT 
                r.id,
                current_count + s.i,
                COALESCE(r.package_size, 'mediano'),
                CASE WHEN current_count = 0 THEN r.weight_kg ELSE NULL END, -- Solo heredar peso al 1ro si no había ninguno
                CASE WHEN current_count = 0 THEN r.shipping_cost ELSE NULL END,
                CASE WHEN current_count = 0 THEN r.description ELSE NULL END
            FROM generate_series(1, missing_count) AS s(i);
            
            RAISE NOTICE 'Backfilled % packages for shipment %', missing_count, r.id;
        END IF;
    END LOOP;
END $$;

-- 3. CONSTRAINTS & INDEXES
-- Asegurar qr_token NOT NULL
ALTER TABLE shipment_packages 
    ALTER COLUMN qr_token SET NOT NULL;

-- Asegurar qr_token UNIQUE
-- (Primero verificamos si existen duplicados, aunque el backfill usa generados aleatorios)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'shipment_packages_qr_token_key'
    ) THEN
        -- Crear índice único si no existe constraint
        CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_packages_qr_token_unique ON shipment_packages(qr_token);
        -- O agregar constraint formal
        ALTER TABLE shipment_packages ADD CONSTRAINT shipment_packages_qr_token_key UNIQUE USING INDEX idx_shipment_packages_qr_token_unique;
    END IF;
END $$;

-- Asegurar UNIQUE(shipment_id, index)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'shipment_packages_shipment_id_index_key'
    ) THEN
         CREATE UNIQUE INDEX IF NOT EXISTS idx_shipment_packages_id_index_unique ON shipment_packages(shipment_id, index);
         ALTER TABLE shipment_packages ADD CONSTRAINT shipment_packages_shipment_id_index_key UNIQUE USING INDEX idx_shipment_packages_id_index_unique;
    END IF;
END $$;
