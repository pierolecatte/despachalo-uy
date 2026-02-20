'use server';

import { createClient } from "@/lib/supabase/server";
import { ServiceTypeCode } from "@/types/pricing";
import { revalidatePath } from "next/cache";
import { validateCourierAction } from "@/lib/auth/get-courier-org";

export async function toggleServiceAction(serviceType: ServiceTypeCode, enabled: boolean, courierOrgId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    // Validate request
    const validatedOrgId = await validateCourierAction(courierOrgId);

    const { error } = await supabase
        .from('courier_services' as any)
        .upsert({
            courier_org_id: validatedOrgId,
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
