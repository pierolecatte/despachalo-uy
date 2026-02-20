-- 009_fix_template_rls.sql

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can read own org templates" ON import_templates;
DROP POLICY IF EXISTS "Users can insert own org templates" ON import_templates;
DROP POLICY IF EXISTS "Users can update own org templates" ON import_templates;
DROP POLICY IF EXISTS "Users can delete own org templates" ON import_templates;

-- CREATE NEW PERMISSIVE POLICIES (Include Super Admin)

-- READ: Own org OR Super Admin
CREATE POLICY "Users can read own org templates"
    ON import_templates FOR SELECT
    USING (
        (SELECT is_super_admin()) OR
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- INSERT: Own org OR Super Admin
CREATE POLICY "Users can insert own org templates"
    ON import_templates FOR INSERT
    WITH CHECK (
        (SELECT is_super_admin()) OR
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- UPDATE: Own org OR Super Admin
CREATE POLICY "Users can update own org templates"
    ON import_templates FOR UPDATE
    USING (
        (SELECT is_super_admin()) OR
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- DELETE: Own org OR Super Admin
CREATE POLICY "Users can delete own org templates"
    ON import_templates FOR DELETE
    USING (
        (SELECT is_super_admin()) OR
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );
