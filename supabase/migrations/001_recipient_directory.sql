-- =====================================================
-- despachalo.uy — Migración: Directorio de Destinatarios
-- Ejecutar en Supabase SQL Editor (Dashboard > SQL)
-- =====================================================
-- NOTA TÉCNICA: Se usa un modelo simplificado de 2 tablas
-- (recipients + recipient_addresses). Email y teléfono
-- viven directamente en recipients. Si en el futuro se
-- necesita soportar múltiples emails/teléfonos por persona,
-- migrar a tabla intermedia recipient_identities.
-- =====================================================

-- 1. EXTENSIÓN pg_trgm (búsqueda fuzzy / trigram)
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. TABLAS
-- =====================================================

-- Directorio de destinatarios (1 fila = 1 persona por org)
CREATE TABLE recipients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT,
    email_normalized TEXT GENERATED ALWAYS AS (lower(trim(email))) STORED,
    phone TEXT,
    phone_normalized TEXT GENERATED ALWAYS AS (
        regexp_replace(trim(phone), '[^0-9+]', '', 'g')
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplicación fuerte por email normalizado (parcial: solo si no es null)
CREATE UNIQUE INDEX uq_recipients_org_email
    ON recipients (org_id, email_normalized)
    WHERE email_normalized IS NOT NULL AND email_normalized <> '';

-- Deduplicación fuerte por teléfono normalizado (parcial: solo si no es null)
CREATE UNIQUE INDEX uq_recipients_org_phone
    ON recipients (org_id, phone_normalized)
    WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';

-- Direcciones de destinatarios (N por recipient)
CREATE TABLE recipient_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    address_raw TEXT NOT NULL,
    city TEXT,
    department TEXT,
    address_normalized TEXT GENERATED ALWAYS AS (
        lower(trim(regexp_replace(address_raw, '\s+', ' ', 'g')))
    ) STORED,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usage_count INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deduplicación de direcciones por recipient + dirección/ciudad/departamento
CREATE UNIQUE INDEX uq_recipient_addr_norm
    ON recipient_addresses (
        recipient_id,
        address_normalized,
        COALESCE(lower(trim(city)), ''),
        COALESCE(lower(trim(department)), '')
    );

-- 3. COLUMNAS NUEVAS EN SHIPMENTS (nullable, compatibilidad total)
-- =====================================================
ALTER TABLE shipments
    ADD COLUMN IF NOT EXISTS recipient_id UUID REFERENCES recipients(id),
    ADD COLUMN IF NOT EXISTS recipient_address_id UUID REFERENCES recipient_addresses(id);

-- 4. ÍNDICES
-- =====================================================

-- Trigram para búsqueda fuzzy por nombre
CREATE INDEX idx_recipients_fullname_trgm
    ON recipients USING GIN (full_name gin_trgm_ops);

-- Trigram para búsqueda fuzzy por dirección
CREATE INDEX idx_recaddr_address_trgm
    ON recipient_addresses USING GIN (address_normalized gin_trgm_ops);

-- B-tree para búsqueda exacta/prefix por email
CREATE INDEX idx_recipients_email_norm
    ON recipients (org_id, email_normalized)
    WHERE email_normalized IS NOT NULL AND email_normalized <> '';

-- B-tree para búsqueda exacta/prefix por teléfono
CREATE INDEX idx_recipients_phone_norm
    ON recipients (org_id, phone_normalized)
    WHERE phone_normalized IS NOT NULL AND phone_normalized <> '';

-- B-tree para ordenar por uso reciente
CREATE INDEX idx_recaddr_last_used
    ON recipient_addresses (org_id, last_used_at DESC);

-- FK lookup rápido
CREATE INDEX idx_recaddr_recipient
    ON recipient_addresses (recipient_id);

-- Nuevas columnas en shipments
CREATE INDEX idx_shipments_recipient ON shipments (recipient_id)
    WHERE recipient_id IS NOT NULL;

-- 5. RPC: SUGERENCIAS DE DESTINATARIOS
-- =====================================================
-- Seguridad: NO confía en p_org_id del cliente; usa get_user_org_id()
-- internamente y valida. Si es super_admin acepta cualquier org_id.

CREATE OR REPLACE FUNCTION recipient_suggestions(
    p_org_id UUID,
    p_field TEXT,        -- 'name' | 'email' | 'phone' | 'address'
    p_query TEXT,
    p_limit INT DEFAULT 8
)
RETURNS TABLE (
    recipient_id UUID,
    recipient_address_id UUID,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    city TEXT,
    department TEXT,
    last_used_at TIMESTAMPTZ,
    score REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
    v_user_org_id UUID;
    v_is_super BOOLEAN;
    v_effective_org UUID;
    v_query_clean TEXT;
BEGIN
    -- Determinar org del usuario autenticado
    SELECT u.org_id INTO v_user_org_id
    FROM users u WHERE u.auth_user_id = auth.uid();

    v_is_super := is_super_admin();

    -- Validar: solo puede consultar su propia org (o cualquiera si es super_admin)
    IF v_is_super THEN
        v_effective_org := p_org_id;
    ELSE
        v_effective_org := v_user_org_id;
    END IF;

    -- Si no hay org, no devolver nada
    IF v_effective_org IS NULL THEN
        RETURN;
    END IF;

    -- Limpiar query
    v_query_clean := trim(p_query);
    IF v_query_clean = '' OR length(v_query_clean) < 2 THEN
        RETURN;
    END IF;

    -- Buscar según el campo indicado
    IF p_field = 'name' THEN
        RETURN QUERY
        SELECT
            r.id AS recipient_id,
            ra.id AS recipient_address_id,
            r.full_name,
            r.email,
            r.phone,
            ra.address_raw AS address,
            ra.city,
            ra.department,
            COALESCE(ra.last_used_at, r.updated_at) AS last_used_at,
            CASE
                WHEN r.full_name ILIKE v_query_clean || '%' THEN 1.0
                WHEN r.full_name ILIKE '%' || v_query_clean || '%' THEN 0.7
                ELSE similarity(r.full_name, v_query_clean)
            END AS score
        FROM recipients r
        LEFT JOIN LATERAL (
            SELECT ra2.*
            FROM recipient_addresses ra2
            WHERE ra2.recipient_id = r.id
            ORDER BY ra2.last_used_at DESC
            LIMIT 1
        ) ra ON true
        WHERE r.org_id = v_effective_org
          AND (
              r.full_name ILIKE '%' || v_query_clean || '%'
              OR similarity(r.full_name, v_query_clean) > 0.15
          )
        ORDER BY score DESC, COALESCE(ra.last_used_at, r.updated_at) DESC
        LIMIT p_limit;

    ELSIF p_field = 'email' THEN
        RETURN QUERY
        SELECT
            r.id AS recipient_id,
            ra.id AS recipient_address_id,
            r.full_name,
            r.email,
            r.phone,
            ra.address_raw AS address,
            ra.city,
            ra.department,
            COALESCE(ra.last_used_at, r.updated_at) AS last_used_at,
            CASE
                WHEN r.email_normalized ILIKE v_query_clean || '%' THEN 1.0
                WHEN r.email_normalized ILIKE '%' || v_query_clean || '%' THEN 0.7
                ELSE 0.3
            END AS score
        FROM recipients r
        LEFT JOIN LATERAL (
            SELECT ra2.*
            FROM recipient_addresses ra2
            WHERE ra2.recipient_id = r.id
            ORDER BY ra2.last_used_at DESC
            LIMIT 1
        ) ra ON true
        WHERE r.org_id = v_effective_org
          AND r.email_normalized IS NOT NULL
          AND r.email_normalized ILIKE '%' || lower(trim(v_query_clean)) || '%'
        ORDER BY score DESC, COALESCE(ra.last_used_at, r.updated_at) DESC
        LIMIT p_limit;

    ELSIF p_field = 'phone' THEN
        RETURN QUERY
        SELECT
            r.id AS recipient_id,
            ra.id AS recipient_address_id,
            r.full_name,
            r.email,
            r.phone,
            ra.address_raw AS address,
            ra.city,
            ra.department,
            COALESCE(ra.last_used_at, r.updated_at) AS last_used_at,
            CASE
                WHEN r.phone_normalized ILIKE '%' || regexp_replace(trim(v_query_clean), '[^0-9+]', '', 'g') || '%' THEN 1.0
                ELSE 0.3
            END AS score
        FROM recipients r
        LEFT JOIN LATERAL (
            SELECT ra2.*
            FROM recipient_addresses ra2
            WHERE ra2.recipient_id = r.id
            ORDER BY ra2.last_used_at DESC
            LIMIT 1
        ) ra ON true
        WHERE r.org_id = v_effective_org
          AND r.phone_normalized IS NOT NULL
          AND r.phone_normalized ILIKE '%' || regexp_replace(trim(v_query_clean), '[^0-9+]', '', 'g') || '%'
        ORDER BY score DESC, COALESCE(ra.last_used_at, r.updated_at) DESC
        LIMIT p_limit;

    ELSIF p_field = 'address' THEN
        RETURN QUERY
        SELECT
            r.id AS recipient_id,
            ra.id AS recipient_address_id,
            r.full_name,
            r.email,
            r.phone,
            ra.address_raw AS address,
            ra.city,
            ra.department,
            ra.last_used_at,
            CASE
                WHEN ra.address_normalized ILIKE lower(trim(v_query_clean)) || '%' THEN 1.0
                WHEN ra.address_normalized ILIKE '%' || lower(trim(v_query_clean)) || '%' THEN 0.7
                ELSE similarity(ra.address_normalized, lower(trim(v_query_clean)))
            END AS score
        FROM recipient_addresses ra
        JOIN recipients r ON r.id = ra.recipient_id
        WHERE ra.org_id = v_effective_org
          AND (
              ra.address_normalized ILIKE '%' || lower(trim(v_query_clean)) || '%'
              OR similarity(ra.address_normalized, lower(trim(v_query_clean))) > 0.15
          )
        ORDER BY score DESC, ra.last_used_at DESC
        LIMIT p_limit;

    ELSE
        -- Campo desconocido: no devolver nada
        RETURN;
    END IF;
END;
$$;

-- 6. TRIGGER: AUTO-ALIMENTAR DIRECTORIO AL CREAR/EDITAR ENVÍOS
-- =====================================================
-- Se usa BEFORE INSERT OR UPDATE para evitar loops.
-- Setea NEW.recipient_id y NEW.recipient_address_id directamente.

CREATE OR REPLACE FUNCTION upsert_recipient_from_shipment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_recipient_id UUID;
    v_address_id UUID;
    v_email_norm TEXT;
    v_phone_norm TEXT;
    v_addr_norm TEXT;
    v_city_norm TEXT;
    v_dept_norm TEXT;
BEGIN
    -- Solo procesar si hay al menos un dato de destinatario
    IF NEW.recipient_name IS NULL OR trim(NEW.recipient_name) = '' THEN
        RETURN NEW;
    END IF;

    -- Normalizar valores para búsqueda
    v_email_norm := lower(trim(NEW.recipient_email));
    IF v_email_norm = '' THEN v_email_norm := NULL; END IF;

    v_phone_norm := regexp_replace(trim(COALESCE(NEW.recipient_phone, '')), '[^0-9+]', '', 'g');
    IF v_phone_norm = '' THEN v_phone_norm := NULL; END IF;

    v_addr_norm := lower(trim(regexp_replace(COALESCE(NEW.recipient_address, ''), '\s+', ' ', 'g')));
    v_city_norm := COALESCE(lower(trim(NEW.recipient_city)), '');
    v_dept_norm := COALESCE(lower(trim(NEW.recipient_department)), '');

    -- ==========================================
    -- PASO 1: Buscar / crear RECIPIENT
    -- ==========================================
    -- Prioridad: match por email, luego phone
    IF v_email_norm IS NOT NULL THEN
        SELECT id INTO v_recipient_id
        FROM recipients
        WHERE org_id = NEW.remitente_org_id
          AND email_normalized = v_email_norm;
    END IF;

    IF v_recipient_id IS NULL AND v_phone_norm IS NOT NULL THEN
        SELECT id INTO v_recipient_id
        FROM recipients
        WHERE org_id = NEW.remitente_org_id
          AND phone_normalized = v_phone_norm;
    END IF;

    IF v_recipient_id IS NOT NULL THEN
        -- Existe: actualizar nombre/email/phone si cambiaron + updated_at
        UPDATE recipients SET
            full_name = NEW.recipient_name,
            email = COALESCE(NEW.recipient_email, email),
            phone = COALESCE(NEW.recipient_phone, phone),
            updated_at = NOW()
        WHERE id = v_recipient_id;
    ELSE
        -- No existe: crear nuevo
        INSERT INTO recipients (org_id, full_name, email, phone)
        VALUES (NEW.remitente_org_id, NEW.recipient_name, NEW.recipient_email, NEW.recipient_phone)
        RETURNING id INTO v_recipient_id;
    END IF;

    -- ==========================================
    -- PASO 2: Buscar / crear ADDRESS
    -- ==========================================
    IF v_addr_norm IS NOT NULL AND v_addr_norm <> '' THEN
        -- Buscar dirección existente (misma normalización)
        SELECT id INTO v_address_id
        FROM recipient_addresses
        WHERE recipient_id = v_recipient_id
          AND address_normalized = v_addr_norm
          AND COALESCE(lower(trim(city)), '') = v_city_norm
          AND COALESCE(lower(trim(department)), '') = v_dept_norm;

        IF v_address_id IS NOT NULL THEN
            -- Existe: incrementar uso y actualizar timestamp
            UPDATE recipient_addresses SET
                last_used_at = NOW(),
                usage_count = usage_count + 1
            WHERE id = v_address_id;
        ELSE
            -- No existe: crear nueva dirección
            INSERT INTO recipient_addresses (
                recipient_id, org_id, address_raw, city, department
            )
            VALUES (
                v_recipient_id, NEW.remitente_org_id,
                NEW.recipient_address, NEW.recipient_city, NEW.recipient_department
            )
            RETURNING id INTO v_address_id;
        END IF;
    END IF;

    -- ==========================================
    -- PASO 3: Setear IDs en el envío (BEFORE trigger)
    -- ==========================================
    NEW.recipient_id := v_recipient_id;
    NEW.recipient_address_id := v_address_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_upsert_recipient
    BEFORE INSERT OR UPDATE ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION upsert_recipient_from_shipment();

-- 7. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipient_addresses ENABLE ROW LEVEL SECURITY;

-- Recipients: super_admin todo
CREATE POLICY "recipients_super_admin_all" ON recipients
    FOR ALL USING (is_super_admin());

-- Recipients: leer/insertar/actualizar solo de su org
CREATE POLICY "recipients_own_org_select" ON recipients
    FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "recipients_own_org_insert" ON recipients
    FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "recipients_own_org_update" ON recipients
    FOR UPDATE USING (org_id = get_user_org_id());

-- Addresses: super_admin todo
CREATE POLICY "recaddr_super_admin_all" ON recipient_addresses
    FOR ALL USING (is_super_admin());

-- Addresses: leer/insertar/actualizar solo de su org
CREATE POLICY "recaddr_own_org_select" ON recipient_addresses
    FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "recaddr_own_org_insert" ON recipient_addresses
    FOR INSERT WITH CHECK (org_id = get_user_org_id());

CREATE POLICY "recaddr_own_org_update" ON recipient_addresses
    FOR UPDATE USING (org_id = get_user_org_id());

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
