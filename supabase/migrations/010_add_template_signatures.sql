-- 010_add_template_signatures.sql (FIXED)

BEGIN;

-- 1) Add missing columns (safe if already exist)
ALTER TABLE import_templates
    ADD COLUMN IF NOT EXISTS header_signature_strict text,
    ADD COLUMN IF NOT EXISTS header_signature_loose text,
    ADD COLUMN IF NOT EXISTS normalized_headers jsonb,
    ADD COLUMN IF NOT EXISTS header_fingerprint text;

-- 2) Backfill NULLs safely (avoid empty-string duplicates)
-- Uses md5(id) as fallback to ensure uniqueness if data is missing
UPDATE import_templates
SET
    header_signature_strict = COALESCE(header_signature_strict, md5(id::text)),
    header_signature_loose  = COALESCE(header_signature_loose,  md5(id::text)),
    normalized_headers      = COALESCE(normalized_headers, '[]'::jsonb),
    header_fingerprint      = COALESCE(header_fingerprint, COALESCE(header_signature_strict, md5(id::text)))
WHERE
    header_signature_strict IS NULL
    OR header_signature_loose IS NULL
    OR header_fingerprint IS NULL
    OR normalized_headers IS NULL;

-- 3) Enforce NOT NULL
ALTER TABLE import_templates
    ALTER COLUMN header_signature_strict SET NOT NULL,
    ALTER COLUMN header_signature_loose  SET NOT NULL,
    ALTER COLUMN normalized_headers      SET NOT NULL,
    ALTER COLUMN header_fingerprint      SET NOT NULL;

-- 5) Re-create indexes
DROP INDEX IF EXISTS uq_import_templates_org_strict;
CREATE UNIQUE INDEX IF NOT EXISTS uq_import_templates_org_strict
    ON import_templates (org_id, header_signature_strict);

DROP INDEX IF EXISTS idx_import_templates_org_loose;
CREATE INDEX IF NOT EXISTS idx_import_templates_org_loose
    ON import_templates (org_id, header_signature_loose);

COMMIT;
