import * as XLSX from 'xlsx';

// ── Types ──────────────────────────────────────────────────────────────

export interface ParseWarning {
    row: number;
    column: string;
    message: string;
}

export interface ImportSignals {
    hasAgencyColumn: boolean;
    hasFreightPaidColumn: boolean;
    addressHasAgenciaKeyword: boolean;
    suggestedServiceType: string | null;
    confidence: number;
    reasons: string[];
}

export interface ParseResult {
    sheetNames: string[];
    selectedSheet: string;
    headers: string[];
    sampleRows: Record<string, string>[];
    totalRows: number;
    warnings: ParseWarning[];
    requiredCandidates: string[];
    relevantCandidates: string[];
    signals: ImportSignals;
}

export interface ParseError {
    code: 'INVALID_FILE' | 'SHEET_NOT_FOUND' | 'FILE_TOO_LARGE' | 'EMPTY_FILE';
    message: string;
}

// Max file size: 10 MB
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Max sample rows to return in preview
const MAX_SAMPLE_ROWS = 50;

// Patterns that identify "required" / key fields (case-insensitive)
const REQUIRED_PATTERNS = [
    /nombre/i, /name/i,
    /direcci[oó]n/i, /address/i,
    /tel[eé]fono/i, /phone/i, /celular/i, /mobile/i,
    /ciudad/i, /city/i, /localidad/i,
    /departamento/i, /department/i,
    /c[oó]digo\s*postal/i, /zip/i, /postal/i,
];

// Patterns that identify "relevant" (non-required but useful) fields
const RELEVANT_PATTERNS = [
    /agencia/i, /transporte/i, /courier/i,
    /flete\s*pago/i, /flete/i, /pago\s*flete/i, /freight/i,
    /observaci[oó]n/i, /obs/i, /nota/i, /notes/i,
    /descripci[oó]n/i, /contenido/i, /description/i,
    /bultos?/i, /paquetes?/i, /packages?/i,
    /peso/i, /weight/i, /kilo/i,
    /costo/i, /precio/i, /cost/i, /price/i,
    /email/i, /correo/i, /e-?mail/i,
    /tama[ñn]o/i, /size/i,
];

// ── Specific signal patterns ───────────────────────────────────────────

const AGENCY_HEADER_PATTERN = /agencia|transporte|courier/i;
const FREIGHT_PAID_HEADER_PATTERN = /flete\s*pago|flete|pago\s*flete/i;
const ADDRESS_AGENCIA_PATTERN = /agencia/i;

// ── CSV separator autodetect ───────────────────────────────────────────

function detectCsvSeparator(text: string): string {
    const lines = text.split(/\r?\n/).slice(0, 5).join('\n');
    const semicolons = (lines.match(/;/g) || []).length;
    const commas = (lines.match(/,/g) || []).length;
    return semicolons > commas ? ';' : ',';
}

// ── Signal detection ───────────────────────────────────────────────────

function detectSignals(
    headers: string[],
    sampleRows: Record<string, string>[]
): ImportSignals {
    const hasAgencyColumn = headers.some(h => AGENCY_HEADER_PATTERN.test(h));
    const hasFreightPaidColumn = headers.some(h => FREIGHT_PAID_HEADER_PATTERN.test(h));

    // Check if address column contains "Agencia" keyword in >50% of rows
    const addressHeaders = headers.filter(h => /direcci[oó]n|address/i.test(h));
    let addressHasAgenciaKeyword = false;
    if (addressHeaders.length > 0 && sampleRows.length > 0) {
        const addressCol = addressHeaders[0];
        const totalWithValue = sampleRows.filter(r => r[addressCol]?.trim()).length;
        if (totalWithValue > 0) {
            const withAgencia = sampleRows.filter(r => ADDRESS_AGENCIA_PATTERN.test(r[addressCol] || '')).length;
            addressHasAgenciaKeyword = (withAgencia / totalWithValue) > 0.5;
        }
    }

    // Determine suggested service type
    let suggestedServiceType: string | null = null;
    let confidence = 0;
    const reasons: string[] = [];

    if (hasAgencyColumn) {
        suggestedServiceType = 'despacho_agencia';
        confidence += 0.5;
        reasons.push('Se detectó una columna de agencia/transporte');
    }
    if (addressHasAgenciaKeyword) {
        suggestedServiceType = 'despacho_agencia';
        confidence += 0.3;
        reasons.push('Más del 50% de las direcciones contienen "Agencia"');
    }
    if (hasFreightPaidColumn) {
        if (suggestedServiceType === 'despacho_agencia') {
            confidence += 0.2;
        } else {
            suggestedServiceType = 'despacho_agencia';
            confidence += 0.3;
        }
        reasons.push('Se detectó una columna de flete pago');
    }

    confidence = Math.min(confidence, 1.0);

    return {
        hasAgencyColumn,
        hasFreightPaidColumn,
        addressHasAgenciaKeyword,
        suggestedServiceType,
        confidence,
        reasons,
    };
}

