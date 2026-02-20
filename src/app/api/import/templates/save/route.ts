import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeFingerprint, computeFingerprintSorted, normalizeHeader } from '@/lib/import/fingerprint';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { org_id, name, headers, mappingFinal, defaultsChosen, entityResolutions } = body as {
            org_id: string;
            name?: string;
            headers: string[];
            mappingFinal: unknown;
            defaultsChosen: unknown;
            entityResolutions?: unknown;
        };

        if (!org_id || !headers?.length || !mappingFinal) {
            return NextResponse.json(
                { code: 'INVALID_INPUT', message: 'org_id, headers, y mappingFinal son requeridos.' },
                { status: 400 }
            );
        }

        const fp = computeFingerprint(headers);
        const fpSorted = computeFingerprintSorted(headers);
        const headersNormalized = headers.map(normalizeHeader);
        const templateName = name || 'Default';

        const supabase = await createClient();

        // Upsert: update if same org_id + fingerprint + name, insert otherwise
        const { data, error } = await supabase
            .from('import_templates' as string)
            .upsert(
                {
                    org_id,
                    name: templateName,
                    header_fingerprint: fp,
                    header_fingerprint_sorted: fpSorted,
                    headers_normalized: headersNormalized,
                    mapping_json: mappingFinal,
                    defaults_json: defaultsChosen || {},
                    entity_resolutions_json: entityResolutions || null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'org_id,header_fingerprint,name' }
            )
            .select('id, name')
            .single();

        if (error) {
            console.error('[templates/save] DB error:', error);
            return NextResponse.json({ code: 'DB_ERROR', message: error.message }, { status: 500 });
        }

        return NextResponse.json({
            saved: true,
            template: data,
        }, { status: 200 });
    } catch (err) {
        console.error('[templates/save] Error:', err);
        return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error interno.' }, { status: 500 });
    }
}
