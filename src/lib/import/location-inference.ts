export interface InferenceContext {
    departments: Array<{ id: number; name: string }>;
    localitiesByDept: Record<number, Array<{ id: number; name: string }>>;
}

interface InferenceResult {
    departmentId?: number;
    localityId?: number;
    localityManual?: string;
    deliveryType?: 'domicilio' | 'sucursal';
    confidence: number;
    warnings?: string[];
}

export function inferLocation(address: string, context: InferenceContext): InferenceResult {
    const result: InferenceResult = { confidence: 0 };
    if (!address) return result;

    // 1. Normalize
    const normalized = normalizeString(address);
    if (!normalized) return result;

    // 2. Parse Segments
    // We accept "-" "–" "—" "," as separators.
    let parts = normalized.split(/\s*[-–—,]\s*/).filter(p => p.length > 0);

    if (parts.length === 0) return result;

    // 3. Check for Delivery Type Keyword (Agencia/Sucursal) in LAST segment
    const lastPart = parts[parts.length - 1];
    const keywords = /^(agencia|sucursal|retiro|pickup|pick up)$/i;

    // Check match on last segment
    if (keywords.test(lastPart)) {
        result.deliveryType = 'sucursal';
        // Remove keyword from parts for location matching
        parts.pop();
    }

    if (parts.length === 0) return result; // Was just "Agencia"

    // 4. Match Department
    const candidateDepto = parts[0];
    const deptoMatch = context.departments.find(d => normalizeString(d.name) === candidateDepto);

    if (deptoMatch) {
        result.departmentId = deptoMatch.id;
        result.confidence = 0.5;

        // 5. Match Locality
        const deptLocalities = context.localitiesByDept[deptoMatch.id] || [];

        if (parts.length >= 2) {
            // Standard Case: "Depto - Localidad"
            const candidateLoc = parts[1];
            const locMatch = deptLocalities.find(l => normalizeString(l.name) === candidateLoc);

            if (locMatch) {
                result.localityId = locMatch.id;
                result.confidence = 1.0;
            } else {
                // If 2nd part exists but no match -> manual
                // But avoid setting keywords like "Agencia" as manual if we missed it earlier (though regex should catch it)
                if (!keywords.test(candidateLoc)) {
                    result.localityManual = parts[1]; // Use original casing if available? here we have normalized parts. 
                    // Ideally we should use original string parts, but for now normalized is safer for consistency.
                    // Actually let's try to map back to original segment if possible, or just capitalize.
                    // For simplicity, returning the normalized segment (formatted) might be better or just the raw one.
                    // Since we split valid normalized string, let's just title case it or leave as is.
                    // Actually user constraint says: "localityManual = ese candidato".
                    result.localityManual = toTitleCase(candidateLoc);
                    result.warnings = (result.warnings || []).concat(['locality_inferred_manual']);
                }
            }
        } else {
            // "Depto" only (or "Depto - Agencia" where Agencia was removed)
            // Try to find a locality matching the department name (Capital)
            const capitalMatch = deptLocalities.find(l => normalizeString(l.name) === normalizeString(deptoMatch.name));
            if (capitalMatch) {
                result.localityId = capitalMatch.id;
                result.confidence = 0.8;
            } else {
                // No capital found with same name -> set manual
                result.localityManual = deptoMatch.name;
                result.warnings = (result.warnings || []).concat(['locality_inferred_manual']);
            }
        }
    } else {
        result.warnings = (result.warnings || []).concat(['department_not_found']);
    }

    return result;
}

function normalizeString(str: string): string {
    return str
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Remove accents
}

function toTitleCase(str: string): string {
    return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}
