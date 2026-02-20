-- Migration: 035_expose_zone_templates.sql
-- Description: Create auto-updatable views in public schema to expose zone_templates to PostgREST API.

CREATE OR REPLACE VIEW public.zone_templates WITH (security_invoker = true) AS 
SELECT * FROM pricing.zone_templates;

-- Expose pricing.zones just in case since UI uses .from('zones') without schema
CREATE OR REPLACE VIEW public.zones WITH (security_invoker = true) AS 
SELECT * FROM pricing.zones;

-- Permissions are handled by RLS on the underlying tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zone_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zone_templates TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO service_role;

-- Reload schema cache so PostgREST picks up the new views
NOTIFY pgrst, 'reload schema';
