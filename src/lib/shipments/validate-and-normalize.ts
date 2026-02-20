import { Database } from '@/types/database';
import { SupabaseClient } from '@supabase/supabase-js';

export type ShipmentInsert = Database['public']['Tables']['shipments']['Insert'];

export interface Warning {
    code: string;
    message: string;
}

export type FieldErrors = Record<string, string>;

export type ValidationResult =
    | { ok: true; data: ShipmentInsert; warnings?: Warning[] }
    | { ok: false; message: string; fieldErrors: FieldErrors };

// Extended type to include fields from recent migrations not yet in generated types
export type ShipmentInsertExtended = ShipmentInsert & {
    department_id?: number | null;
    locality_id?: number | null;
    locality_manual?: string | null;
};

export async function validateAndNormalizeShipment(
    input: unknown,
    supabase: SupabaseClient<Database>
): Promise<ValidationResult> {
    const data = input as Partial<ShipmentInsertExtended>;
    const fieldErrors: FieldErrors = {};

    // 1. Basic Field Extraction & Normalization
    let departmentId = data.department_id;
    const localityId = data.locality_id || null;
    const localityManual = data.locality_manual ? data.locality_manual.trim() : null;

    // 2. XOR Validation: locality_id vs locality_manual
    if (localityId && localityManual) {
        fieldErrors['locality'] = 'Ambiguous location: Provide either locality_id OR locality_manual, not both.';
    }

    if (!localityId && !localityManual) {
        fieldErrors['locality'] = 'Location required: Provide valid locality_id OR locality_manual.';
    }

    // 3. Conditional Validation & Data Enrichment
    if (localityId) {
        // Verify locality exists and get its department
        const { data: locality, error } = await supabase
            .from('localidades' as any)
            .select('departamento_id')
            .eq('id', localityId)
            .single();

        if (error || !locality) {
            fieldErrors['locality_id'] = 'Invalid locality_id';
        } else {
            // Auto-complete or Validate Department
            const loc = locality as { departamento_id: number };
            if (!departmentId) {
                departmentId = loc.departamento_id;
            } else if (String(departmentId) !== String(loc.departamento_id)) {
                fieldErrors['department_id'] = 'Mismatch: locality_id does not belong to the provided department_id';
            }
        }
    } else if (localityManual) {
        // Manual locality requires explicit department
        if (!departmentId) {
            fieldErrors['department_id'] = 'department_id is required when using manual locality.';
        }
    }

    // If there are errors, return them
    if (Object.keys(fieldErrors).length > 0) {
        return {
            ok: false,
            message: 'Validation failed',
            fieldErrors
        };
    }

    // 4. Construct Final Normalized Data
    const normalizedData = {
        ...data,
        department_id: departmentId,
        locality_id: localityId,
        locality_manual: localityManual,
    };

    return {
        ok: true,
        data: normalizedData as ShipmentInsertExtended // Cast to extended type
    };
}
