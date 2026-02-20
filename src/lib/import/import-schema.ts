// ── Import target schema: all target fields that a source column can map to ──

export const TARGET_FIELDS = [
    'recipient_name',
    'recipient_phone',
    'recipient_email',
    'recipient_address',
    'department_name',
    'locality_name',
    'observations',
    'is_freight_paid',
    'freight_amount',
    'agency_name',
    'service_type',
    'package_size',
    'weight_kg',
    'shipping_cost',
    'content_description',
    'notes',
    '_ignore',
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number];

export interface ColumnMapping {
    sourceHeader: string;
    targetField: TargetField;
    transform?: string;
    confidence: number;
}

export interface MappingResult {
    mappings: ColumnMapping[];
    defaultsSuggested: Record<string, string>;
    questions: string[];
    notes: string[];
}

// ── Transform rules (deterministic, NOT AI) ────────────────────────────

const FREIGHT_PAID_TRUE = /^(flete\s*pago|pago|si|sí|1|true|yes)$/i;
const FREIGHT_PAID_FALSE = /^(no|0|false|flete\s*no\s*pago)$/i;

export function parseFreightPaid(value: string): boolean | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (FREIGHT_PAID_TRUE.test(trimmed)) return true;
    if (FREIGHT_PAID_FALSE.test(trimmed)) return false;
    return null; // unknown → warning
}

export function normalizePhone(value: string): string {
    if (!value) return '';
    // Remove spaces, dashes, dots, parentheses
    return value.replace(/[\s\-.()+]/g, '').trim();
}

export function trimValue(value: string): string {
    return (value ?? '').trim();
}

// ── Apply a single transform to a value ────────────────────────────────

export function applyTransform(
    value: string,
    targetField: TargetField,
): string | boolean | number | null {
    const trimmed = trimValue(value);

    switch (targetField) {
        case 'is_freight_paid':
            return parseFreightPaid(trimmed);
        case 'recipient_phone':
            return normalizePhone(trimmed);
        case 'freight_amount':
        case 'weight_kg':
        case 'shipping_cost':
            // Try parsing as number
            const num = parseFloat(trimmed.replace(',', '.'));
            return isNaN(num) ? null : num;
        default:
            return trimmed || null;
    }
}

// ── Apply full mapping to a row ────────────────────────────────────────

export function applyMappingToRow(
    row: Record<string, string>,
    mappings: ColumnMapping[],
): Record<string, string | boolean | number | null> {
    const result: Record<string, string | boolean | number | null> = {};

    for (const mapping of mappings) {
        if (mapping.targetField === '_ignore') continue;
        const rawValue = row[mapping.sourceHeader] ?? '';
        result[mapping.targetField] = applyTransform(rawValue, mapping.targetField);
    }

    return result;
}
