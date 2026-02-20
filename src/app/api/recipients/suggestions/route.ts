import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID_FIELDS = ['name', 'email', 'phone', 'address']

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const field = searchParams.get('field')
        const q = searchParams.get('q')
        const limit = Math.min(parseInt(searchParams.get('limit') || '8'), 10)

        // Validate params
        if (!field || !VALID_FIELDS.includes(field)) {
            return NextResponse.json(
                { error: 'Invalid field. Must be one of: name, email, phone, address' },
                { status: 400 }
            )
        }
        if (!q || q.trim().length < 2) {
            return NextResponse.json({ suggestions: [] })
        }

        const supabase = await createClient()

        // Verify authenticated session
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json(
                { error: 'No autorizado', details: authError?.message || 'No user session' },
                { status: 401 }
            )
        }

        // Get org_id from the users table
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('org_id, role')
            .eq('auth_user_id', user.id)
            .single()

        if (userError || !userData) {
            return NextResponse.json(
                { error: 'Usuario no encontrado', details: userError?.message },
                { status: 403 }
            )
        }

        // Super admins can search in any org (e.g. the selected remitente's org)
        const requestedOrgId = searchParams.get('org_id')
        const effectiveOrgId = (userData.role === 'super_admin' && requestedOrgId)
            ? requestedOrgId
            : userData.org_id

        // Call RPC — the function validates org_id internally too
        const { data, error } = await supabase.rpc('recipient_suggestions', {
            p_org_id: effectiveOrgId,
            p_field: field,
            p_query: q.trim(),
            p_limit: limit,
        })

        if (error) {
            console.error('[RPC ERROR]', JSON.stringify(error))
            return NextResponse.json(
                {
                    error: 'Error al buscar sugerencias',
                    rpc_error: error.message,
                    rpc_code: error.code,
                    rpc_hint: error.hint,
                    rpc_details: error.details,
                },
                { status: 500 }
            )
        }

        return NextResponse.json({ suggestions: data || [] })
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[ROUTE CRASH]', message)
        return NextResponse.json(
            { error: 'Error interno del servidor', crash: message },
            { status: 500 }
        )
    }
}
