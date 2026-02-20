-- =====================================================
-- Migration 004: Asignación de Cadete + Escaneo
-- Tablas de log, trigger de validación, y RPC atómica
-- =====================================================

-- 1. TABLA: Log de asignaciones de cadete
-- =====================================================
CREATE TABLE envio_asignaciones_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    envio_id UUID NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    cadeteria_org_id UUID NOT NULL REFERENCES organizations(id),
    cadete_anterior_id UUID REFERENCES users(id),
    cadete_nuevo_id UUID NOT NULL REFERENCES users(id),
    motivo TEXT NOT NULL,           -- 'asignacion_manual', 'scan_asignacion', 'scan_reasignacion'
    actor_user_id UUID NOT NULL,    -- auth user id del que realizó la acción
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. TABLA: Log de escaneos (siempre se registra, incluso sin cambios)
-- =====================================================
CREATE TABLE envio_scans_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cadete_user_id UUID NOT NULL REFERENCES users(id),
    envio_id UUID REFERENCES shipments(id) ON DELETE SET NULL,
    codigo_escaneado TEXT NOT NULL,
    resultado TEXT NOT NULL,   -- 'asignado', 'reasignado', 'confirmado', 'otra_cadeteria', 'no_encontrado'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. ÍNDICES
-- =====================================================
CREATE INDEX idx_asignaciones_log_envio ON envio_asignaciones_log(envio_id);
CREATE INDEX idx_asignaciones_log_cadete ON envio_asignaciones_log(cadete_nuevo_id);
CREATE INDEX idx_asignaciones_log_created ON envio_asignaciones_log(created_at DESC);
CREATE INDEX idx_scans_log_cadete ON envio_scans_log(cadete_user_id);
CREATE INDEX idx_scans_log_envio ON envio_scans_log(envio_id);
CREATE INDEX idx_scans_log_created ON envio_scans_log(created_at DESC);

-- 4. RLS para nuevas tablas
-- =====================================================
ALTER TABLE envio_asignaciones_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE envio_scans_log ENABLE ROW LEVEL SECURITY;

-- Asignaciones log: super_admin todo
CREATE POLICY "asignaciones_log_super_admin_all" ON envio_asignaciones_log
    FOR ALL USING (is_super_admin());

-- Asignaciones log: lectura por org (cadetería o remitente del envío)
CREATE POLICY "asignaciones_log_read_own_org" ON envio_asignaciones_log
    FOR SELECT USING (
        cadeteria_org_id = get_user_org_id()
        OR envio_id IN (
            SELECT id FROM shipments WHERE remitente_org_id = get_user_org_id()
        )
    );

-- Asignaciones log: insert para autenticados (los endpoints server-side insertan)
CREATE POLICY "asignaciones_log_insert_auth" ON envio_asignaciones_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Scans log: super_admin todo
CREATE POLICY "scans_log_super_admin_all" ON envio_scans_log
    FOR ALL USING (is_super_admin());

-- Scans log: cadete solo lee sus propios scans
CREATE POLICY "scans_log_read_own" ON envio_scans_log
    FOR SELECT USING (
        cadete_user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    );

-- Scans log: org_admin lee scans de cadetes de su org
CREATE POLICY "scans_log_read_org" ON envio_scans_log
    FOR SELECT USING (
        cadete_user_id IN (SELECT id FROM users WHERE org_id = get_user_org_id())
    );

-- Scans log: insert para autenticados
CREATE POLICY "scans_log_insert_auth" ON envio_scans_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- 5. TRIGGER: Validar que cadete pertenece a la cadetería del envío
-- =====================================================
-- Aplica en INSERT y UPDATE de shipments cuando cadete_user_id no es NULL.
-- Garantiza integridad a nivel DB (defensa en profundidad).

CREATE OR REPLACE FUNCTION validate_cadete_cadeteria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cadete_org_id UUID;
BEGIN
    -- Solo validar si hay cadete asignado
    IF NEW.cadete_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Solo validar si hay cadetería asignada
    IF NEW.cadeteria_org_id IS NULL THEN
        RAISE EXCEPTION 'No se puede asignar cadete sin cadetería asignada al envío'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Obtener la org del cadete
    SELECT org_id INTO v_cadete_org_id
    FROM users
    WHERE id = NEW.cadete_user_id
      AND role = 'cadete'
      AND active = true;

    -- Verificar que el cadete existe y es cadete activo
    IF v_cadete_org_id IS NULL THEN
        RAISE EXCEPTION 'El usuario especificado no es un cadete activo'
            USING ERRCODE = 'check_violation';
    END IF;

    -- Verificar que pertenece a la misma cadetería
    IF v_cadete_org_id != NEW.cadeteria_org_id THEN
        RAISE EXCEPTION 'El cadete no pertenece a la cadetería asignada al envío. Cadete org: %, Envío cadetería: %',
            v_cadete_org_id, NEW.cadeteria_org_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_cadete_cadeteria
    BEFORE INSERT OR UPDATE ON shipments
    FOR EACH ROW
    EXECUTE FUNCTION validate_cadete_cadeteria();

