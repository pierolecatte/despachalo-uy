import { createClient } from "@/lib/supabase/server";
import { CourierModuleHeader } from "@/components/courier/courier-module-header";

export const dynamic = 'force-dynamic';

export default async function CourierAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');

    // Fetch available organizations
    let organizations: { id: string; name: string }[] = [];
    if (isSuperAdmin) {
        const { data: orgs } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('type', 'cadeteria')
            .eq('active', true)
            .order('name');
        organizations = orgs || [];
    } else {
        const { data: profile } = await supabase
            .from('users')
            .select('org_id, organizations!inner(id, name)')
            .eq('auth_user_id', user.id)
            .maybeSingle();

        if (profile?.organizations) {
            organizations = [profile.organizations as any];
        }
    }

    return (
        <div className="flex flex-col min-h-[calc(100vh-theme(spacing.16))] relative">
            <CourierModuleHeader organizations={organizations} />
            <div className="flex-1 mt-6">
                {children}
            </div>
        </div>
    );
}
