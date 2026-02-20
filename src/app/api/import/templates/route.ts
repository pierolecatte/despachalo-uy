import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeHeaderSignatureStrict, computeHeaderSignatureLoose, normalizeHeader } from '@/lib/import/templates'

// GET /api/import/templates?orgId=...
export async function GET(req: NextRequest) {
    const supabase = await createClient()
    const { searchParams } = new URL(req.url)
    const orgId = searchParams.get('orgId')

    if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })

    const { data, error } = await supabase
        .from('import_templates')
        .select('id, name, updated_at, normalized_headers')
        .eq('org_id', orgId)
        .order('updated_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ templates: data })
}

// POST /api/import/templates
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient()
        const payload = await req.json().catch(() => null)

        if (!payload) {
            return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
        }

        const { orgId, name, headers, mapping, defaults } = payload

        if (!orgId || !name || !headers || !mapping) {
            return NextResponse.json({ error: 'Missing required fields: orgId, name, headers, mapping' }, { status: 400 })
        }

        const strictSig = computeHeaderSignatureStrict(headers)
        const looseSig = computeHeaderSignatureLoose(headers)
        const normalized = headers.map(normalizeHeader)

        // Construct new template object
        const newTemplate = {
            org_id: orgId,
            name,
            header_signature_strict: strictSig,
            header_signature_loose: looseSig,
            normalized_headers: normalized,
            header_fingerprint: strictSig, // Required by DB constraint
            mapping_json: mapping,
            defaults_json: defaults || {},
            updated_at: new Date().toISOString()
        }

        const { data, error } = await supabase
            .from('import_templates')
            .insert(newTemplate)
            .select()
            .single()

        if (error) {
            console.error("Template insert error:", error)

            // Handle unique constraint violation
            if (error.code === '23505') { // Postgres unique_violation
                return NextResponse.json(
                    { error: 'A template with this exact header structure already exists.', code: 'CONFLICT' },
                    { status: 409 }
                )
            }
            return NextResponse.json(
                {
                    error: 'Database error saving template',
                    code: 'DB_ERROR',
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    pgCode: error.code
                },
                { status: 500 }
            )
        }

        return NextResponse.json({ template: data })
    } catch (e: any) {
        console.error("Unhandled API error in /api/import/templates:", e)
        return NextResponse.json(
            { error: 'Internal Server Error', message: e.message },
            { status: 500 }
        )
    }
}
