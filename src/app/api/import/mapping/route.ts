import { NextRequest, NextResponse } from 'next/server';
import { GeminiProvider } from '@/lib/ai/gemini';
import { HeuristicsProvider } from '@/lib/ai/heuristics';
import { MappingResult } from '@/lib/import/import-schema';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { headers, sampleObjects, requiredCandidates, orgContext } = body as {
            headers: string[];
            sampleObjects: Record<string, string>[];
            requiredCandidates?: string[];
            orgContext?: { remitenteName?: string };
        };

        if (!headers?.length || !sampleObjects?.length) {
            return NextResponse.json(
                { code: 'INVALID_INPUT', message: 'Se requieren headers y sampleObjects.' },
                { status: 400 }
            );
        }

        const geminiKey = process.env.GEMINI_API_KEY;
        let result: MappingResult;
        let providerUsed: 'gemini' | 'heuristics' = 'heuristics';
        const warnings: { code: string; message: string }[] = [];

        if (geminiKey) {
            try {
                const provider = new GeminiProvider(geminiKey);
                result = await provider.suggestMapping(headers, sampleObjects, { requiredCandidates, remitenteName: orgContext?.remitenteName });
                providerUsed = 'gemini';
            } catch (error) {
                console.error('[import/mapping] Gemini error, falling back to heuristics:', error);

                // Fallback to heuristics
                const provider = new HeuristicsProvider();
                result = await provider.suggestMapping(headers, sampleObjects, { requiredCandidates, remitenteName: orgContext?.remitenteName });
                providerUsed = 'heuristics';

                // Determine warning code based on error
                let warningCode = 'AI_ERROR';
                if (String(error).includes('429')) warningCode = 'AI_RATE_LIMIT';
                if (String(error).includes('401') || String(error).includes('403')) warningCode = 'AI_AUTH_ERROR';

                warnings.push({
                    code: warningCode,
                    message: `Error con IA (${warningCode}), usando mapeo heurístico. Detalles: ${String(error)}`
                });
            }
        } else {
            // No key configured
            const provider = new HeuristicsProvider();
            result = await provider.suggestMapping(headers, sampleObjects, { requiredCandidates, remitenteName: orgContext?.remitenteName });
            providerUsed = 'heuristics';
            warnings.push({ code: 'AI_NOT_CONFIGURED', message: 'IA no configurada. Usando detección automática básica (heurísticas).' });
        }

        return NextResponse.json({
            providerUsed,
            mapping: result,
            warnings
        }, { status: 200 });

    } catch (err: unknown) {
        console.error('[import/mapping] Internal Error:', err);
        return NextResponse.json(
            { code: 'INTERNAL_ERROR', message: `Error interno al generar el mapping: ${String(err)}` },
            { status: 500 }
        );
    }
}
