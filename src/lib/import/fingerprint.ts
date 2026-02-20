// ── Header fingerprinting for import templates ─────────────────────────

/**
 * Normalize a header string for fingerprinting:
 * - lowercase, trim
 * - remove diacritics/tildes
 * - replace underscores/hyphens with spaces
 * - collapse multiple spaces
 */
export function normalizeHeader(header: string): string {
    return header
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // strip diacritics
        .replace(/[_\-]/g, ' ')          // underscores/hyphens → space
        .replace(/\s+/g, ' ')            // collapse spaces
        .trim();
}

/**
 * Compute a fingerprint for a set of headers (order matters).
 * Uses a simple hash since we don't need cryptographic strength.
 */
export function computeFingerprint(headers: string[]): string {
    const normalized = headers.map(normalizeHeader);
    const joined = normalized.join('|');
    return simpleHash(joined);
}

/**
 * Compute a sorted fingerprint (order doesn't matter).
 * Useful as fallback when headers are same but reordered.
 */
export function computeFingerprintSorted(headers: string[]): string {
    const normalized = headers.map(normalizeHeader).sort();
    const joined = normalized.join('|');
    return simpleHash(joined);
}

/**
 * Simple non-cryptographic hash (djb2 variant).
 * Produces a hex string — good enough for fingerprinting headers.
 */
function simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
    }
    // Convert to unsigned 32-bit hex
    return (hash >>> 0).toString(16).padStart(8, '0');
}
