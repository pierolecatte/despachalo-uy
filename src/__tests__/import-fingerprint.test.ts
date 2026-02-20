import { describe, it, expect } from 'vitest';
import {
    normalizeHeader,
    computeFingerprint,
    computeFingerprintSorted,
} from '@/lib/import/fingerprint';

// ── normalizeHeader ────────────────────────────────────────────────────

describe('normalizeHeader', () => {
    it('lowercases and trims', () => {
        expect(normalizeHeader('  Nombre  ')).toBe('nombre');
    });

    it('strips diacritics/tildes', () => {
        expect(normalizeHeader('Dirección')).toBe('direccion');
        expect(normalizeHeader('Teléfono')).toBe('telefono');
        expect(normalizeHeader('código')).toBe('codigo');
    });

    it('replaces underscores and hyphens with spaces', () => {
        expect(normalizeHeader('flete_pago')).toBe('flete pago');
        expect(normalizeHeader('flete-pago')).toBe('flete pago');
    });

    it('collapses multiple spaces', () => {
        expect(normalizeHeader('nombre   del   destinatario')).toBe('nombre del destinatario');
    });

    it('handles combined transformations', () => {
        expect(normalizeHeader('  Nombre_Destinatario  ')).toBe('nombre destinatario');
        expect(normalizeHeader('DIRECCIÓN-ENVÍO')).toBe('direccion envio');
    });
});

// ── computeFingerprint ─────────────────────────────────────────────────

describe('computeFingerprint', () => {
    it('returns an 8-char hex string', () => {
        const fp = computeFingerprint(['Nombre', 'Dirección', 'Teléfono']);
        expect(fp).toMatch(/^[0-9a-f]{8}$/);
    });

    it('same headers produce same fingerprint', () => {
        const a = computeFingerprint(['Nombre', 'Dirección', 'Teléfono']);
        const b = computeFingerprint(['Nombre', 'Dirección', 'Teléfono']);
        expect(a).toBe(b);
    });

    it('different order produces different fingerprint', () => {
        const a = computeFingerprint(['Nombre', 'Dirección']);
        const b = computeFingerprint(['Dirección', 'Nombre']);
        expect(a).not.toBe(b);
    });

    it('is case-insensitive', () => {
        const a = computeFingerprint(['Nombre', 'DIRECCIÓN']);
        const b = computeFingerprint(['nombre', 'dirección']);
        expect(a).toBe(b);
    });

    it('ignores diacritics', () => {
        const a = computeFingerprint(['Dirección']);
        const b = computeFingerprint(['Direccion']);
        expect(a).toBe(b);
    });

    it('treats underscores and hyphens as spaces', () => {
        const a = computeFingerprint(['flete_pago']);
        const b = computeFingerprint(['flete-pago']);
        const c = computeFingerprint(['flete pago']);
        expect(a).toBe(b);
        expect(b).toBe(c);
    });
});

// ── computeFingerprintSorted ───────────────────────────────────────────

describe('computeFingerprintSorted', () => {
    it('same headers in different order produce same sorted fingerprint', () => {
        const a = computeFingerprintSorted(['Nombre', 'Dirección', 'Teléfono']);
        const b = computeFingerprintSorted(['Teléfono', 'Nombre', 'Dirección']);
        expect(a).toBe(b);
    });

    it('different headers produce different sorted fingerprint', () => {
        const a = computeFingerprintSorted(['Nombre', 'Dirección']);
        const b = computeFingerprintSorted(['Nombre', 'Teléfono']);
        expect(a).not.toBe(b);
    });
});
