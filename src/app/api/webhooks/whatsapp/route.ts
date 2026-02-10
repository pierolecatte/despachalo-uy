// Placeholder — Webhook de WhatsApp (se implementa en Etapa 4)
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    // WhatsApp webhook verification
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return new Response(challenge, { status: 200 })
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function POST() {
    return NextResponse.json({ message: 'Webhook received' })
}
