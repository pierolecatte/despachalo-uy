-- Migration: 031_pricing_tariffs_rls_fix.sql
-- Description: Fix RLS policies for pricing.tariff_sets and pricing.tariff_rules to support Super Admin CRUD operations.

-- 1. Force RLS
ALTER TABLE pricing.tariff_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE pricing.tariff_rules FORCE ROW LEVEL SECURITY;

-- 2. Drop existing policies to recreate them cleanly
DROP POLICY IF EXISTS "tariffs_read_authenticated" ON pricing.tariff_sets;
DROP POLICY IF EXISTS "tariffs_manage_own" ON pricing.tariff_sets;
DROP POLICY IF EXISTS "rules_read_authenticated" ON pricing.tariff_rules;
DROP POLICY IF EXISTS "rules_manage_own" ON pricing.tariff_rules;

-- 3. Tariff Sets Policies
-- SELECT: Authenticated user who is a super admin OR belongs to the courier org
CREATE POLICY "tariff_sets_select" ON pricing.tariff_sets
    FOR SELECT USING (
        public.is_super_admin() OR courier_org_id = public.get_user_org_id()
    );

-- INSERT: Super admin OR the user belongs to the courier org
CREATE POLICY "tariff_sets_insert" ON pricing.tariff_sets
    FOR INSERT WITH CHECK (
        public.is_super_admin() OR courier_org_id = public.get_user_org_id()
    );

-- UPDATE: Super admin OR the user belongs to the courier org
CREATE POLICY "tariff_sets_update" ON pricing.tariff_sets
    FOR UPDATE USING (
        public.is_super_admin() OR courier_org_id = public.get_user_org_id()
    ) WITH CHECK (
        public.is_super_admin() OR courier_org_id = public.get_user_org_id()
    );

-- DELETE: Super admin OR the user belongs to the courier org
CREATE POLICY "tariff_sets_delete" ON pricing.tariff_sets
    FOR DELETE USING (
        public.is_super_admin() OR courier_org_id = public.get_user_org_id()
    );

-- 4. Tariff Rules Policies
-- SELECT: Super admin OR the user belongs to the courier org of the parent tariff set
CREATE POLICY "tariff_rules_select" ON pricing.tariff_rules
    FOR SELECT USING (
        public.is_super_admin() OR 
        EXISTS (
            SELECT 1 FROM pricing.tariff_sets ts 
            WHERE ts.id = pricing.tariff_rules.tariff_set_id 
            AND ts.courier_org_id = public.get_user_org_id()
        )
    );

-- INSERT: Super admin OR the user belongs to the courier org of the parent tariff set
CREATE POLICY "tariff_rules_insert" ON pricing.tariff_rules
    FOR INSERT WITH CHECK (
        public.is_super_admin() OR 
        EXISTS (
            SELECT 1 FROM pricing.tariff_sets ts 
            WHERE ts.id = pricing.tariff_rules.tariff_set_id 
            AND ts.courier_org_id = public.get_user_org_id()
        )
    );

-- UPDATE: Super admin OR the user belongs to the courier org of the parent tariff set
CREATE POLICY "tariff_rules_update" ON pricing.tariff_rules
    FOR UPDATE USING (
        public.is_super_admin() OR 
        EXISTS (
            SELECT 1 FROM pricing.tariff_sets ts 
            WHERE ts.id = pricing.tariff_rules.tariff_set_id 
            AND ts.courier_org_id = public.get_user_org_id()
        )
    ) WITH CHECK (
        public.is_super_admin() OR 
        EXISTS (
            SELECT 1 FROM pricing.tariff_sets ts 
            WHERE ts.id = pricing.tariff_rules.tariff_set_id 
            AND ts.courier_org_id = public.get_user_org_id()
        )
    );

-- DELETE: Super admin OR the user belongs to the courier org of the parent tariff set
CREATE POLICY "tariff_rules_delete" ON pricing.tariff_rules
    FOR DELETE USING (
        public.is_super_admin() OR 
        EXISTS (
            SELECT 1 FROM pricing.tariff_sets ts 
            WHERE ts.id = pricing.tariff_rules.tariff_set_id 
            AND ts.courier_org_id = public.get_user_org_id()
        )
    );
