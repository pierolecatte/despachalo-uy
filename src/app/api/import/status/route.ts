import { NextResponse } from 'next/server';

export async function GET() {
    const hasGemini = !!process.env.GEMINI_API_KEY;

    return NextResponse.json({
        aiConfigured: hasGemini,
        provider: hasGemini ? 'gemini' : 'heuristics',
        // We can expose the reason if needed, but 'provider' is sufficient for UI logic
    }, { status: 200 });
}
