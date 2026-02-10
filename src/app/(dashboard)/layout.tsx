import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardShell } from '@/components/dashboard/dashboard-shell'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    // Obtener perfil del usuario con su organización
    const { data: profile } = await supabase
        .from('users')
        .select('*, organizations(*)')
        .eq('auth_user_id', user.id)
        .single()

    // Si no tiene perfil en nuestra tabla, es un usuario nuevo sin configurar
    if (!profile) {
        // Por ahora redirigimos al login. En producción, iría a un onboarding.
        redirect('/login')
    }

    return (
        <DashboardShell user={profile}>
            {children}
        </DashboardShell>
    )
}
