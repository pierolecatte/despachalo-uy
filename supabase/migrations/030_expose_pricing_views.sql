-- Migration: 030_expose_pricing_views.sql
-- Description: Create auto-updatable views in public schema to expose pricing and billing tables to PostgREST API cleanly.

-- Force RLS on underlying tables just in case roles try to bypass it
ALTER TABLE pricing.tariff_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE pricing.tariff_rules FORCE ROW LEVEL SECURITY;

-- 1. Tariff Sets View (Security Invoker)
CREATE OR REPLACE VIEW public.tariff_sets WITH (security_invoker = true) AS 
SELECT * FROM pricing.tariff_sets;

-- 2. Tariff Rules View (Security Invoker)
CREATE OR REPLACE VIEW public.tariff_rules WITH (security_invoker = true) AS 
SELECT * FROM pricing.tariff_rules;

-- Permissions are handled by RLS on the underlying tables (which were set up in 024_rls_policies.sql)
-- But we need to grant access to the views themselves:
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tariff_sets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tariff_rules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tariff_sets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tariff_rules TO service_role;

-- Reload schema cache so PostgREST picks up the new views
NOTIFY pgrst, 'reload schema';
