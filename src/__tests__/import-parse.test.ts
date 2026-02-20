import { describe, it, expect } from 'vitest';
import { parseImportFile, isParseError, MAX_FILE_SIZE } from '@/lib/import/parse-file';
import * as XLSX from 'xlsx';
import type { ImportSignals } from '@/lib/import/parse-file';

// ── Helpers ────────────────────────────────────────────────────────────

function createXlsxBuffer(sheets: Record<string, string[][]>): ArrayBuffer {
    const wb = XLSX.utils.book_new();
    for (const [name, data] of Object.entries(sheets)) {
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, name);
    }
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    return buf;
}

function createCsvString(rows: string[][], separator = ','): string {
    return rows.map(r => r.join(separator)).join('\n');
}

function csvToBuffer(csv: string): ArrayBuffer {
    return new TextEncoder().encode(csv).buffer as ArrayBuffer;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('parseImportFile', () => {

    // ── XLSX tests ─────────────────────────────────────────────────────

    describe('xlsx parsing', () => {
        it('parses a simple xlsx with headers and rows', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Dirección', 'Teléfono', 'Ciudad'],
                    ['Juan', 'Av. 18 de Julio 1234', '099123456', 'Montevideo'],
                    ['María', 'Bvar. Artigas 567', '098765432', 'Salto'],
                ],
            });

            const result = parseImportFile(buffer, 'test.xlsx');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.sheetNames).toEqual(['Envios']);
            expect(result.selectedSheet).toBe('Envios');
            expect(result.headers).toEqual(['Nombre', 'Dirección', 'Teléfono', 'Ciudad']);
            expect(result.totalRows).toBe(2);
            expect(result.sampleRows).toHaveLength(2);
            expect(result.sampleRows[0]).toEqual({
                'Nombre': 'Juan',
                'Dirección': 'Av. 18 de Julio 1234',
                'Teléfono': '099123456',
                'Ciudad': 'Montevideo',
            });
        });

        it('lists multiple sheet names and selects first by default', () => {
            const buffer = createXlsxBuffer({
                'Hoja1': [['A'], ['1']],
                'Hoja2': [['B'], ['2']],
                'Hoja3': [['C'], ['3']],
            });

            const result = parseImportFile(buffer, 'test.xlsx');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.sheetNames).toEqual(['Hoja1', 'Hoja2', 'Hoja3']);
            expect(result.selectedSheet).toBe('Hoja1');
        });

        it('selects a specific sheet when provided', () => {
            const buffer = createXlsxBuffer({
                'Hoja1': [['A'], ['1']],
                'Datos': [['Nombre', 'Phone'], ['Ana', '099111']],
            });

            const result = parseImportFile(buffer, 'test.xlsx', 'Datos');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.selectedSheet).toBe('Datos');
            expect(result.headers).toEqual(['Nombre', 'Phone']);
        });

        it('returns SHEET_NOT_FOUND for nonexistent sheet', () => {
            const buffer = createXlsxBuffer({
                'Hoja1': [['A'], ['1']],
            });

            const result = parseImportFile(buffer, 'test.xlsx', 'NoExiste');
            expect(isParseError(result)).toBe(true);
            if (!isParseError(result)) return;
            expect(result.code).toBe('SHEET_NOT_FOUND');
        });
    });

    // ── CSV tests ──────────────────────────────────────────────────────

    describe('csv parsing', () => {
        it('parses a comma-separated CSV', () => {
            const csv = createCsvString([
                ['Nombre', 'Dirección', 'Teléfono'],
                ['Carlos', 'Calle 1', '099222333'],
            ]);
            const buffer = csvToBuffer(csv);

            const result = parseImportFile(buffer, 'test.csv');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.headers).toEqual(['Nombre', 'Dirección', 'Teléfono']);
            expect(result.sampleRows[0]['Nombre']).toBe('Carlos');
        });

        it('autodetects semicolon separator', () => {
            const csv = 'Nombre;Dirección;Teléfono\nPedro;Av. Italia 999;099444555';
            const buffer = csvToBuffer(csv);

            const result = parseImportFile(buffer, 'data.csv');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.headers).toEqual(['Nombre', 'Dirección', 'Teléfono']);
            expect(result.sampleRows[0]['Nombre']).toBe('Pedro');
            expect(result.sampleRows[0]['Dirección']).toBe('Av. Italia 999');
        });
    });

    // ── Warnings & required candidates ─────────────────────────────────

    describe('warnings and requiredCandidates', () => {
        it('detects required candidate headers', () => {
            const buffer = createXlsxBuffer({
                'S1': [
                    ['Nombre', 'Dirección', 'Teléfono', 'Obs', 'Ciudad'],
                    ['A', 'B', 'C', 'D', 'E'],
                ],
            });

            const result = parseImportFile(buffer, 'test.xlsx');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.requiredCandidates).toContain('Nombre');
            expect(result.requiredCandidates).toContain('Dirección');
            expect(result.requiredCandidates).toContain('Teléfono');
            expect(result.requiredCandidates).toContain('Ciudad');
            expect(result.requiredCandidates).not.toContain('Obs');
        });

        it('generates warnings for empty required-candidate cells', () => {
            const buffer = createXlsxBuffer({
                'S1': [
                    ['Nombre', 'Dirección', 'Teléfono'],
                    ['Juan', 'Calle 1', ''],         // row 2: empty Teléfono
                    ['', 'Calle 2', '099111222'],     // row 3: empty Nombre
                ],
            });

            const result = parseImportFile(buffer, 'test.xlsx');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.warnings.length).toBe(2);
            expect(result.warnings).toContainEqual({
                row: 2, column: 'Teléfono', message: 'Campo vacío',
            });
            expect(result.warnings).toContainEqual({
                row: 3, column: 'Nombre', message: 'Campo vacío',
            });
        });
    });

    // ── Error handling ─────────────────────────────────────────────────

    describe('error handling', () => {
        it('rejects unsupported file extensions', () => {
            const buffer = new ArrayBuffer(10);
            const result = parseImportFile(buffer, 'document.pdf');
            expect(isParseError(result)).toBe(true);
            if (!isParseError(result)) return;
            expect(result.code).toBe('INVALID_FILE');
        });

        it('rejects empty CSV files', () => {
            const buffer = csvToBuffer('');
            const result = parseImportFile(buffer, 'empty.csv');
            expect(isParseError(result)).toBe(true);
            if (!isParseError(result)) return;
            expect(result.code).toBe('EMPTY_FILE');
        });

        it('exports MAX_FILE_SIZE constant', () => {
            expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
        });
    });

    // ── Sample row limits ──────────────────────────────────────────────

    describe('sample row limiting', () => {
        it('limits sample rows to 50', () => {
            const rows: string[][] = [['Nombre']];
            for (let i = 0; i < 100; i++) {
                rows.push([`Person ${i}`]);
            }
            const buffer = createXlsxBuffer({ 'S1': rows });

            const result = parseImportFile(buffer, 'test.xlsx');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.sampleRows).toHaveLength(50);
            expect(result.totalRows).toBe(100);
        });
    });

    // ── Relevant candidates ─────────────────────────────────────────────

    describe('relevantCandidates', () => {
        it('detects agency and flete pago columns as relevant', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Dirección', 'Agencia', 'Flete Pago', 'Observaciones'],
                    ['Juan', 'Calle 1', 'DAC', 'SI', 'Frágil'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            expect(result.relevantCandidates).toContain('Agencia');
            expect(result.relevantCandidates).toContain('Flete Pago');
            expect(result.relevantCandidates).toContain('Observaciones');
        });

        it('does not duplicate fields already in requiredCandidates', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre Destinatario', 'Agencia transporte', 'Email'],
                    ['Juan', 'DAC', 'j@x.com'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            expect(isParseError(result)).toBe(false);
            if (isParseError(result)) return;

            // 'Email' matches /email/i in RELEVANT_PATTERNS but also matches nothing in REQUIRED
            // 'Nombre Destinatario' matches /nombre/i in REQUIRED — should NOT appear in relevant
            expect(result.requiredCandidates).toContain('Nombre Destinatario');
            expect(result.relevantCandidates).not.toContain('Nombre Destinatario');
            expect(result.relevantCandidates).toContain('Agencia transporte');
        });
    });

    // ── Import signals ──────────────────────────────────────────────────

    describe('signals', () => {
        it('detects hasAgencyColumn when header matches /agencia/i', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Agencia'],
                    ['Juan', 'DAC'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            if (isParseError(result)) throw new Error('parse error');

            expect(result.signals.hasAgencyColumn).toBe(true);
            expect(result.signals.suggestedServiceType).toBe('despacho_agencia');
            expect(result.signals.confidence).toBeGreaterThanOrEqual(0.5);
            expect(result.signals.reasons.length).toBeGreaterThan(0);
        });

        it('detects hasFreightPaidColumn', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Flete Pago'],
                    ['Juan', 'SI'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            if (isParseError(result)) throw new Error('parse error');

            expect(result.signals.hasFreightPaidColumn).toBe(true);
            expect(result.signals.suggestedServiceType).toBe('despacho_agencia');
        });

        it('detects addressHasAgenciaKeyword when >50% of addresses contain Agencia', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Dirección'],
                    ['Juan', 'Calle 1 - Agencia DAC'],
                    ['María', 'Av. 2 - Agencia Mirtrans'],
                    ['Pedro', 'Ruta 5 Agencia Central'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            if (isParseError(result)) throw new Error('parse error');

            expect(result.signals.addressHasAgenciaKeyword).toBe(true);
            expect(result.signals.suggestedServiceType).toBe('despacho_agencia');
        });

        it('does NOT suggest despacho_agencia when no agency or freight columns', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Dirección', 'Teléfono'],
                    ['Juan', 'Calle 1', '099123456'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            if (isParseError(result)) throw new Error('parse error');

            expect(result.signals.hasAgencyColumn).toBe(false);
            expect(result.signals.hasFreightPaidColumn).toBe(false);
            expect(result.signals.addressHasAgenciaKeyword).toBe(false);
            expect(result.signals.suggestedServiceType).toBeNull();
            expect(result.signals.confidence).toBe(0);
        });

        it('has higher confidence when agency + freight columns both present', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Agencia', 'Flete Pago'],
                    ['Juan', 'DAC', 'SI'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            if (isParseError(result)) throw new Error('parse error');

            expect(result.signals.confidence).toBeGreaterThanOrEqual(0.7);
            expect(result.signals.reasons.length).toBeGreaterThanOrEqual(2);
        });

        it('detects transporte header as agency column', () => {
            const buffer = createXlsxBuffer({
                'Envios': [
                    ['Nombre', 'Transporte'],
                    ['Juan', 'DAC'],
                ],
            });
            const result = parseImportFile(buffer, 'test.xlsx');
            if (isParseError(result)) throw new Error('parse error');

            expect(result.signals.hasAgencyColumn).toBe(true);
            expect(result.signals.suggestedServiceType).toBe('despacho_agencia');
        });
    });
});
