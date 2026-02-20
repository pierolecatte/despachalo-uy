'use server';

import { createClient } from '@/lib/supabase/server';
import { Database } from '@/types/database';

export type PricingActionState = {
    success: boolean;
    message?: string;
    snapshotId?: string;
    settlementId?: string;
};

/**
 * Trigger reprice for a shipment
 */
export async function repriceShipment(shipmentId: string, mode: 'REGENERATE_ALL' | 'FILL_MISSING'): Promise<PricingActionState> {
    const supabase = await createClient();

    try {
        const { data, error } = await supabase.rpc('reprice_shipment' as any, {
            p_shipment_id: shipmentId,
            p_regen_mode: mode
        });

        if (error) {
            console.error('Reprice Error:', error);
            return { success: false, message: error.message };
        }

        return { success: true, message: 'Pricing updated successfully', snapshotId: data as unknown as string };
    } catch (err) {
        return { success: false, message: 'Internal Server Error during reprice' };
    }
}

/**
 * Manually override a pricing line
 * This updates the line and then triggers a 'FILL_MISSING' reprice to update totals
 * without overwriting other auto-values.
 */
export async function overridePricingLine(
    lineId: string,
    newAmount: number,
    shipmentId: string,
    description?: string
): Promise<PricingActionState> {
    const supabase = await createClient();

    // 1. Update the line directly
    // Note: We might need a policy or simple update call. 
    // Ideally, we shouldn't edit successful snapshots, but `reprice` creates a new one.
    // However, for UX, we usually edit the *current* snapshot line then re-run reprice?
    // User requested: "Manual Override + 2 Buttons".
    // Strategy: 
    // The previous snapshot is immutable in theory, but we can update it if it's the "draft" 
    // OR we should insert a line into a new snapshot?
    // EASIER APPROACH for V1:
    // Update the line in the *current* snapshot, set is_manual=true, then call reprice(FILL_MISSING)
    // Reprice logic: "COPY MANUAL ... FROM OLD SNAPSHOT". 
    // So if we edit the OLD snapshot, the NEW snapshot will copy the edited value.

    // Check if locked first? Reprice checks lock, but we should check before update too.

    try {
        const { error } = await supabase.rpc('update_pricing_line_manual' as any, {
            p_line_id: lineId,
            p_amount: newAmount,
            p_description: description
        });

        if (error) {
            console.error('Update Manual Line Error:', error);
            return { success: false, message: error.message };
        }

        // 2. Trigger Reprice to propagate totals
        return await repriceShipment(shipmentId, 'FILL_MISSING');

    } catch (err: any) {
        return { success: false, message: err.message || 'Failed to override line' };
    }
}

/**
 * Upsert a reimbursable line (Flete Pago / Gastos)
 * Simplification: Adds a new manual line of type REIMBURSABLE
 */
export async function upsertReimbursable(
    shipmentId: string,
    amount: number,
    description: string = 'Flete Pago / Gasto'
): Promise<PricingActionState> {
    const supabase = await createClient();

    try {
        const { error } = await supabase.rpc('add_manual_line' as any, {
            p_shipment_id: shipmentId,
            p_line_type: 'REIMBURSABLE',
            p_amount: amount,
            p_description: description
        });

        if (error) throw error;

        return await repriceShipment(shipmentId, 'FILL_MISSING');
    } catch (err: any) {
        return { success: false, message: err.message };
    }
}


/**
 * Generate Settlement
 */
export async function generateSettlement(
    courierOrgId: string,
    senderOrgId: string,
    periodStart: string, // YYYY-MM-DD
    periodEnd: string
): Promise<PricingActionState> {
    const supabase = await createClient();

    try {
        const { data, error } = await supabase.rpc('generate_settlement' as any, {
            p_courier_org_id: courierOrgId,
            p_sender_org_id: senderOrgId,
            p_period_start: periodStart,
            p_period_end: periodEnd
        });

        if (error) throw error;

        if (!data) {
            return { success: false, message: 'No eligible shipments found for settlement.' };
        }

        return { success: true, message: 'Settlement generated', settlementId: data as unknown as string };

    } catch (err: any) {
        return { success: false, message: err.message };
    }
}

/**
 * Assign a zone to a shipment and trigger reprice.
 */
export async function assignZone(shipmentId: string, zoneId: string): Promise<PricingActionState> {
    const supabase = await createClient();

    // Check permission? Courier only. 
    // RLS on shipments update should handle it.

    // Updates zone_id using wrapper
    const { error } = await supabase.rpc('assign_zone' as any, {
        p_shipment_id: shipmentId,
        p_zone_id: zoneId
    });

    if (error) {
        console.error('Zone Assign Error:', error);
        return { success: false, message: 'Failed to assign zone: ' + error.message };
    }

    // Trigger reprice (FILL_MISSING should pick up the new zone and calculate Stop Fee)
    return await repriceShipment(shipmentId, 'REGENERATE_ALL'); // Regenerate to ensure rules are reapplied for the new zone
}
