'use server';

import { createClient } from "@/lib/supabase/server";
import { ServiceTypeCode } from "@/types/pricing";
import { revalidatePath } from "next/cache";

export async function toggleServiceAction(serviceType: ServiceTypeCode, enabled: boolean) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Get Organization
    const { data: orgMember } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

    if (!orgMember) throw new Error("No organization found");

    const courierOrgId = orgMember.organization_id;

    const { error } = await supabase
        .from('courier_services' as any)
        .upsert({
            courier_org_id: courierOrgId,
            service_type: serviceType,
            is_enabled: enabled
        }, { onConflict: 'courier_org_id, service_type' });

    if (error) {
        console.error("Error toggling service:", error);
        throw new Error("Failed to update service");
    }

    revalidatePath('/admin/courier/services');
    return { success: true };
}
