import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('organizations')
            .select('id, name, type')
            .eq('active', true)
            .order('name');

        if (error) {
            return NextResponse.json({ code: 'DB_ERROR', message: error.message }, { status: 500 });
        }

        return NextResponse.json({ organizations: data || [] }, { status: 200 });
    } catch (err) {
        console.error('[import/orgs] Error:', err);
        return NextResponse.json({ code: 'INTERNAL_ERROR', message: 'Error al obtener organizaciones.' }, { status: 500 });
    }
}
