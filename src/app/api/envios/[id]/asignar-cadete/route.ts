import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { AsignarCadeteResponse } from '@/types/database'

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: envioId } = await params
        const body = await req.json()
        const cadeteId: string | undefined = body?.cadete_id

        // Validar input
        if (!cadeteId || typeof cadeteId !== 'string') {
            return NextResponse.json(
                { status: 'error', message: 'Se requiere cadete_id (UUID)' } satisfies AsignarCadeteResponse,
                { status: 400 }
            )
        }

        const supabase = await createClient()

        // 1. Verificar autenticación
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json(
                { status: 'error', message: 'No autenticado' } satisfies AsignarCadeteResponse,
                { status: 401 }
            )
        }

        // 2. Verificar rol del usuario (solo admin/org_admin pueden asignar manualmente)
        const { data: actorUser, error: actorError } = await supabase
            .from('users')
            .select('id, org_id, role')
            .eq('auth_user_id', user.id)
            .single()

        if (actorError || !actorUser) {
            return NextResponse.json(
                { status: 'error', message: 'Usuario no encontrado en el sistema' } satisfies AsignarCadeteResponse,
                { status: 403 }
            )
        }

        if (actorUser.role !== 'super_admin' && actorUser.role !== 'org_admin') {
            return NextResponse.json(
                { status: 'error', message: 'Solo administradores pueden asignar cadetes manualmente' } satisfies AsignarCadeteResponse,
                { status: 403 }
            )
        }

        // 3. Cargar el envío
        const { data: envio, error: envioError } = await supabase
            .from('shipments')
            .select('id, cadeteria_org_id, cadete_user_id')
            .eq('id', envioId)
            .single()

        if (envioError || !envio) {
            return NextResponse.json(
                { status: 'error', message: 'Envío no encontrado' } satisfies AsignarCadeteResponse,
                { status: 404 }
            )
        }

        if (!envio.cadeteria_org_id) {
            return NextResponse.json(
                { status: 'error', message: 'El envío no tiene cadetería asignada' } satisfies AsignarCadeteResponse,
                { status: 400 }
            )
        }

        // 4. Cargar el cadete candidato
        const { data: cadete, error: cadeteError } = await supabase
            .from('users')
            .select('id, org_id, role, active')
            .eq('id', cadeteId)
            .single()

        if (cadeteError || !cadete) {
            return NextResponse.json(
                { status: 'error', message: 'Cadete no encontrado' } satisfies AsignarCadeteResponse,
                { status: 404 }
            )
        }

        if (cadete.role !== 'cadete') {
            return NextResponse.json(
                { status: 'error', message: 'El usuario especificado no tiene rol de cadete' } satisfies AsignarCadeteResponse,
                { status: 400 }
            )
        }

        if (!cadete.active) {
            return NextResponse.json(
                { status: 'error', message: 'El cadete no está activo' } satisfies AsignarCadeteResponse,
                { status: 400 }
            )
        }

        // 5. VALIDACIÓN CRÍTICA: cadete debe pertenecer a la misma cadetería del envío
        if (cadete.org_id !== envio.cadeteria_org_id) {
            return NextResponse.json(
                { status: 'error', message: 'El cadete no pertenece a la cadetería asignada al envío' } satisfies AsignarCadeteResponse,
                { status: 400 }
            )
        }

        // 6. Actualizar envío (el trigger DB también valida la misma regla)
        const cadeteAnteriorId = envio.cadete_user_id
        const { error: updateError } = await supabase
            .from('shipments')
            .update({ cadete_user_id: cadeteId })
            .eq('id', envioId)

        if (updateError) {
            console.error('[ASIGNAR-CADETE] Update error:', updateError)
            return NextResponse.json(
                { status: 'error', message: 'Error al actualizar el envío: ' + updateError.message } satisfies AsignarCadeteResponse,
                { status: 500 }
            )
        }

        // 7. Registrar auditoría
        const motivo = cadeteAnteriorId ? 'asignacion_manual' : 'asignacion_manual'
        const { error: logError } = await supabase
            .from('envio_asignaciones_log')
            .insert({
                envio_id: envioId,
                cadeteria_org_id: envio.cadeteria_org_id,
                cadete_anterior_id: cadeteAnteriorId,
                cadete_nuevo_id: cadeteId,
                motivo,
                actor_user_id: user.id,
            })

        if (logError) {
            // No fallar por error de log, pero registrar
            console.error('[ASIGNAR-CADETE] Log error:', logError)
        }

        return NextResponse.json({
            status: 'ok',
            message: cadeteAnteriorId
                ? 'Cadete reasignado correctamente'
                : 'Cadete asignado correctamente',
            envioId,
            cadeteId,
        } satisfies AsignarCadeteResponse)

    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ASIGNAR-CADETE] Crash:', message)
        return NextResponse.json(
            { status: 'error', message: 'Error interno del servidor' } satisfies AsignarCadeteResponse,
            { status: 500 }
        )
    }
}
