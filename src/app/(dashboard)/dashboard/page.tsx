import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Página /dashboard — redirige al dashboard correcto según el rol del usuario
export default async function DashboardRedirect() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('users')
        .select('role, org_id')
        .eq('auth_user_id', user.id)
        .single()

    if (!profile) redirect('/login')

    // Redirigir según rol
    if (profile.role === 'super_admin') redirect('/admin')
    if (profile.role === 'cadete') redirect('/cadete')

    // org_admin y operador — depende del tipo de organización
    const { data: org } = await supabase
        .from('organizations')
        .select('type')
        .eq('id', profile.org_id)
        .single()

    const orgType = org?.type
    if (orgType === 'cadeteria') redirect('/cadeteria')
    if (orgType === 'agencia') redirect('/agencia')
    redirect('/remitente')
}
