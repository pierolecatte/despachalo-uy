import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeHeaderSignatureStrict, computeHeaderSignatureLoose, normalizeHeader } from '@/lib/import/templates'

// PATCH /api/import/templates/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { id } = await params
    const payload = await req.json()

    // Check if we need to recompute signatures
    let updates: any = { ...payload, updated_at: new Date().toISOString() }

    if (payload.headers) {
        // If headers change, we must update signatures and normalized_headers
        updates.header_signature_strict = computeHeaderSignatureStrict(payload.headers)
        updates.header_signature_loose = computeHeaderSignatureLoose(payload.headers)
        updates.normalized_headers = payload.headers.map(normalizeHeader)
        // Remove raw headers from payload as they are not stored directly 
        // (we stored normalized_headers, and strict/loose sigs)
        delete updates.headers
    }

    // Map mapping/defaults to json columns if present
    if (payload.mapping) {
        updates.mapping_json = payload.mapping
        delete updates.mapping
    }
    if (payload.defaults) {
        updates.defaults_json = payload.defaults
        delete updates.defaults
    }

    const { data, error } = await supabase
        .from('import_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error) {
        if (error.code === '23505') {
            return NextResponse.json(
                { error: 'Another template with this header structure already exists.', code: 'CONFLICT' },
                { status: 409 }
            )
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ template: data })
}
