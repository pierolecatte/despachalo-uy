import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeFingerprint, computeFingerprintSorted, normalizeHeader } from '@/lib/import/fingerprint';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { org_id, headers } = body as {
            org_id: string;
            headers: string[];
        };

        if (!org_id || !headers?.length) {
            return NextResponse.json(
                { code: 'INVALID_INPUT', message: 'org_id y headers son requeridos.' },
                { status: 400 }
            );
        }

        const fp = computeFingerprint(headers);
        const fpSorted = computeFingerprintSorted(headers);

        const supabase = await createClient();

        // 1. Try exact match (same order)
        const { data: exactMatch } = await supabase
            .from('import_templates' as string)
            .select('id, name, mapping_json, defaults_json, entity_resolutions_json')
            .eq('org_id', org_id)
            .eq('header_fingerprint', fp)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        if (exactMatch) {
            return NextResponse.json({
                found: true,
                template: exactMatch,
                matchType: 'exact',
            }, { status: 200 });
        }

        // 2. Try sorted fallback (same headers, different order)
        const { data: sortedMatch } = await supabase
            .from('import_templates' as string)
            .select('id, name, mapping_json, defaults_json, entity_resolutions_json')
            .eq('org_id', org_id)
            .eq('header_fingerprint_sorted', fpSorted)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single();

        if (sortedMatch) {
            return NextResponse.json({
                found: true,
                template: sortedMatch,
                matchType: 'sorted_fallback',
                note: 'Las columnas son las mismas pero en distinto orden. Los mappings pueden necesitar ajuste.',
            }, { status: 200 });
        }

        // 3. No match
        return NextResponse.json({ found: false }, { status: 200 });
    } catch (err) {
        console.error('[templates/resolve] Error:', err);
        return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error interno.' }, { status: 500 });
    }
}
