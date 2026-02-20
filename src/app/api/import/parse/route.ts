import { NextRequest, NextResponse } from 'next/server';
import { parseImportFile, isParseError, MAX_FILE_SIZE } from '@/lib/import/parse-file';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const sheetName = formData.get('sheet_name') as string | null;

        if (!file) {
            return NextResponse.json(
                { code: 'INVALID_FILE', message: 'No se envió ningún archivo.' },
                { status: 400 }
            );
        }

        // File size check
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                {
                    code: 'FILE_TOO_LARGE',
                    message: `El archivo excede el límite de ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB.`,
                },
                { status: 400 }
            );
        }

        const buffer = await file.arrayBuffer();
        const result = parseImportFile(buffer, file.name, sheetName || undefined);

        if (isParseError(result)) {
            return NextResponse.json(result, { status: 400 });
        }

        return NextResponse.json(result, { status: 200 });
    } catch (err) {
        console.error('[import/parse] Unexpected error:', err);
        return NextResponse.json(
            { code: 'INTERNAL_ERROR', message: 'Error interno al procesar el archivo.' },
            { status: 500 }
        );
    }
}
