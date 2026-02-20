-- Migration: 019_extend_package_size.sql
-- Description: Add 'especial' validation support to package_size

-- Nota: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción en algunas versiones
-- o requiere que no haya transacciones activas. Supabase migrations suelen correr en transacciones.
-- Sin embargo, si package_size es un enum, 'ADD VALUE' es la forma correcta.
-- Si esto falla en el pipeline, se deberá ejecutar manualmente.

DO $$
BEGIN
    ALTER TYPE package_size ADD VALUE IF NOT EXISTS 'especial';
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Could not add value to enum: %', SQLERRM;
END $$;
