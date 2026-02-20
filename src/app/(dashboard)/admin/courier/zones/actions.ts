'use server'

import { createClient, getPricingClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { validateCourierAction } from "@/lib/auth/get-courier-org"

export async function importZoneTemplateAction(templateId: string, courierOrgId: string) {
    await validateCourierAction(courierOrgId);

    const pricingClient = await getPricingClient();

    const { data: count, error } = await pricingClient.rpc('import_zone_template', {
        p_template_id: templateId,
        p_courier_org_id: courierOrgId
    });

    if (error) {
        console.error("Error importing template:", error);
        throw new Error(error.message);
    }

    revalidatePath('/admin/courier/zones');
    return { count };
}

export async function getActiveTemplates() {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('zone_templates')
        .select('id, name, description, region')
        .eq('is_active', true)
        .order('name');

    if (error) {
        console.error("Error fetching templates:", error);
        return [];
    }
    return data;
}

export async function createZoneAction(formData: FormData) {
    const courierOrgId = formData.get('courier_org_id') as string;
    const validatedOrgId = await validateCourierAction(courierOrgId);

    const pricingClient = await getPricingClient();

    const name = formData.get('name') as string;
    const is_active = formData.get('is_active') === 'true';
    let senderId = formData.get('sender_org_id') as string;
    if (senderId === '__none__') senderId = '';
    const geojsonStr = formData.get('geojson') as string;

    if (!name || !geojsonStr) {
        throw new Error("Missing name or geojson");
    }

    let geojson;
    try {
        geojson = JSON.parse(geojsonStr);
    } catch (e) {
        throw new Error("Invalid GeoJSON format");
    }

    // 1. Create Zone via RPC
    const { data: result, error: zoneError } = await pricingClient.rpc('create_zone_from_geojson', {
        p_courier_org_id: validatedOrgId,
        p_sender_org_id: senderId || null,
        p_name: name,
        p_geojson: geojson
    });

    if (zoneError || !result || !result.id) {
        console.error("Create zone error:", zoneError);
        throw new Error("Failed to create zone: " + (zoneError?.message || "Unknown error"));
    }

    revalidatePath('/admin/courier/zones');
    return { success: true, zoneId: result.id, geojson: result.geojson };
}

export async function updateZoneAction(formData: FormData) {
    const courierOrgId = formData.get('courier_org_id') as string;
    const validatedOrgId = await validateCourierAction(courierOrgId);

    const pricingClient = await getPricingClient();

    const id = formData.get('id') as string;
    const name = formData.get('name') as string;
    const is_active = formData.get('is_active') === 'true';
    let senderId = formData.get('sender_org_id') as string;
    if (senderId === '__none__') senderId = '';
    const geojsonStr = formData.get('geojson') as string;

    if (!id || !name || !geojsonStr) {
        throw new Error("Missing required fields");
    }

    let geojson;
    try {
        geojson = JSON.parse(geojsonStr);
    } catch (e) {
        throw new Error("Invalid GeoJSON format");
    }

    // Since our RPC is only for creating, we update fields manually,
    // intercepting the GeoJSON cast using another RPC or direct SQL if possible.
    // However, updating geometry from JSON directly via JS client in PostgREST is tricky due to types.
    // Wait... if `geojson` is just a computed column, and the real column is `geom geometry`, we can't easily 
    // update `geom` directly via Supabase client without a PostGIS cast like `ST_GeomFromGeoJSON`.
    // Let's create an RPC for update or we can just delete and recreate?
    // Let's check if we can call a new RPC `update_zone_from_geojson` or if I can just write it.
    // I MUST CREATE `pricing.update_zone_from_geojson` in the DB.

    // For now, let's call `pricing.update_zone_from_geojson`
    const { data: result, error: updateError } = await pricingClient.rpc('update_zone_from_geojson', {
        p_zone_id: id,
        p_courier_org_id: validatedOrgId,
        p_sender_org_id: senderId || null,
        p_name: name,
        p_is_active: is_active,
        p_geojson: geojson
    });

    if (updateError || !result || !result.id) {
        console.error("Update zone error:", updateError);
        throw new Error("Failed to update zone: " + (updateError?.message || "Unknown error"));
    }

    revalidatePath('/admin/courier/zones');
    return { success: true, zoneId: result.id, geojson: result.geojson };
}

export async function deleteZoneAction(zoneId: string, courierOrgId: string) {
    await validateCourierAction(courierOrgId);

    const pricingClient = await getPricingClient();
    const { error } = await pricingClient.from('zones' as any).delete().eq('id', zoneId);

    if (error) {
        console.error("Delete error:", error);
        throw new Error(error.message);
    }

    revalidatePath('/admin/courier/zones');
    return { success: true };
}
