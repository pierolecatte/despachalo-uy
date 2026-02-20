import { describe, it, expect } from 'vitest';
import {
    parseFreightPaid,
    normalizePhone,
    trimValue,
    applyTransform,
    applyMappingToRow,
} from '@/lib/import/import-schema';

// ── parseFreightPaid ───────────────────────────────────────────────────

describe('parseFreightPaid', () => {
    it.each([
        ['SI', true], ['sí', true], ['SÍ', true],
        ['PAGO', true], ['Pago', true],
        ['FLETE PAGO', true], ['flete pago', true],
        ['1', true], ['TRUE', true], ['true', true], ['yes', true],
    ])('parses "%s" as true', (input, expected) => {
        expect(parseFreightPaid(input)).toBe(expected);
    });

    it.each([
        ['NO', false], ['no', false],
        ['0', false], ['FALSE', false], ['false', false],
    ])('parses "%s" as false', (input, expected) => {
        expect(parseFreightPaid(input)).toBe(expected);
    });

    it.each([
        ['', null], ['quizás', null], ['N/A', null], ['pendiente', null],
    ])('returns null for "%s"', (input, expected) => {
        expect(parseFreightPaid(input)).toBe(expected);
    });
});

// ── normalizePhone ─────────────────────────────────────────────────────

describe('normalizePhone', () => {
    it('removes spaces, dashes, dots, parentheses', () => {
        expect(normalizePhone('099 123 456')).toBe('099123456');
        expect(normalizePhone('(099) 123-456')).toBe('099123456');
        expect(normalizePhone('+598.99.123.456')).toBe('59899123456');
        expect(normalizePhone('099-123-456')).toBe('099123456');
    });

    it('returns empty string for empty input', () => {
        expect(normalizePhone('')).toBe('');
    });
});

// ── trimValue ──────────────────────────────────────────────────────────

describe('trimValue', () => {
    it('trims whitespace', () => {
        expect(trimValue('  hello  ')).toBe('hello');
    });

    it('handles null/undefined', () => {
        expect(trimValue('')).toBe('');
    });
});

// ── applyTransform ─────────────────────────────────────────────────────

describe('applyTransform', () => {
    it('transforms freight_paid field', () => {
        expect(applyTransform('SI', 'is_freight_paid')).toBe(true);
        expect(applyTransform('NO', 'is_freight_paid')).toBe(false);
    });

    it('transforms phone field', () => {
        expect(applyTransform('099 123 456', 'recipient_phone')).toBe('099123456');
    });

    it('transforms numeric fields', () => {
        expect(applyTransform('1.5', 'weight_kg')).toBe(1.5);
        expect(applyTransform('2500', 'shipping_cost')).toBe(2500);
        expect(applyTransform('1,5', 'freight_amount')).toBe(1.5); // comma → dot
        expect(applyTransform('abc', 'weight_kg')).toBe(null);
    });

    it('trims string fields', () => {
        expect(applyTransform('  Juan Pérez  ', 'recipient_name')).toBe('Juan Pérez');
    });

    it('returns null for empty strings', () => {
        expect(applyTransform('', 'recipient_name')).toBe(null);
    });
});

// ── applyMappingToRow ──────────────────────────────────────────────────

describe('applyMappingToRow', () => {
    it('applies mappings correctly', () => {
        const row = { 'Nombre': 'Juan', 'Tel': '099 111 222', 'Flete': 'PAGO', 'Peso': '2.5' };
        const mappings = [
            { sourceHeader: 'Nombre', targetField: 'recipient_name' as const, confidence: 1 },
            { sourceHeader: 'Tel', targetField: 'recipient_phone' as const, confidence: 1 },
            { sourceHeader: 'Flete', targetField: 'is_freight_paid' as const, confidence: 0.8 },
            { sourceHeader: 'Peso', targetField: 'weight_kg' as const, confidence: 0.9 },
        ];

        const result = applyMappingToRow(row, mappings);
        expect(result.recipient_name).toBe('Juan');
        expect(result.recipient_phone).toBe('099111222');
        expect(result.is_freight_paid).toBe(true);
        expect(result.weight_kg).toBe(2.5);
    });

    it('ignores _ignore mappings', () => {
        const row = { 'Col1': 'data', 'Col2': 'noise' };
        const mappings = [
            { sourceHeader: 'Col1', targetField: 'recipient_name' as const, confidence: 1 },
            { sourceHeader: 'Col2', targetField: '_ignore' as const, confidence: 1 },
        ];

        const result = applyMappingToRow(row, mappings);
        expect(result.recipient_name).toBe('data');
        expect(result).not.toHaveProperty('_ignore');
    });
});
