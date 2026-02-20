-- 008_import_templates.sql
-- Import templates per organization for reusing mapping configurations

CREATE TABLE IF NOT EXISTS import_templates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        text NOT NULL,
    
    -- Signatures for matching
    header_signature_strict text NOT NULL,  -- SHA256 of normalized headers in original order
    header_signature_loose  text NOT NULL,  -- SHA256 of normalized, sorted headers
    
    -- Debug / UI info
    normalized_headers      jsonb NOT NULL, -- Array of strings (normalized)
    
    -- Payload to apply
    mapping     jsonb NOT NULL,
    defaults    jsonb NOT NULL DEFAULT '{}',
    
    -- Metadata
    created_by  uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Unique: one template per org + strict signature (exact match)
-- Use a unique index to prevent duplicate templates for the exact same file structure
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_templates_org_strict
    ON import_templates (org_id, header_signature_strict);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_import_templates_org_loose
    ON import_templates (org_id, header_signature_loose);

-- RLS
ALTER TABLE import_templates ENABLE ROW LEVEL SECURITY;

-- Policies matched to users organization membership

-- READ: Users can read templates from their own orgs
CREATE POLICY "Users can read own org templates"
    ON import_templates FOR SELECT
    USING (
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- INSERT: Users can insert templates for their own orgs
CREATE POLICY "Users can insert own org templates"
    ON import_templates FOR INSERT
    WITH CHECK (
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- UPDATE: Users can update templates for their own orgs
CREATE POLICY "Users can update own org templates"
    ON import_templates FOR UPDATE
    USING (
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- DELETE: Users can delete templates for their own orgs (optional, but good practice)
CREATE POLICY "Users can delete own org templates"
    ON import_templates FOR DELETE
    USING (
        org_id IN (
            SELECT org_id FROM users WHERE auth_user_id = auth.uid()
        )
    );

-- Service role bypass
CREATE POLICY "Service role full access on import_templates"
    ON import_templates FOR ALL
    USING (auth.role() = 'service_role');
