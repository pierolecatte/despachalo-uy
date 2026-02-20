import { createHash } from 'crypto'

export interface TemplateSummary {
    id: string
    name: string
    org_id: string
    updated_at: string
    header_signature_strict: string
    header_signature_loose: string
}

export interface Template extends TemplateSummary {
    mapping: any
    defaults: any
    normalized_headers: string[]
}

/**
 * Normalizes a header string for consistent comparison.
 * - Lowercase
 * - Trim whitespace
 * - Remove accents/diacritics
 * - Replace multiple spaces/underscores/dashes with single space
 * - Remove common punctuation
 */
export function normalizeHeader(h: string): string {
    if (!h) return ''

    return h
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
        .replace(/[.,:;()_/-]/g, " ") // replace punctuation with space
        .replace(/\s+/g, " ") // collapse multiple spaces
        .trim()
}

/**
 * Computes a strict signature: SHA256 of normalized headers joined by pipe, preserving order.
 */
export function computeHeaderSignatureStrict(headers: string[]): string {
    const normalized = headers.map(normalizeHeader)
    const joined = normalized.join('|')
    return createHash('sha256').update(joined).digest('hex')
}

/**
 * Computes a loose signature: SHA256 of normalized headers, sorted alphabetically.
 * Allows matching even if columns are reordered.
 */
export function computeHeaderSignatureLoose(headers: string[]): string {
    const normalized = headers.map(normalizeHeader).filter(h => h.length > 0).sort()
    const joined = normalized.join('|')
    return createHash('sha256').update(joined).digest('hex')
}

/**
 * Calculate similarity score between current headers and a template.
 * Score 0..1 based on Jaccard index of normalized headers.
 * Bonus: if strict signature matches (though usually we check that separately).
 */
export function scoreTemplateMatch(templateHeaders: string[], currentHeaders: string[]): number {
    const tSet = new Set(templateHeaders)
    const cSet = new Set(currentHeaders.map(normalizeHeader))

    // Intersection
    let intersection = 0
    cSet.forEach(h => {
        if (tSet.has(h)) intersection++
    })

    // Union
    const union = new Set([...tSet, ...cSet]).size

    if (union === 0) return 0
    return intersection / union
}
