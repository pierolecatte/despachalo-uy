
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { createShipment, PackageInsert } from '@/lib/shipments/create';

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const payload = await request.json();

        // payload should contain 'packages' array if it's a multi-package shipment
        // or just flat fields if legacy/simple UI
        const packages = payload.packages as PackageInsert[] || [];

        // Call unified service
        const result = await createShipment(supabase, payload, packages);

        if (!result.ok) {
            // Determine status code based on error type (validation vs internal)
            // Ideally service returns error codes, but for now 400 for validation, 500 for others
            const status = result.fieldErrors ? 400 : 500;
            return NextResponse.json({
                code: result.fieldErrors ? 'VALIDATION_ERROR' : 'CREATE_ERROR',
                message: result.error || 'Error creating shipment',
                fieldErrors: result.fieldErrors
            }, { status });
        }

        return NextResponse.json(result.data, { status: 201 });

    } catch (e) {
        console.error('API Error:', e);
        return NextResponse.json({
            code: 'INTERNAL_ERROR',
            message: e instanceof Error ? e.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ message: 'Shipments API — POST implemented for validation' })
}