-- 6. RPC: Escaneo atómico de envío por cadete
-- =====================================================
-- El cadete se identifica vía auth.uid().
-- Busca por tracking_code.
-- TODO: En v2, si no matchea tracking_code, buscar por shipment_packages.qr_token
-- y resolver el shipment desde ahí.

CREATE OR REPLACE FUNCTION cadete_scan_envio(p_tracking_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_auth_uid UUID;
    v_cadete RECORD;    -- id, org_id del cadete
    v_envio RECORD;     -- id, cadeteria_org_id, cadete_user_id
    v_result JSON;
    v_scan_resultado TEXT;
    v_reassigned BOOLEAN := false;
BEGIN
    -- 1. Identificar cadete autenticado
    v_auth_uid := auth.uid();
    IF v_auth_uid IS NULL THEN
        RETURN json_build_object(
            'status', 'error',
            'message', 'No autenticado'
        );
    END IF;

    SELECT id, org_id INTO v_cadete
    FROM users
    WHERE auth_user_id = v_auth_uid
      AND role = 'cadete'
      AND active = true;

    IF v_cadete.id IS NULL THEN
        RETURN json_build_object(
            'status', 'error',
            'message', 'Usuario no es un cadete activo'
        );
    END IF;

    -- 2. Buscar envío por tracking_code
    SELECT id, cadeteria_org_id, cadete_user_id
    INTO v_envio
    FROM shipments
    WHERE tracking_code = upper(trim(p_tracking_code));

    -- TODO v2: si v_envio es NULL, intentar buscar por qr_token:
    -- SELECT s.id, s.cadeteria_org_id, s.cadete_user_id
    -- INTO v_envio
    -- FROM shipment_packages sp
    -- JOIN shipments s ON s.id = sp.shipment_id
    -- WHERE sp.qr_token = trim(p_tracking_code);

    IF v_envio.id IS NULL THEN
        -- Log scan fallido
        INSERT INTO envio_scans_log (cadete_user_id, envio_id, codigo_escaneado, resultado)
        VALUES (v_cadete.id, NULL, p_tracking_code, 'no_encontrado');

        RETURN json_build_object(
            'status', 'not_found',
            'message', 'Código inválido o envío inexistente',
            'reassigned', false,
            'envioId', NULL,
            'cadeteId', v_cadete.id
        );
    END IF;

    -- 3. Verificar cadetería
    IF v_envio.cadeteria_org_id IS NULL OR v_envio.cadeteria_org_id != v_cadete.org_id THEN
        -- Log scan otra cadetería
        INSERT INTO envio_scans_log (cadete_user_id, envio_id, codigo_escaneado, resultado)
        VALUES (v_cadete.id, v_envio.id, p_tracking_code, 'otra_cadeteria');

        RETURN json_build_object(
            'status', 'other_cadeteria',
            'message', 'Envío asignado a otra cadetería',
            'reassigned', false,
            'envioId', v_envio.id,
            'cadeteId', v_cadete.id
        );
    END IF;

    -- 4. Misma cadetería: determinar acción
    IF v_envio.cadete_user_id IS NULL THEN
        -- a) Sin cadete asignado → asignar
        UPDATE shipments SET cadete_user_id = v_cadete.id WHERE id = v_envio.id;

        INSERT INTO envio_asignaciones_log (envio_id, cadeteria_org_id, cadete_anterior_id, cadete_nuevo_id, motivo, actor_user_id)
        VALUES (v_envio.id, v_envio.cadeteria_org_id, NULL, v_cadete.id, 'scan_asignacion', v_auth_uid);

        v_scan_resultado := 'asignado';
        v_reassigned := false;

    ELSIF v_envio.cadete_user_id != v_cadete.id THEN
        -- b) Otro cadete asignado → reasignar al que escaneó
        UPDATE shipments SET cadete_user_id = v_cadete.id WHERE id = v_envio.id;

        INSERT INTO envio_asignaciones_log (envio_id, cadeteria_org_id, cadete_anterior_id, cadete_nuevo_id, motivo, actor_user_id)
        VALUES (v_envio.id, v_envio.cadeteria_org_id, v_envio.cadete_user_id, v_cadete.id, 'scan_reasignacion', v_auth_uid);

        v_scan_resultado := 'reasignado';
        v_reassigned := true;

    ELSE
        -- c) Ya asignado a este cadete → confirmar sin cambios
        v_scan_resultado := 'confirmado';
        v_reassigned := false;
    END IF;

    -- Log del scan
    INSERT INTO envio_scans_log (cadete_user_id, envio_id, codigo_escaneado, resultado)
    VALUES (v_cadete.id, v_envio.id, p_tracking_code, v_scan_resultado);

    -- 5. Retornar resultado
    RETURN json_build_object(
        'status', v_scan_resultado,
        'message', CASE v_scan_resultado
            WHEN 'asignado' THEN 'Envío asignado correctamente'
            WHEN 'reasignado' THEN 'Envío reasignado a tu nombre'
            WHEN 'confirmado' THEN 'Envío ya asignado a tu nombre'
        END,
        'reassigned', v_reassigned,
        'envioId', v_envio.id,
        'cadeteId', v_cadete.id
    );
END;
$$;

-- =====================================================
-- FIN DE MIGRACIÓN 004
-- =====================================================
