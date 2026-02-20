-- =====================================================
-- BACKFILL: Poblar directorio de destinatarios desde envíos existentes
-- Ejecutar en Supabase SQL Editor DESPUÉS de la migración principal
-- =====================================================
-- Este script procesa todos los envíos existentes que aún no tienen
-- recipient_id asignado y les crea sus entradas en recipients y
-- recipient_addresses.

DO $$
DECLARE
    r RECORD;
    v_recipient_id UUID;
    v_address_id UUID;
    v_email_norm TEXT;
    v_phone_norm TEXT;
    v_addr_norm TEXT;
    v_city_norm TEXT;
    v_dept_norm TEXT;
    v_count INT := 0;
BEGIN
    FOR r IN
        SELECT id, remitente_org_id, recipient_name, recipient_email,
               recipient_phone, recipient_address, recipient_city,
               recipient_department
        FROM shipments
        WHERE recipient_id IS NULL
          AND recipient_name IS NOT NULL
          AND trim(recipient_name) <> ''
        ORDER BY created_at ASC
    LOOP
        v_recipient_id := NULL;
        v_address_id := NULL;

        -- Normalizar
        v_email_norm := lower(trim(r.recipient_email));
        IF v_email_norm = '' THEN v_email_norm := NULL; END IF;

        v_phone_norm := regexp_replace(trim(COALESCE(r.recipient_phone, '')), '[^0-9+]', '', 'g');
        IF v_phone_norm = '' THEN v_phone_norm := NULL; END IF;

        v_addr_norm := lower(trim(regexp_replace(COALESCE(r.recipient_address, ''), '\s+', ' ', 'g')));
        v_city_norm := COALESCE(lower(trim(r.recipient_city)), '');
        v_dept_norm := COALESCE(lower(trim(r.recipient_department)), '');

        -- Buscar recipient existente por email
        IF v_email_norm IS NOT NULL THEN
            SELECT id INTO v_recipient_id
            FROM recipients
            WHERE org_id = r.remitente_org_id
              AND email_normalized = v_email_norm;
        END IF;

        -- Buscar por phone si no se encontró
        IF v_recipient_id IS NULL AND v_phone_norm IS NOT NULL THEN
            SELECT id INTO v_recipient_id
            FROM recipients
            WHERE org_id = r.remitente_org_id
              AND phone_normalized = v_phone_norm;
        END IF;

        -- Crear si no existe
        IF v_recipient_id IS NULL THEN
            INSERT INTO recipients (org_id, full_name, email, phone)
            VALUES (r.remitente_org_id, r.recipient_name, r.recipient_email, r.recipient_phone)
            RETURNING id INTO v_recipient_id;
        END IF;

        -- Buscar/crear address
        IF v_addr_norm IS NOT NULL AND v_addr_norm <> '' THEN
            SELECT id INTO v_address_id
            FROM recipient_addresses
            WHERE recipient_id = v_recipient_id
              AND address_normalized = v_addr_norm
              AND COALESCE(lower(trim(city)), '') = v_city_norm
              AND COALESCE(lower(trim(department)), '') = v_dept_norm;

            IF v_address_id IS NOT NULL THEN
                UPDATE recipient_addresses SET
                    last_used_at = NOW(),
                    usage_count = usage_count + 1
                WHERE id = v_address_id;
            ELSE
                INSERT INTO recipient_addresses (recipient_id, org_id, address_raw, city, department)
                VALUES (v_recipient_id, r.remitente_org_id, r.recipient_address, r.recipient_city, r.recipient_department)
                RETURNING id INTO v_address_id;
            END IF;
        END IF;

        -- Actualizar envío con los IDs (sin disparar el trigger de nuevo)
        UPDATE shipments SET
            recipient_id = v_recipient_id,
            recipient_address_id = v_address_id
        WHERE id = r.id;

        v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE 'Backfill completado: % envíos procesados', v_count;
END;
$$;
