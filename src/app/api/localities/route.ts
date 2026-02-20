
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const department_id = searchParams.get('department_id');

    if (!department_id) {
        return NextResponse.json({ error: 'department_id is required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('localidades')
        .select('*')
        .eq('departamento_id', department_id)
        .order('name', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}
