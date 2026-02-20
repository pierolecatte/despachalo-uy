-- Migration: 020_pricing_schema_core.sql
-- Description: Schemas pricing/billing, Enums, and Core Tables

-- 1. SCHEMAS
CREATE SCHEMA IF NOT EXISTS pricing;
CREATE SCHEMA IF NOT EXISTS billing;

-- 2. ENUMS (New ones in UPPERCASE as requested, reusing legacy lowercase where noted)

-- pricing.service_type -> uses public.service_type_code (lowercase)
-- pricing.package_size -> uses public.package_size (lowercase) includes 'especial'

CREATE TYPE pricing.regen_mode AS ENUM ('REGENERATE_ALL', 'FILL_MISSING');

CREATE TYPE billing.billing_cycle AS ENUM ('DIARIO', 'SEMANAL', 'MENSUAL');

CREATE TYPE billing.billing_state AS ENUM ('PENDING', 'INVOICED', 'PAID', 'CANCELLED');

CREATE TYPE billing.settlement_status AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- 3. CORE TABLES

-- 3.1 Courier Services Configuration
-- Define qué servicios habilita cada cadetería y metadatos extra si aplica.
CREATE TABLE pricing.courier_services (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    service_type public.service_type_code NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(courier_org_id, service_type)
);

-- 3.2 Zones (Defined by Courier)
CREATE TABLE pricing.zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sender_org_id UUID NULL REFERENCES public.organizations(id) ON DELETE CASCADE, -- NULL = Default Zone, NOT NULL = Specific to Sender
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(courier_org_id, sender_org_id, name)
);

-- 3.3 Zone Geometries (Separated for cleaner fetching)
CREATE TABLE pricing.zone_geoms (
    zone_id UUID PRIMARY KEY REFERENCES pricing.zones(id) ON DELETE CASCADE,
    geojson JSONB NOT NULL,
    bbox JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3.4 Tariff Sets (Agrupadores de tarifas)
-- Scope: GENERIC (sender_org_id is null) or BY_SENDER
CREATE TABLE pricing.tariff_sets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    scope TEXT NOT NULL CHECK (scope IN ('GENERIC', 'BY_SENDER')),
    sender_org_id UUID NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    cloned_from UUID NULL REFERENCES pricing.tariff_sets(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_tariff_scope CHECK (
        (scope = 'GENERIC' AND sender_org_id IS NULL) OR
        (scope = 'BY_SENDER' AND sender_org_id IS NOT NULL)
    ),
    UNIQUE(courier_org_id, scope, sender_org_id) -- Only one generic set per courier, one specific set per sender
);

-- 3.5 Tariff Rules
-- Specific rules for a tariff set and service type
CREATE TABLE pricing.tariff_rules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tariff_set_id UUID NOT NULL REFERENCES pricing.tariff_sets(id) ON DELETE CASCADE,
    service_type public.service_type_code NOT NULL,
    
    rule_kind TEXT NOT NULL CHECK (rule_kind IN (
        'STOP_FEE_BY_ZONE', 
        'PACKAGE_FEE_BY_SIZE', 
        'BASE_FEE', 
        'VEHICLE_HOURLY_RATE', 
        'PEON_HOURLY_RATE',
        'VEHICLE_KM_RATE',
        'PEON_KM_RATE',
        'FIXED_FEE'
    )),

    -- Applicability Columns
    zone_id UUID NULL REFERENCES pricing.zones(id) ON DELETE CASCADE,
    package_size public.package_size NULL,
    vehicle_type TEXT NULL, -- Could be enum, keeping text for flexibility for now or use public.vehicle_type if exists (does not exist yet in public)

    -- Values
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'UYU',
    
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints to ensure data integrity based on rule_kind could be added here or via application logic.
    -- For now, we rely on the engine to select the right rule.
    UNIQUE(tariff_set_id, service_type, rule_kind, zone_id, package_size, vehicle_type)
);

-- 3.6 Billing Terms (Configuración de facturación por cliente)
CREATE TABLE billing.courier_sender_terms (
    courier_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sender_org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    billing_cycle billing.billing_cycle NOT NULL DEFAULT 'SEMANAL',
    week_anchor INT NULL CHECK (week_anchor BETWEEN 1 AND 7), -- 1=Monday
    month_day INT NULL CHECK (month_day BETWEEN 1 AND 31),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (courier_org_id, sender_org_id)
);

-- 3.7 Settlements (Liquidaciones - Cabezal)
CREATE TABLE billing.settlements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    courier_org_id UUID NOT NULL REFERENCES public.organizations(id),
    sender_org_id UUID NOT NULL REFERENCES public.organizations(id),
    
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    
    status billing.settlement_status NOT NULL DEFAULT 'DRAFT',
    
    service_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    reimbursable_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_to_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
    
    issued_at TIMESTAMPTZ NULL,
    paid_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint: Avoid duplicate settlements for same period/client
    UNIQUE(courier_org_id, sender_org_id, period_start, period_end)
);

-- 4. INDICES
CREATE INDEX idx_pricing_zones_courier ON pricing.zones(courier_org_id);
CREATE INDEX idx_pricing_zones_sender ON pricing.zones(sender_org_id);
CREATE INDEX idx_tariff_rules_lookup ON pricing.tariff_rules(tariff_set_id, service_type, rule_kind);
CREATE INDEX idx_settlements_courier_sender ON billing.settlements(courier_org_id, sender_org_id);
CREATE INDEX idx_settlements_period ON billing.settlements(period_start, period_end);