// ── Main parse function ────────────────────────────────────────────────

export function parseImportFile(
    buffer: ArrayBuffer,
    fileName: string,
    sheetName?: string
): ParseResult | ParseError {
    const ext = fileName.toLowerCase().split('.').pop();

    if (!ext || !['xlsx', 'xls', 'csv'].includes(ext)) {
        return {
            code: 'INVALID_FILE',
            message: `Tipo de archivo no soportado: .${ext || '(sin extensión)'}. Usa .xlsx o .csv`,
        };
    }

    let workbook: XLSX.WorkBook;

    try {
        if (ext === 'csv') {
            const text = new TextDecoder('utf-8').decode(buffer);
            if (!text.trim()) {
                return { code: 'EMPTY_FILE', message: 'El archivo está vacío.' };
            }
            const sep = detectCsvSeparator(text);
            workbook = XLSX.read(text, { type: 'string', FS: sep });
        } else {
            workbook = XLSX.read(buffer, { type: 'array' });
        }
    } catch {
        return {
            code: 'INVALID_FILE',
            message: 'No se pudo leer el archivo. Verificá que sea un xlsx/csv válido.',
        };
    }

    const sheetNames = workbook.SheetNames;
    if (sheetNames.length === 0) {
        return { code: 'EMPTY_FILE', message: 'El archivo no contiene hojas.' };
    }

    // Select sheet
    const selectedSheet = sheetName && sheetNames.includes(sheetName)
        ? sheetName
        : sheetName && !sheetNames.includes(sheetName)
            ? undefined
            : sheetNames[0];

    if (!selectedSheet) {
        return {
            code: 'SHEET_NOT_FOUND',
            message: `Hoja "${sheetName}" no encontrada. Hojas disponibles: ${sheetNames.join(', ')}`,
        };
    }

    const worksheet = workbook.Sheets[selectedSheet];
    const rawData: string[][] = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
    });

    if (rawData.length === 0) {
        return { code: 'EMPTY_FILE', message: `La hoja "${selectedSheet}" está vacía.` };
    }

    // Headers = first row, trimmed
    const headers = rawData[0].map((h) => String(h).trim());
    const dataRows = rawData.slice(1);
    const totalRows = dataRows.length;

    // Convert to objects (sample)
    const sampleRows = dataRows.slice(0, MAX_SAMPLE_ROWS).map((row) => {
        const obj: Record<string, string> = {};
        headers.forEach((header, i) => {
            obj[header] = row[i] != null ? String(row[i]).trim() : '';
        });
        return obj;
    });

    // Detect required candidates
    const requiredCandidates = headers.filter((header) =>
        REQUIRED_PATTERNS.some((pattern) => pattern.test(header))
    );

    // Detect relevant candidates (excluding those already in required)
    const relevantCandidates = headers.filter((header) =>
        !requiredCandidates.includes(header) &&
        RELEVANT_PATTERNS.some((pattern) => pattern.test(header))
    );

    // Detect import signals (heuristic, no AI)
    const signals = detectSignals(headers, sampleRows);

    // Generate warnings for empty required-candidate cells
    const warnings: ParseWarning[] = [];
    sampleRows.forEach((row, rowIdx) => {
        requiredCandidates.forEach((col) => {
            if (!row[col]) {
                warnings.push({
                    row: rowIdx + 2,
                    column: col,
                    message: 'Campo vacío',
                });
            }
        });
    });

    return {
        sheetNames,
        selectedSheet,
        headers,
        sampleRows,
        totalRows,
        warnings,
        requiredCandidates,
        relevantCandidates,
        signals,
    };
}

// ── Type guard ─────────────────────────────────────────────────────────

export function isParseError(result: ParseResult | ParseError): result is ParseError {
    return 'code' in result;
}
