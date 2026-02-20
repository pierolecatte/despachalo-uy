'use server';

import { createClient, getPricingClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function createTariffRuleAction(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Not authenticated" };
    }

    const tariff_set_id = formData.get('tariff_set_id') as string;
    const service_type = formData.get('service_type') as string;
    const rule_kind = formData.get('rule_kind') as string;
    const amountStr = formData.get('amount') as string;
    const zone_id = formData.get('zone_id') as string | null;
    const package_size = formData.get('package_size') as string | null;

    if (!tariff_set_id || !service_type || !rule_kind || !amountStr) {
        return { error: "Faltan campos obligatorios." };
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
        return { error: "El importe debe ser un número válido." };
    }

    if (package_size && package_size !== 'none') {
        const allowedSizes = ['chico', 'mediano', 'grande', 'especial'];
        if (!allowedSizes.includes(package_size)) {
            return { error: `Tamaño de paquete inválido. Valores permitidos: ${allowedSizes.join(', ')}` };
        }
    }

    const payload: any = {
        tariff_set_id,
        service_type,
        rule_kind,
        amount,
        currency: 'UYU',
        is_active: true
    };

    if (zone_id && zone_id !== 'none') payload.zone_id = zone_id;
    if (package_size && package_size !== 'none') payload.package_size = package_size;

    const pricingDb = await getPricingClient();
    const { error } = await pricingDb.from('tariff_rules' as any).insert(payload);

    if (error) {
        console.error('createTariffRule error:', error);
        return { error: `Error al crear regla: ${error.message} (Code: ${error.code})` };
    }

    revalidatePath(`/admin/courier/tariffs/${tariff_set_id}`);
    return { success: true };
}

export async function updateTariffRuleAction(rule_id: string, formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const tariff_set_id = formData.get('tariff_set_id') as string;
    const service_type = formData.get('service_type') as string;
    const rule_kind = formData.get('rule_kind') as string;
    const amountStr = formData.get('amount') as string;
    const zone_id = formData.get('zone_id') as string | null;
    const package_size = formData.get('package_size') as string | null;

    if (!tariff_set_id || !service_type || !rule_kind || !amountStr) {
        return { error: "Faltan campos obligatorios." };
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return { error: "El importe debe ser un número válido." };

    if (package_size && package_size !== 'none') {
        const allowedSizes = ['chico', 'mediano', 'grande', 'especial'];
        if (!allowedSizes.includes(package_size)) {
            return { error: `Tamaño de paquete inválido. Valores permitidos: ${allowedSizes.join(', ')}` };
        }
    }

    const payload: any = {
        service_type,
        rule_kind,
        amount,
        zone_id: zone_id && zone_id !== 'none' ? zone_id : null,
        package_size: package_size && package_size !== 'none' ? package_size : null,
    };

    const pricingDb = await getPricingClient();
    const { error } = await pricingDb.from('tariff_rules' as any).update(payload).eq('id', rule_id);

    if (error) {
        console.error('updateTariffRule error:', error);
        return { error: `Error al actualizar regla: ${error.message}` };
    }

    revalidatePath(`/admin/courier/tariffs/${tariff_set_id}`);
    return { success: true };
}

export async function deleteTariffRuleAction(rule_id: string, tariff_set_id: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const pricingDb = await getPricingClient();
    const { error } = await pricingDb.from('tariff_rules' as any).delete().eq('id', rule_id);

    if (error) {
        console.error('deleteTariffRule error:', error);
        return { error: `Error al eliminar: ${error.message}` };
    }

    revalidatePath(`/admin/courier/tariffs/${tariff_set_id}`);
    return { success: true };
}

export async function duplicateTariffRuleAction(rule_id: string, tariff_set_id: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: "Not authenticated" };

    const pricingDb = await getPricingClient();
    const { data: rule, error: fetchError } = await pricingDb
        .from('tariff_rules' as any)
        .select('*')
        .eq('id', rule_id)
        .single();

    if (fetchError || !rule) return { error: "Rule not found" };

    const { id, created_at, ...payload } = rule;
    const { error: insertError } = await pricingDb.from('tariff_rules' as any).insert(payload);

    if (insertError) {
        return { error: `Error duplicando: ${insertError.message}` };
    }

    revalidatePath(`/admin/courier/tariffs/${tariff_set_id}`);
    return { success: true };
}
