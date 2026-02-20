import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AuditLogTable from '@/components/audit/audit-table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export default async function AuditPage() {
    const supabase = await createClient()

    // Check auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    // Get user role
    const { data: userData } = await supabase
        .from('users')
        .select('role, org_id')
        .eq('auth_user_id', user.id)
        .single()

    if (!userData || (userData.role !== 'super_admin' && userData.role !== 'org_admin')) {
        redirect('/')
    }

    const isSuperAdmin = userData.role === 'super_admin'

    return (
        <div className="container mx-auto py-8">
            <h1 className="text-3xl font-bold text-zinc-50 mb-6">Panel de Auditoría</h1>

            <Tabs defaultValue={isSuperAdmin ? "global" : "my_org"} className="w-full">
                <TabsList className="bg-zinc-800 border-zinc-700">
                    {isSuperAdmin && (
                        <TabsTrigger value="global">Vista Global</TabsTrigger>
                    )}
                    <TabsTrigger value="my_org">Mi Organización</TabsTrigger>
                </TabsList>

                {isSuperAdmin && (
                    <TabsContent value="global" className="mt-6">
                        <AuditLogTable scope="global" />
                    </TabsContent>
                )}

                <TabsContent value="my_org" className="mt-6">
                    <AuditLogTable scope="my_org" />
                </TabsContent>
            </Tabs>
        </div>
    )
}
