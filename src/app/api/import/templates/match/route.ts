import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { computeHeaderSignatureStrict, computeHeaderSignatureLoose, scoreTemplateMatch, normalizeHeader } from '@/lib/import/templates'

export async function POST(req: NextRequest) {
    const supabase = await createClient()
    const { orgId, headers } = await req.json()

    if (!orgId || !headers || !Array.isArray(headers)) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // 1. Compute signatures for the uploaded file
    const strictSig = computeHeaderSignatureStrict(headers)
    const looseSig = computeHeaderSignatureLoose(headers)
    const normalized = headers.map(normalizeHeader)

    try {
        // 2. Try to find EXACT match by Strict Signature
        const { data: exactMatch } = await supabase
            .from('import_templates')
            .select('*')
            .eq('org_id', orgId)
            .eq('header_signature_strict', strictSig)
            .single()

        if (exactMatch) {
            return NextResponse.json({
                exact: exactMatch,
                suggestions: [],
                headerSignatureStrict: strictSig,
                headerSignatureLoose: looseSig
            })
        }

        // 3. If no exact match, find suggestions
        // Strategy: Fetch all templates for this org (optimized: maybe fetch only relevant fields)
        // For a large system we might filter by loose signature in DB, but Jaccard is better done in memory or with pg_trgm
        const { data: allTemplates } = await supabase
            .from('import_templates')
            .select('*')
            .eq('org_id', orgId)

        const suggestions = (allTemplates || [])
            .map(t => ({
                template: t,
                score: scoreTemplateMatch(t.normalized_headers || [], normalized)
            }))
            .filter(item => item.score > 0.5) // Threshold
            .sort((a, b) => b.score - a.score)
            .slice(0, 3) // Top 3

        return NextResponse.json({
            exact: null,
            suggestions,
            headerSignatureStrict: strictSig,
            headerSignatureLoose: looseSig
        })

    } catch (error) {
        console.error('Template match error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
