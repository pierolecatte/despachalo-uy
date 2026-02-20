'use server';

import { createClient, getPricingClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { validateCourierAction } from "@/lib/auth/get-courier-org";

export async function createTariffSetAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        console.error("createTariffSet: No user authenticated");
        return { error: "Not authenticated" };
    }

    const courierOrgId = formData.get('courier_org_id') as string;

    console.log("createTariffSet - User:", user.id);
    console.log("createTariffSet - Raw CourierOrgId:", courierOrgId);

    let validatedOrgId: string;
    try {
        validatedOrgId = await validateCourierAction(courierOrgId);
        console.log("createTariffSet - Validated OrgId:", validatedOrgId);
    } catch (error: any) {
        console.error("createTariffSet - validateCourierAction error:", error);
        return { error: `Validation Error: ${error.message}` };
    }

    const name = formData.get('name') as string;
    const scope = formData.get('scope') as string;
    const senderId = formData.get('sender_org_id') as string;

    if (!name || !scope) {
        return { error: "Missing fields" };
    }

    const payload: any = {
        courier_org_id: validatedOrgId,
        name,
        scope,
        is_active: true
    };

    if (scope === 'BY_SENDER') {
        if (!senderId) return { error: "Sender required for Customer Specific tariff" };
        payload.sender_org_id = senderId;
    }

    console.log("createTariffSet - Target Table: tariff_sets");
    console.log("createTariffSet - Payload:", JSON.stringify({ ...payload, sender_org_id: payload.sender_org_id ? 'PROVIDED' : undefined }, null, 2));

    const pricingDb = await getPricingClient();
    const { error } = await pricingDb.from('tariff_sets' as any).insert(payload);

    if (error) {
        if (error.code === '23505') {
            console.log("createTariffSet - Duplicate detected. Finding existing ID.");
            let query = pricingDb
                .from('tariff_sets' as any)
                .select('id')
                .eq('courier_org_id', validatedOrgId)
                .eq('scope', scope);

            if (scope === 'BY_SENDER' && senderId) {
                query = query.eq('sender_org_id', senderId);
            } else {
                query = query.is('sender_org_id', null);
            }

            const { data: existing } = await query.maybeSingle();

            if (existing) {
                return { success: true, redirectUrl: `/admin/courier/tariffs/${existing.id}?org=${validatedOrgId}` };
            }
        }

        console.error('createTariffSet supabase error', {
            code: error.code, message: error.message, details: error.details, hint: error.hint, payload: payload
        });
        return { error: `Failed to create tariff set: Code: ${error.code} | Message: ${error.message} | Details: ${error.details ?? ''} | Hint: ${error.hint ?? ''}` };
    }

    revalidatePath('/admin/courier/tariffs');
    return { success: true, redirectUrl: `/admin/courier/tariffs?org=${validatedOrgId}` };
}
