-- Migration: 021_pricing_operational.sql
-- Description: Operational tables for Pricing Snapshots, Billing Status, and altered Shipments table

-- 4. OPERATIONAL TABLES

-- 4.1 Shipment Pricing Snapshots (History)
-- Guardamos versiones de cálculo.
CREATE TABLE pricing.shipment_pricing_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
    courier_org_id UUID NOT NULL REFERENCES public.organizations(id),
    sender_org_id UUID NOT NULL REFERENCES public.organizations(id),
    
    tariff_set_id UUID NULL REFERENCES pricing.tariff_sets(id), -- Nullable if fallback
    service_type public.service_type_code NOT NULL,
    zone_id UUID NULL REFERENCES pricing.zones(id),
    
    regen_mode pricing.regen_mode NOT NULL,
    is_overridden BOOLEAN NOT NULL DEFAULT false,
    
    -- Totales del snapshot
    service_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    reimbursable_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_to_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    -- Status del cálculo
    pricing_incomplete BOOLEAN NOT NULL DEFAULT false,
    missing_pricing_reasons TEXT[] DEFAULT '{}',
    
    -- Metadata
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    calculated_by UUID NULL REFERENCES auth.users(id),
    pricing_version INT NOT NULL DEFAULT 1,
    
    -- Constraint: shipment_id + pricing_version unique
    UNIQUE(shipment_id, pricing_version)
);

-- 4.2 Shipment Pricing Lines (Detalle de cada snapshot)
CREATE TABLE pricing.shipment_pricing_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    snapshot_id UUID NOT NULL REFERENCES pricing.shipment_pricing_snapshots(id) ON DELETE CASCADE,
    
    line_type TEXT NOT NULL CHECK (line_type IN (
        'ZONE_STOP_FEE', 
        'PACKAGE_FEE', 
        'BASE_FEE', 
        'VEHICLE_RATE', 
        'PEON_RATE', 
        'REIMBURSABLE', 
        'EXTRA', 
        'DISCOUNT'
    )),
    
    package_id UUID NULL, -- Reference to shipment_packages if applicable (cannot FK easily if package deleted, but generally safe)
    description TEXT NOT NULL,
    
    quantity NUMERIC(12,3) NOT NULL DEFAULT 1,
    unit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    line_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    is_manual BOOLEAN NOT NULL DEFAULT false,
    source_rule_id UUID NULL REFERENCES pricing.tariff_rules(id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3 Billing State per Shipment
-- Mantiene el estado de facturación actual de un envío
CREATE TABLE billing.shipment_billing (
    shipment_id UUID PRIMARY KEY REFERENCES public.shipments(id) ON DELETE CASCADE,
    courier_org_id UUID NOT NULL REFERENCES public.organizations(id),
    sender_org_id UUID NOT NULL REFERENCES public.organizations(id),
    
    billing_state billing.billing_state NOT NULL DEFAULT 'PENDING',
    settlement_id UUID NULL REFERENCES billing.settlements(id) ON DELETE SET NULL,
    
    invoiced_at TIMESTAMPTZ NULL,
    paid_at TIMESTAMPTZ NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.4 Settlement Lines (Detalle de una liquidación)
-- Congela los valores en el momento de la liquidación
CREATE TABLE billing.settlement_lines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    settlement_id UUID NOT NULL REFERENCES billing.settlements(id) ON DELETE CASCADE,
    shipment_id UUID NOT NULL REFERENCES public.shipments(id),
    snapshot_id UUID NOT NULL REFERENCES pricing.shipment_pricing_snapshots(id),
    
    service_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    reimbursable_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_to_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(settlement_id, shipment_id) -- Un envío solo puede estar una vez en una liquidación
);


-- 5. ALTER SHIPMENTS (Denormalization & Caching)

DO $$ 
BEGIN
    -- Add columns if they don't exist
    
    -- Zone ID (FK to Pricing Zones)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shipments' AND column_name='zone_id') THEN
        ALTER TABLE public.shipments ADD COLUMN zone_id UUID NULL REFERENCES pricing.zones(id);
    END IF;

    -- Pricing Cache Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shipments' AND column_name='zone_stop_fee_amount') THEN
        ALTER TABLE public.shipments 
            ADD COLUMN zone_stop_fee_amount NUMERIC(12,2) NULL,
            ADD COLUMN service_subtotal NUMERIC(12,2) NULL,
            ADD COLUMN reimbursable_subtotal NUMERIC(12,2) NULL,
            ADD COLUMN total_to_charge NUMERIC(12,2) NULL;
    END IF;
    
    -- Pricing State Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='shipments' AND column_name='pricing_snapshot_id') THEN
        ALTER TABLE public.shipments 
            ADD COLUMN pricing_snapshot_id UUID NULL REFERENCES pricing.shipment_pricing_snapshots(id),
            ADD COLUMN pricing_locked BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN pricing_incomplete BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN missing_pricing_reasons TEXT[] DEFAULT '{}';
    END IF;

END $$;

-- 6. INDEXES
CREATE INDEX idx_snapshots_shipment ON pricing.shipment_pricing_snapshots(shipment_id);
CREATE INDEX idx_lines_snapshot ON pricing.shipment_pricing_lines(snapshot_id);
CREATE INDEX idx_shipment_billing_state ON billing.shipment_billing(billing_state);
CREATE INDEX idx_shipment_billing_settlement ON billing.shipment_billing(settlement_id);
CREATE INDEX idx_settlement_lines_link ON billing.settlement_lines(settlement_id, shipment_id);
