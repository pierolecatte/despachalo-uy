import { describe, it, expect } from 'vitest';
import {
    normalizeHeader,
    computeHeaderSignatureStrict,
    computeHeaderSignatureLoose,
    scoreTemplateMatch,
} from '@/lib/import/templates';

describe('Import Templates Logic', () => {

    describe('normalizeHeader', () => {
        it('lowercases and trims', () => {
            expect(normalizeHeader('  Nombre  ')).toBe('nombre');
            expect(normalizeHeader('EMAIL')).toBe('email');
        });

        it('removes accents/diacritics', () => {
            expect(normalizeHeader('Dirección')).toBe('direccion');
            expect(normalizeHeader('Teléfono')).toBe('telefono');
        });

        it('collapses spaces', () => {
            expect(normalizeHeader('Nombre   Completo')).toBe('nombre completo');
        });

        it('removes punctuation and replaces with space', () => {
            expect(normalizeHeader('FLETE_PAGO')).toBe('flete pago');
            expect(normalizeHeader('Fecha-Envio')).toBe('fecha envio');
            expect(normalizeHeader('Nombre (Destinatario)')).toBe('nombre destinatario');
            expect(normalizeHeader('Calle.Numero')).toBe('calle numero');
        });

        it('handles complex cases', () => {
            expect(normalizeHeader('  DIRECCIÓN - (Calle/Nro.)  ')).toBe('direccion calle nro');
        });
    });

    describe('Signatures', () => {
        const headersA = ['Nombre', 'Dirección', 'Teléfono'];
        const headersB = ['Nombre', 'Dirección', 'Teléfono']; // Identical
        const headersC = ['Dirección', 'Nombre', 'Teléfono']; // Different order
        const headersD = ['Nombre', 'Dirección']; // Missing one

        it('computeHeaderSignatureStrict: same headers same order -> equal', () => {
            expect(computeHeaderSignatureStrict(headersA)).toBe(computeHeaderSignatureStrict(headersB));
        });

        it('computeHeaderSignatureStrict: different order -> different', () => {
            expect(computeHeaderSignatureStrict(headersA)).not.toBe(computeHeaderSignatureStrict(headersC));
        });

        it('computeHeaderSignatureLoose: different order -> equal', () => {
            expect(computeHeaderSignatureLoose(headersA)).toBe(computeHeaderSignatureLoose(headersC));
        });

        it('computeHeaderSignatureLoose: missing header -> different', () => {
            expect(computeHeaderSignatureLoose(headersA)).not.toBe(computeHeaderSignatureLoose(headersD));
        });
    });

    describe('scoreTemplateMatch', () => {
        // Mock template headers (store as normalized usually, but function takes raw or normalized?)
        // The function in templates.ts takes (templateHeaders, currentHeaders).
        // Let's assume templateHeaders are already normalized in DB, but the current logic re-normalizes currentHeaders.
        // Wait, `scoreTemplateMatch` implementation:
        // export function scoreTemplateMatch(templateHeaders: string[], currentHeaders: string[]) {
        //     const tSet = new Set(templateHeaders)  <-- Expects normalized input?
        //     const cSet = new Set(currentHeaders.map(normalizeHeader)) <-- Normalizes input
        // }
        // The DB stores `normalized_headers` which are normalized.

        const templateHeaders = ['nombre', 'direccion', 'telefono', 'email'];

        it('returns 1.0 for exact match (order ignored)', () => {
            // Note: scoreTemplateMatch uses Sets, so order doesn't matter
            const current = ['Nombre', 'Dirección', 'Teléfono', 'Email'];
            expect(scoreTemplateMatch(templateHeaders, current)).toBe(1);
        });

        it('returns 1.0 for exact match different order', () => {
            const current = ['Email', 'Teléfono', 'Dirección', 'Nombre'];
            expect(scoreTemplateMatch(templateHeaders, current)).toBe(1);
        });

        it('penalizes missing columns', () => {
            // Intersection: 3 (nombre, direccion, telefono). Union: 4 (email is in template but not current).
            // Union size: {nombre, direccion, telefono, email} = 4.
            // Score = 3/4 = 0.75
            const current = ['Nombre', 'Dirección', 'Teléfono'];
            expect(scoreTemplateMatch(templateHeaders, current)).toBe(0.75);
        });

        it('penalizes extra columns', () => {
            // Template: 4. Current: 5 (adds 'Notas').
            // Intersection: 4. Union: 5.
            // Score = 4/5 = 0.8
            const current = ['Nombre', 'Dirección', 'Teléfono', 'Email', 'Notas'];
            expect(scoreTemplateMatch(templateHeaders, current)).toBe(0.8);
        });

        it('returns low score for mismatch', () => {
            const current = ['Fecha', 'Monto', 'Agencia'];
            // Intersection: 0. Union: 7. Score: 0.
            expect(scoreTemplateMatch(templateHeaders, current)).toBe(0);
        });

        it('returns partial score', () => {
            const current = ['Nombre', 'Fecha'];
            // Intersection: 1 ('nombre'). Union: 5 ('nombre', 'direccion', 'telefono', 'email', 'fecha').
            // Score: 1/5 = 0.2
            expect(scoreTemplateMatch(templateHeaders, current)).toBe(0.2);
        });
    });
});
