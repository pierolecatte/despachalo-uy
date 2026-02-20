
import { createClient } from '@/lib/supabase/server';

/**
 * Checks if a shipment is a duplicate based on tracking code (if present) or a 72h fingerprint match.
 */
export async function checkDuplicate(
    supabase: Awaited<ReturnType<typeof createClient>>,
    remitenteOrgId: string,
    mapped: Record<string, unknown>,
    serviceTypeId: string | null,
    agencyId?: string | null,
    deliveryType?: 'domicilio' | 'sucursal' | null
): Promise<{ isDuplicate: boolean; shipmentId?: string; reason?: string }> {

    // 1. Check Tracking Code (if present)
    if (mapped.tracking_code) {
        const { data: existingTC } = await supabase
            .from('shipments')
            .select('id')
            .eq('remitente_org_id', remitenteOrgId)
            .eq('tracking_code', mapped.tracking_code)
            .maybeSingle();

        if (existingTC) {
            return {
                isDuplicate: true,
                shipmentId: existingTC.id,
                reason: `Tracking Code "${mapped.tracking_code}" ya existe`
            };
        }
    }

    // 2. Check Fingerprint (last 72h)
    // Fields: phone, address, service_type, agency_id, delivery_type.
    const timestamp72h = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    let query = supabase
        .from('shipments')
        .select('id')
        .eq('remitente_org_id', remitenteOrgId)
        .gt('created_at', timestamp72h)
        .eq('service_type_id', serviceTypeId);

    if (mapped.recipient_phone) query = query.eq('recipient_phone', mapped.recipient_phone);
    if (mapped.recipient_address) query = query.eq('recipient_address', mapped.recipient_address);
    if (agencyId) query = query.eq('agency_id', agencyId);
    if (deliveryType) query = query.eq('delivery_type', deliveryType);

    const { data: duplicates } = await query.limit(1);

    if (duplicates && duplicates.length > 0) {
        return {
            isDuplicate: true,
            shipmentId: duplicates[0].id,
            reason: 'Duplicado detectado (últimas 72hs)'
        };
    }

    return { isDuplicate: false };
}
