import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { CadeteScanResponse } from '@/types/database'

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const codigo: string | undefined = body?.codigo

        // Validar input
        if (!codigo || typeof codigo !== 'string' || codigo.trim().length === 0) {
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Se requiere código de envío',
                    reassigned: false,
                    envioId: null,
                    cadeteId: null,
                } satisfies CadeteScanResponse,
                { status: 400 }
            )
        }

        const supabase = await createClient()

        // 1. Verificar autenticación
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'No autenticado',
                    reassigned: false,
                    envioId: null,
                    cadeteId: null,
                } satisfies CadeteScanResponse,
                { status: 401 }
            )
        }

        // 2. Verificar que el usuario es cadete
        const { data: actorUser, error: actorError } = await supabase
            .from('users')
            .select('id, org_id, role')
            .eq('auth_user_id', user.id)
            .single()

        if (actorError || !actorUser) {
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Usuario no encontrado en el sistema',
                    reassigned: false,
                    envioId: null,
                    cadeteId: null,
                } satisfies CadeteScanResponse,
                { status: 403 }
            )
        }

        if (actorUser.role !== 'cadete') {
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Solo cadetes pueden utilizar el escáner',
                    reassigned: false,
                    envioId: null,
                    cadeteId: null,
                } satisfies CadeteScanResponse,
                { status: 403 }
            )
        }

        // 3. Llamar a la RPC atómica (maneja todos los casos y logs internamente)
        const { data, error: rpcError } = await supabase.rpc('cadete_scan_envio', {
            p_tracking_code: codigo.trim(),
        })

        if (rpcError) {
            console.error('[CADETE-SCAN] RPC error:', rpcError)
            return NextResponse.json(
                {
                    status: 'error',
                    message: 'Error al procesar escaneo: ' + rpcError.message,
                    reassigned: false,
                    envioId: null,
                    cadeteId: null,
                } satisfies CadeteScanResponse,
                { status: 500 }
            )
        }

        // La RPC retorna JSON directamente
        const result = data as unknown as CadeteScanResponse

        // Determinar HTTP status basado en el resultado
        const httpStatus = result.status === 'error' ? 500
            : result.status === 'not_found' ? 404
                : 200

        return NextResponse.json(result, { status: httpStatus })

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[CADETE-SCAN] Crash:', message)
        return NextResponse.json(
            {
                status: 'error',
                message: 'Error interno del servidor',
                reassigned: false,
                envioId: null,
                cadeteId: null,
            } satisfies CadeteScanResponse,
            { status: 500 }
        )
    }
}
