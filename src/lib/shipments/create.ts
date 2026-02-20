import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { validateAndNormalizeShipment, ShipmentInsertExtended } from './validate-and-normalize';

export interface PackageInsert {
    index: number;
    size: 'chico' | 'mediano' | 'grande';
    weight_kg?: number | null;
    shipping_cost?: number | null;
    content_description?: string | null;
    fragile?: boolean;
}

export interface CreateShipmentResult {
    ok: boolean;
    data?: { id: string; tracking_code: string };
    error?: string;
    fieldErrors?: Record<string, string>;
}

/**
 * Creates a shipment and its packages atomically.
 * Uses the `create_shipment_with_packages` RPC.
 */
export async function createShipment(
    supabase: SupabaseClient<Database>,
    payload: any,
    packages?: PackageInsert[]
): Promise<CreateShipmentResult> {

    // 1. Validate & Normalize Shipment Data
    const validation = await validateAndNormalizeShipment(payload, supabase);

    if (!validation.ok) {
        return {
            ok: false,
            error: validation.message,
            fieldErrors: validation.fieldErrors
        };
    }

    const shipmentData = validation.data;

    // 2. Prepare Packages
    // If no packages provided, default to 1 based on shipment data
    let finalPackages: PackageInsert[] = packages || [];

    if (finalPackages.length === 0) {
        finalPackages.push({
            index: 1,
            size: (shipmentData.package_size as 'chico' | 'mediano' | 'grande') || 'mediano',
            weight_kg: shipmentData.weight_kg as number | null | undefined,
            shipping_cost: shipmentData.shipping_cost as number | null | undefined,
            content_description: shipmentData.description as string | null | undefined
        });
    }

    // Ensure package_count in shipment matches actual packages
    shipmentData.package_count = finalPackages.length;

    // 3. Call RPC
    // RPC expects JSONB, so we pass objects directly.
    // Note: RPC params are p_shipment_data, p_packages_data
    const { data, error } = await supabase.rpc('create_shipment_with_packages' as any, {
        p_shipment_data: shipmentData,
        p_packages_data: finalPackages
    } as any);

    if (error) {
        console.error('RPC create_shipment_with_packages error:', error);
        return { ok: false, error: `Error creating shipment: ${error.message}` };
    }

    // 4. Return Success
    // RPC returns { id, tracking_code }
    const result = data as { id: string; tracking_code: string };

    return {
        ok: true,
        data: result
    };
}
