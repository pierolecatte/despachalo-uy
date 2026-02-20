-- =====================================================
-- Migration 003: Shipment Packages (multi-paquete)
-- Cada envío puede tener N paquetes, cada uno con su
-- propio tamaño, peso, costo y QR token único.
-- =====================================================

-- 1. EXTENSIÓN para gen_random_bytes (si no existe)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. TABLA shipment_packages
CREATE TABLE shipment_packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    index INTEGER NOT NULL,
    size package_size NOT NULL DEFAULT 'mediano',
    weight_kg DECIMAL,
    shipping_cost DECIMAL,
    content_description TEXT,
    qr_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shipment_id, index)
);

-- 3. ÍNDICES
CREATE INDEX idx_shipment_packages_shipment ON shipment_packages(shipment_id);
CREATE INDEX idx_shipment_packages_qr ON shipment_packages(qr_token);

-- 4. RLS
ALTER TABLE shipment_packages ENABLE ROW LEVEL SECURITY;

-- Super admin: acceso total
CREATE POLICY "packages_super_admin_all" ON shipment_packages
    FOR ALL USING (is_super_admin());

-- Lectura: si el shipment pertenece a tu org
CREATE POLICY "packages_read_own" ON shipment_packages
    FOR SELECT USING (
        shipment_id IN (
            SELECT id FROM shipments
            WHERE remitente_org_id = get_user_org_id()
            OR cadeteria_org_id = get_user_org_id()
            OR agencia_org_id = get_user_org_id()
        )
    );

-- Insert/Update/Delete: si autenticado (para crear/editar envíos)
CREATE POLICY "packages_insert_authenticated" ON shipment_packages
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "packages_update_authenticated" ON shipment_packages
    FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "packages_delete_authenticated" ON shipment_packages
    FOR DELETE USING (auth.uid() IS NOT NULL);

-- 5. BACKFILL: crear 1 paquete por cada envío existente
INSERT INTO shipment_packages (shipment_id, index, size, weight_kg, shipping_cost, content_description)
SELECT
    id,
    1,
    package_size,
    weight_kg,
    shipping_cost,
    description
FROM shipments
WHERE id NOT IN (SELECT DISTINCT shipment_id FROM shipment_packages);
