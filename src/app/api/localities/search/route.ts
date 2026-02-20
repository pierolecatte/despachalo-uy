
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!query || query.trim().length < 2) {
        return NextResponse.json({ error: 'Query too short (min 2 chars)' }, { status: 400 });
    }

    const sanitizedQuery = query.trim();

    // Perform search joining with departments
    // We utilize the relationship. Assuming 'departamentos' is the table and 'localidades' references it.
    // If the foreign key is set up correctly in Supabase/Postgres, we can use select with nested resource.
    // 'departamentos' table, 'localidades' table.
    // Foreign key in localities is 'departamento_id' -> 'departamentos.id'.

    // Note: Supabase postgrest syntax for joining: select('*, departamentos(*)')

    const { data, error } = await supabase
        .from('localidades')
        .select(`
            id,
            name,
            departamento_id,
            departamentos (
                id,
                name
            )
        `)
        .ilike('name', `%${sanitizedQuery}%`)
        .order('name') // Simple ordering for now. Ideal: strict match first, but ILIKE %...% is standard.
        .limit(limit);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Flatten structure for easier frontend consumption
    const results = data.map((item: any) => ({
        id: item.id,
        name: item.name,
        department_id: item.departamento_id,
        department_name: item.departamentos?.name || 'Desconocido'
    }));

    return NextResponse.json(results);
}
